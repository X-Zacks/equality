# Proposal: Skills RAG + Embedding 升级方案

> 日期：2026-04-23  
> 状态：讨论中  
> 关联：Phase K2（Memory Embeddings）、Phase T（Skills 渐进披露）

---

## 一、当前状态

### Memory 向量检索（已有）
- **Embedding 模型**：`SimpleEmbeddingProvider` — 自研字符 bigram/trigram 哈希，128 维
- **存储**：SQLite `memories` 表 `embedding BLOB` 列
- **检索**：BM25 + Cosine 混合检索（`hybrid-search.ts`）
- **效果**：词汇重叠时有效，语义理解能力弱（"TypeScript 类型系统" 搜不到 "TS 泛型约束"）

### Skills 检索（已有）
- **检索器**：`SkillRetriever` — 仅 BM25 + 精确匹配 + Category 匹配
- **索引内容**：`name + description + category`（**没有索引 body 正文**）
- **数据规模**：38 个 bundled skills，平均 6.3KB/个，总计 ~240KB
- **效果**：关键词不命中就搜不到，无语义理解

### 问题
1. n-gram 哈希不是真正的语义 embedding，语义相似但词汇不同的查询检索失败
2. Skills body（最有价值的内容）完全没参与检索
3. Memory 和 Skills 的检索是割裂的

---

## 二、目标

1. **Skills RAG**：用户/Agent 输入自然语言意图 → 检索到语义最匹配的 Skill（包括 body 内容）
2. **全部本地运行**：不依赖任何外部 API，离线可用
3. **Memory 检索升级**：同时提升 Memory 的语义检索质量
4. **零额外进程**：不启动独立的 embedding server，嵌入 Core 进程

---

## 三、技术方案

### 方案对比

| 方案 | 模型 | 大小 | 依赖 | 首次加载 | 推理速度 | 语义质量 | 离线 |
|------|------|------|------|---------|---------|---------|------|
| **A: ONNX Runtime** | all-MiniLM-L6-v2 | 22MB | `onnxruntime-node` (~40MB) | ~2s | ~5ms/条 | ★★★★ | ✅ |
| **B: transformers.js** | all-MiniLM-L6-v2 | 22MB | `@huggingface/transformers` (~5MB) + WASM | ~3s | ~15ms/条 | ★★★★ | ✅ |
| **C: Ollama embed** | nomic-embed-text | 274MB | Ollama 进程 | ~10s | ~10ms/条 | ★★★★★ | ✅ |
| **D: 当前 n-gram** | 自研 | 0MB | 无 | 0s | <1ms/条 | ★★ | ✅ |

### 推荐：方案 B — `@huggingface/transformers`（WASM/ONNX 自动选择）

**理由**：
- **纯 JS/WASM**：无需编译原生模块，`pnpm add` 即可用，与 SEA 打包兼容
- **自动模型缓存**：首次运行自动从 HuggingFace Hub 下载到 `~/.cache/huggingface/`，后续离线可用
- **支持国内镜像**：可设置 `HF_ENDPOINT=https://hf-mirror.com` 解决国内下载问题
- **all-MiniLM-L6-v2**：384 维，22MB，MIT 许可，中英文通吃
- **Node.js 原生支持**：v3+ 版本支持 Node.js 直接运行（不需要浏览器环境）

**方案 C（Ollama）** 作为可选高级方案：用户自己安装了 Ollama 时自动检测并使用，embedding 质量更高。但不作为默认方案（需要额外安装 274MB 模型）。

---

## 四、架构设计

### 4.1 Embedding Provider 分层

```
EmbeddingProvider 接口（已有）
  ├── SimpleEmbeddingProvider    — 现有 n-gram（保留作为 fallback）
  ├── TransformersEmbeddingProvider  — 新增：@huggingface/transformers
  └── OllamaEmbeddingProvider   — 新增：可选，检测到 Ollama 时使用
```

**自动降级链**：
```
启动时探测：
  Ollama 运行中且有 nomic-embed-text？ → OllamaEmbeddingProvider
  否则 → TransformersEmbeddingProvider（懒加载，首次 embed 时初始化）
  加载失败（如 WASM 不支持）→ SimpleEmbeddingProvider（现有 n-gram）
```

### 4.2 Skills RAG 检索架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    SkillRAGRetriever                              │
│                                                                  │
│  索引构建（启动时 + Skills 变更时）：                                │
│    38 Skills → 每个 Skill 拆分为 chunks：                          │
│      chunk[0]: name + description + category        (元数据)      │
│      chunk[1..N]: body 按段落/标题分块（~500 tokens/块）            │
│    → 每个 chunk 计算 embedding → 存入内存索引                      │
│                                                                  │
│  检索流程：                                                       │
│    query → embed(query) → queryVec                               │
│    → 阶段1: cosine(queryVec, chunk_embeddings) → top-20 chunks   │
│    → 阶段2: 按 Skill 聚合（同一 Skill 多个 chunk 命中 → 合并分数） │
│    → 阶段3: BM25 re-rank（原始 query 对 top Skills 做精排）       │
│    → 返回 top-K Skills + 最相关的 body 片段                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Skill Body 分块策略

```typescript
interface SkillChunk {
  skillName: string       // 归属 Skill
  chunkIndex: number      // 块序号
  text: string            // 块文本
  type: 'meta' | 'body'   // 元数据块 vs 正文块
  heading?: string        // 所属标题（如 "## 使用方法"）
  embedding: Float32Array // 向量
}
```

**分块规则**：
1. **Chunk 0（元数据）**：`{name} — {description}。分类：{category}`
2. **Body 按 Markdown 标题切分**：每个 `##` 标题块独立成 chunk
3. **超长块**：>500 tokens 时在句子边界处二次切分
4. **短块合并**：<100 tokens 的相邻块合并（避免向量质量差）

**38 个 Skills × 平均 ~5 chunks/Skill ≈ 190 个 chunks**
- 内存占用：190 × 384 × 4 bytes ≈ **292KB**（微不足道）
- 首次索引时间：190 chunks × 15ms ≈ **2.8 秒**

### 4.4 Memory 检索升级

现有 `hybrid-search.ts` 的 embedding 部分替换为真正的语义模型：

```
Before: computeEmbeddingBuffer() → n-gram 128维 → cosine
After:  embedProvider.embed()     → MiniLM 384维 → cosine
```

**数据迁移**：
- 已有 embedding BLOB 列（128 维 n-gram）需要 backfill 为 384 维
- `backfillEmbeddings()` 已有框架，只需切换 provider
- 迁移在后台异步执行，不阻塞启动

### 4.5 存储方案

| 数据 | 存储位置 | 原因 |
|------|---------|------|
| Skill chunk embeddings | **内存**（启动时计算） | 只有 ~190 chunks、292KB，Skills 可能变更 |
| Memory embeddings | **SQLite BLOB**（已有） | 持久化，数量可能增长到 10K+ |
| 模型文件 | `~/.cache/huggingface/` | transformers.js 默认缓存路径 |

### 4.6 集成点

```
1. Core 启动（index.ts）
   └── initEmbeddingProvider()  ← 新增：探测并初始化最佳 provider
       └── 如果 transformers 可用，后台预热模型（不阻塞启动）

2. Skills 加载完成后（index.ts）
   └── skillRAGRetriever.rebuild(skills)  ← 新增：构建 chunk 索引
       └── 后台异步执行，2-3 秒完成

3. skill_search 工具（skill-search.ts）
   └── 改用 skillRAGRetriever.search()  ← 替换现有 SkillRetriever
       └── 返回结果增加 relevantSnippet 字段

4. memory_search 工具（memory.ts）
   └── 切换 embedding provider  ← 替换 SimpleEmbeddingProvider
       └── 透明升级，API 不变

5. System Prompt 组装（system-prompt.ts）
   └── 可选：用 RAG 结果动态注入最相关的 Skill body 片段
       └── 替代全文注入，节省 tokens
```

---

## 五、依赖分析

### 必须新增的 npm 包

| 包名 | 大小 | 用途 | 许可 |
|------|------|------|------|
| `@huggingface/transformers` | ~5MB (npm) + 22MB (模型文件，首次运行下载) | Embedding 计算 | Apache-2.0 |

### 模型文件

| 模型 | 大小 | 维度 | 下载方式 |
|------|------|------|---------|
| `Xenova/all-MiniLM-L6-v2` | 22MB (quantized) | 384 | 首次 `embed()` 时自动下载到 `~/.cache/` |

### 国内网络问题解决

```typescript
// 设置 HuggingFace 国内镜像
process.env.HF_ENDPOINT = 'https://hf-mirror.com'

// 或者构建时预下载，打包到 resources/models/
// → SEA 打包时 copy 到 resources 目录
// → 运行时设置 TRANSFORMERS_CACHE 指向 resources/models/
```

**推荐做法**：
1. **开发环境**：自动下载到 `~/.cache/`，设置镜像
2. **安装包分发**：预下载模型到 `src-tauri/resources/models/`，打包进 NSIS 安装包（+22MB）
3. **便携版**：同上，放在 `Equality-portable/models/` 目录

### 与 SEA 打包的兼容性

`@huggingface/transformers` v3+ 使用 ONNX Runtime WASM backend：
- **不依赖 native addon**（不像 `onnxruntime-node` 需要 .node 文件）
- WASM 文件可以通过 `__dirname` 或配置路径加载
- SEA 打包时需要将 WASM 文件和模型文件放在 resources 目录

**风险点**：SEA 中 `__dirname` 行为可能不同，需要测试。
**缓解**：构建时显式设置 `env.TRANSFORMERS_CACHE` 和 WASM 路径。

---

## 六、性能预估

| 操作 | 耗时 | 频率 |
|------|------|------|
| 模型首次加载（WASM 初始化） | ~2-3s | 仅启动时一次 |
| 单条文本 embed | ~15ms | 每次搜索 1 次（query）|
| 38 Skills 全量索引 | ~2.8s | 启动时 + Skills 变更时 |
| skill_search 检索 | ~20ms（1 embed + 190 cosine） | 每次 Agent 调用 |
| memory_search 检索 | ~50ms（1 embed + N cosine + FTS5） | 每次 Agent 调用 |
| 内存增量 | ~50MB（WASM runtime + 模型权重） | 常驻 |

**用户感知**：
- 启动时后台加载 2-3 秒，不阻塞 UI
- 首次 skill_search 可能多等 2 秒（模型冷启动）
- 后续调用 <50ms，无感知

---

## 七、降级策略

```
┌─────────────────────────────────────────────────┐
│ 启动时 initEmbeddingProvider()                    │
│                                                   │
│ try Ollama → nomic-embed-text (768维, 最佳质量)   │
│   │ 失败                                          │
│   ▼                                               │
│ try @huggingface/transformers → MiniLM (384维)    │
│   │ 失败（WASM 不支持 / 模型下载失败）               │
│   ▼                                               │
│ fallback SimpleEmbeddingProvider (128维, n-gram)   │
│                                                   │
│ 无论哪个 provider 成功，上层 API 不变               │
└─────────────────────────────────────────────────┘
```

日志输出当前使用的 provider，方便用户诊断：
```
[embedding] Using: @huggingface/transformers (all-MiniLM-L6-v2, 384d)
[embedding] Skills index: 38 skills → 187 chunks, built in 2.6s
```

---

## 八、实现阶段

### Phase K2.1：Embedding Provider 升级（1-2 天）

1. `pnpm --filter @equality/core add @huggingface/transformers`
2. 新建 `memory/transformers-embedding.ts` — `TransformersEmbeddingProvider`
3. 修改 `memory/embeddings.ts` — `createDefaultEmbeddingProvider()` 加入降级链
4. 修改 `build-sea.mjs` — 将 WASM + 模型文件 copy 到 resources
5. 测试：Memory 搜索语义质量验证

### Phase K2.2：Skills RAG Retriever（1-2 天）

1. 新建 `skills/rag-retriever.ts` — `SkillRAGRetriever` 类
2. 新建 `skills/skill-chunker.ts` — Markdown 标题分块 + 合并策略
3. 修改 `skills/retriever.ts` — 如果 embedding provider 可用，委托给 RAG retriever
4. 修改 `tools/builtins/skill-search.ts` — 返回增加 `relevantSnippet`
5. 测试：语义搜索质量验证（"我想生成PPT" → 找到 pptx-style skill）

### Phase K2.3：集成优化（1 天）

1. 模型预下载脚本（`scripts/download-model.mjs`）
2. `build-all.mjs` 集成模型打包
3. 国内镜像配置（Settings 中可设置 HF_ENDPOINT）
4. 性能基准测试

---

## 九、待讨论问题

1. **模型打包策略**：是否将 22MB 模型打进安装包？还是首次运行时下载？
   - 打包优点：离线即用，用户无感知
   - 打包缺点：安装包 +22MB
   - 首次下载优点：安装包小
   - 首次下载缺点：国内网络可能卡住

2. **Ollama 检测**：是否自动检测 Ollama？还是用户手动配置？
   - 自动检测：`http://localhost:11434/api/tags` 有响应且模型列表含 embedding 模型
   - 风险：用户可能不希望 Equality 自动连接 Ollama

3. **Skills body 全文索引 vs 片段索引**：
   - 全文注入：Agent 拿到完整 Skill body，效果最好，但 token 消耗高
   - 片段注入：只注入最相关的 chunk，省 token 但可能丢关键信息
   - 混合：元数据 + 最相关的 top-3 chunks + "如需完整内容请用 read_file 查看"

4. **启动时索引阻塞**：2.8 秒的索引构建是否可接受？
   - 可以做成后台异步，skill_search 在索引完成前 fallback 到旧的 BM25

5. **embedding 维度迁移**：Memory 表现有 128 维 BLOB 需要迁移到 384 维
   - 后台 backfill 还是启动时全量重算？
   - 38 skills 秒级，但 Memory 可能有成百上千条
