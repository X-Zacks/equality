# Skill RAG + Embedding 升级 — 任务清单

## Phase 1：Embedding Provider 升级（K2.1）

- [ ] 安装 `@huggingface/transformers` 依赖到 `packages/core`
- [ ] 在 `embeddings.ts` 中实现 `TransformersEmbeddingProvider`（384 维）
- [ ] 实现 `createEmbeddingProvider()` 工厂函数（含降级逻辑）
- [ ] 为 TransformersEmbeddingProvider 编写单元测试
- [ ] 验证降级：mock transformers.js 加载失败 → 回退到 SimpleEmbeddingProvider

## Phase 2：Skill 分块与 RAG 检索（K2.2）

- [ ] 新建 `skills/chunker.ts`：Markdown heading 分块器
  - 按 `# / ## / ###` 标题分割
  - 无标题 → 整体为 1 chunk
  - description 单独 1 chunk
  - > 2000 字符段落二次分割
- [ ] 新建 `skills/skill-embedding-db.ts`：SQLite 持久化层
  - `skill_chunks` 表（chunk_id, skill_name, heading, content, embedding, model_id）
  - 全量构建 / 增量更新 / 读取接口
- [ ] 新建 `skills/rag-retriever.ts`：SkillRAGRetriever
  - `buildIndex(skills)` → 分块 + 嵌入 + 持久化
  - `search(query, topK)` → 混合检索（Cosine 0.7 + BM25 0.3）
  - 结果按 Skill 去重
- [ ] 为 chunker、rag-retriever 编写单元测试
- [ ] 验证索引持久化：启动→建索引→重启→读缓存（不重建）

## Phase 3：skill_search 交互式确认（K2.3）

- [ ] 修改 `skill-search.ts`：接入 SkillRAGRetriever 替换原始搜索
- [ ] skill_search 返回 `:::interactive` 载荷（skill-confirm 类型）
- [ ] 用户确认后将 Skill body 注入 System Prompt
- [ ] 用户跳过后 Agent 继续执行（不注入）
- [ ] 为交互式确认流程编写测试

## Phase 4：集成与打包（K2.4）

- [ ] 新建 `scripts/download-model.mjs`：从 ModelScope 下载模型
- [ ] 修改 `tauri.conf.json`：将 `resources/models/` 加入 bundle
- [ ] 修改 `scripts/build-all.mjs`：构建前自动下载模型
- [ ] Memory DB 128→384 维迁移逻辑（惰性 + backfill）
- [ ] 端到端测试：`skill_search("做PPT")` → 匹配 pptx-style → 确认 → 注入
- [ ] `tsc --noEmit` 零错误
- [ ] 全量构建 `build-all.mjs` 成功
