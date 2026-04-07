# Delta Spec: Memory Embeddings + Hybrid Search

> Phase K2 — GAP-37

## ADDED Requirements

### Requirement: Embedding 计算

系统 MUST 提供本地 embedding 计算能力，将文本转化为定长向量。

- 默认模型：`all-MiniLM-L6-v2`（384 维）
- 输入：字符串数组
- 输出：`Float32Array[]`（每个元素为 384 维向量）
- 首次调用 MAY 有模型加载延迟

#### Scenario: 计算文本 embedding
- GIVEN 调用 `embedder.embed(['hello world'])`
- WHEN embedding 计算完成
- THEN MUST 返回长度为 1 的 `Float32Array[]`
- AND 每个向量维度 MUST 为 384

#### Scenario: 批量 embedding
- GIVEN 调用 `embedder.embed(['text1', 'text2', 'text3'])`
- WHEN 计算完成
- THEN MUST 返回长度为 3 的数组

#### Scenario: 相似文本向量距离
- GIVEN `embed(['TypeScript 类型系统'])` 和 `embed(['TS type system'])`
- WHEN 计算 cosine similarity
- THEN 相似度 MUST 大于 0.5（语义相近）

### Requirement: 向量存储

- `memories` 表 MUST 增加 `embedding BLOB` 列
- 保存记忆时 MUST 同时计算并存储 embedding
- embedding 列 MAY 为 NULL（兼容旧记录）

#### Scenario: 保存记忆时生成 embedding
- GIVEN 调用 `memory.save({ text: 'important fact', ... })`
- WHEN 记忆写入 SQLite
- THEN `embedding` 列 MUST 包含 384 维 Float32Array 的 BLOB

### Requirement: 混合检索

系统 MUST 支持 BM25 + cosine 混合检索。

- `searchHybrid(options)` — 混合搜索接口
- 评分公式：`score = α × bm25_norm + (1-α) × cosine_norm`
- `α` 默认 0.5（BM25 和向量各占一半权重）
- 结果 MUST 按 `score` 降序排列

#### Scenario: 混合检索
- GIVEN 记忆库中包含 "TypeScript 是 JavaScript 的超集"
- WHEN `searchHybrid({ query: 'TS 类型', limit: 5, alpha: 0.5 })`
- THEN FTS5 BM25 和 cosine 均被执行
- AND 结果 MUST 包含 `score`、`bm25Score`、`cosineScore` 字段

#### Scenario: 纯 BM25 回退
- GIVEN 某条记忆 embedding 为 NULL（旧记录）
- WHEN 混合检索执行
- THEN 该记录仅使用 BM25 评分（cosineScore = 0）

### Requirement: 文本分块

系统 MUST 提供文本分块功能，将长文本切分为适合 embedding 的片段。

- 每块目标长度：512 tokens
- 块之间 SHOULD 有 50 tokens 重叠
- 切分 MUST 在句子边界对齐（不在词中间截断）

#### Scenario: 长文本分块
- GIVEN 一段 2000 tokens 的文本
- WHEN `chunkText(text, { maxTokens: 512, overlap: 50 })` 被调用
- THEN MUST 返回约 4-5 个块
- AND 每个块 MUST 不超过 512 tokens
- AND 相邻块之间 MUST 有重叠部分

### Requirement: Cosine Similarity 工具函数

- 系统 MUST 导出 `cosineSimilarity(a: Float32Array, b: Float32Array): number`
- 返回值范围 MUST 为 `[-1, 1]`
- 两个相同向量的相似度 MUST 为 1.0

## MODIFIED Requirements

### Requirement: Memory Search API

现有 `searchMemories(query, limit)` SHOULD 继续可用（向后兼容）。
新增 `searchHybrid(options)` 作为增强版本。
（Previously: 仅 FTS5 BM25 搜索）
