# Skill RAG + Embedding 升级 — 设计

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                     EmbeddingProvider                     │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ TransformersProvider │  │ SimpleEmbeddingProvider   │  │
│  │ (MiniLM-L6-v2 384d) │  │ (n-gram 128d, fallback)  │  │
│  └─────────────────────┘  └──────────────────────────┘  │
└────────────────┬────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
  ┌─────▼──────┐   ┌─────▼──────┐
  │ MemoryDB   │   │ SkillRAG   │
  │ (existing) │   │ Retriever  │
  │ 128→384d   │   │ (new)      │
  │ migration  │   │            │
  └────────────┘   └─────┬──────┘
                         │
                   ┌─────▼──────┐
                   │skill_search│
                   │  (升级)     │
                   └─────┬──────┘
                         │
                   ┌─────▼──────────┐
                   │ Interactive    │
                   │ Confirmation   │
                   │ (:::interactive)│
                   └────────────────┘
```

## 2. TransformersEmbeddingProvider

**文件**：`packages/core/src/memory/embeddings.ts`（扩展）

```typescript
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 384
  private pipe: FeatureExtractionPipeline | null = null
  private initPromise: Promise<void> | null = null

  constructor(private modelPath?: string) {}

  async initialize(): Promise<void> {
    if (this.pipe) return
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      this.pipe = await pipeline('feature-extraction', 
        this.modelPath || 'Xenova/all-MiniLM-L6-v2', {
          quantized: true,      // ONNX int8 量化, ~22MB
          revision: 'main',
        })
    })()
    return this.initPromise
  }

  async embed(text: string): Promise<number[]> {
    await this.initialize()
    const output = await this.pipe!(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data as Float32Array)
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.initialize()
    return Promise.all(texts.map(t => this.embed(t)))
  }
}
```

### 2.1 初始化与降级

```typescript
// packages/core/src/memory/embeddings.ts

export async function createEmbeddingProvider(
  modelPath?: string
): Promise<EmbeddingProvider> {
  try {
    const provider = new TransformersEmbeddingProvider(modelPath)
    await provider.initialize()
    return provider
  } catch (err) {
    console.warn('[Embedding] TransformersProvider failed, falling back to SimpleProvider:', err)
    return new SimpleEmbeddingProvider()
  }
}
```

### 2.2 模型路径解析

Tauri 运行时通过 `resolveResource('models/onnx/all-MiniLM-L6-v2')` 获取打包路径，传给 `createEmbeddingProvider()`。开发模式自动从 HuggingFace 下载。

## 3. SkillRAGRetriever

**文件**：`packages/core/src/skills/rag-retriever.ts`（新建）

### 3.1 Skill 分块策略

按 markdown 标题分块，每个 chunk 包含：

| 字段 | 内容 |
|------|------|
| `skillName` | 所属 Skill 名 |
| `chunkId` | `${skillName}#${headingSlug}` |
| `heading` | 标题文本 |
| `content` | 该节正文（含代码块） |
| `embedding` | 384 维向量 |

分块规则：
1. `# / ## / ###` 标题作为分割点
2. 无标题 Skill → 整体作为单个 chunk
3. Skill `description` 单独作为一个 chunk（确保 metadata 也能被语义搜索）
4. 单个 chunk > 2000 字符 → 按段落二次分割

```typescript
interface SkillChunk {
  skillName: string
  chunkId: string
  heading: string
  content: string
  embedding: number[]
}
```

### 3.2 混合检索

```
query → embed(query) → cosine topK(chunks, 20) → rerank by BM25 → top 5
```

复用 `hybrid-search.ts` 中的 `fuseScores()` 进行 BM25 + Cosine 分数融合：

```typescript
export class SkillRAGRetriever {
  private chunks: SkillChunk[] = []
  private provider: EmbeddingProvider
  private db: SkillEmbeddingDB

  async search(query: string, topK = 5): Promise<SkillSearchResult[]> {
    const queryEmb = await this.provider.embed(query)
    
    // Cosine 相似度
    const cosineScores = this.chunks.map(c => ({
      chunk: c,
      score: cosineSimilarity(queryEmb, c.embedding)
    }))
    
    // BM25 分数
    const bm25Scores = this.bm25Score(query, this.chunks)
    
    // 融合
    const fused = fuseScores(cosineScores, bm25Scores, { cosineWeight: 0.7, bm25Weight: 0.3 })
    
    // 按 Skill 去重（同一 Skill 取最高分 chunk）
    const bySkill = new Map<string, { score: number; chunks: SkillChunk[] }>()
    for (const { chunk, score } of fused) {
      const existing = bySkill.get(chunk.skillName)
      if (!existing || score > existing.score) {
        bySkill.set(chunk.skillName, { score, chunks: [chunk] })
      }
    }
    
    return [...bySkill.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK)
      .map(([name, { score, chunks }]) => ({ skillName: name, score, matchedChunks: chunks }))
  }
}
```

### 3.3 SQLite 持久化

**文件**：`packages/core/src/skills/skill-embedding-db.ts`（新建）

表结构：

```sql
CREATE TABLE IF NOT EXISTS skill_chunks (
  chunk_id    TEXT PRIMARY KEY,
  skill_name  TEXT NOT NULL,
  heading     TEXT NOT NULL,
  content     TEXT NOT NULL,
  embedding   BLOB NOT NULL,
  model_id    TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_skill_chunks_skill ON skill_chunks(skill_name);
```

- 启动时：检查 `skill_chunks` 表是否存在且 `model_id` 匹配 → 存在则直接读取 → 否则全量重建
- Skill 变更时：`DELETE FROM skill_chunks WHERE skill_name = ?` + 重新分块嵌入

## 4. skill_search 工具升级

**文件**：`packages/core/src/tools/builtins/skill-search.ts`（修改）

### 4.1 搜索流程

```
Agent 调用 skill_search(query)
  → SkillRAGRetriever.search(query)
  → 匹配到 Skill(s)
  → 返回工具结果 + :::interactive 载荷
```

### 4.2 交互式确认载荷

```typescript
// 工具返回格式
{
  text: `找到匹配技能「${skill.name}」(${skill.description})，相似度 ${score.toFixed(2)}`,
  interactive: {
    type: 'skill-confirm',
    skillName: skill.name,
    score: score,
    preview: skill.body.slice(0, 200),
    actions: [
      { id: 'use', label: '使用此技能', primary: true },
      { id: 'skip', label: '跳过' }
    ]
  }
}
```

### 4.3 用户确认后的 Skill 注入

用户点击「使用此技能」→ 前端发送 `{ action: 'use', skillName }` → Agent 将 Skill body 注入下一轮 System Prompt：

```typescript
// 注入位置：System Prompt 末尾，在 </system> 之前
const skillContext = `\n\n<skill name="${skill.name}">\n${skill.body}\n</skill>`
```

## 5. Memory DB 迁移

**文件**：`packages/core/src/memory/db.ts`（修改）

当前 `embedding BLOB` 存储 128 维 n-gram 向量。迁移策略：

1. 启动时检测已有 embedding 维度（读第一行 BLOB 长度）
2. 如果 = 128 × 4 = 512 bytes → 标记需要迁移
3. **惰性迁移**：Memory 被访问时重新计算 embedding
4. 当前只有 2 条 Memory，迁移即刻完成
5. 后台批量 `backfillEmbeddings()` 已存在，复用即可

## 6. 模型打包

### 6.1 构建脚本

在 `scripts/download-model.mjs` 中：

```javascript
// 从 ModelScope 下载 ONNX 量化模型到 packages/desktop/src-tauri/resources/models/
const MODEL_URL = 'https://www.modelscope.cn/models/sentence-transformers/all-MiniLM-L6-v2'
const FILES = ['onnx/model_quantized.onnx', 'tokenizer.json', 'config.json']
```

### 6.2 Tauri 配置

```json
// tauri.conf.json → bundle → resources
{
  "resources": [
    "resources/models/**/*"
  ]
}
```

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/memory/embeddings.ts` | 修改 | +TransformersProvider, +createEmbeddingProvider() |
| `packages/core/src/skills/rag-retriever.ts` | 新建 | SkillRAGRetriever, 分块+混合检索 |
| `packages/core/src/skills/skill-embedding-db.ts` | 新建 | SQLite 持久化层 |
| `packages/core/src/skills/chunker.ts` | 新建 | Markdown heading 分块器 |
| `packages/core/src/tools/builtins/skill-search.ts` | 修改 | 接入 RAG + 交互式确认 |
| `packages/core/src/memory/db.ts` | 修改 | 128→384 维迁移 |
| `scripts/download-model.mjs` | 新建 | 模型预下载脚本 |
| `packages/desktop/src-tauri/tauri.conf.json` | 修改 | resources 打包模型 |
| `packages/core/package.json` | 修改 | +@huggingface/transformers |
