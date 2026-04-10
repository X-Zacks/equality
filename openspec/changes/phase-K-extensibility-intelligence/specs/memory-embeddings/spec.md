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

### Requirement: memorySave 向量化写入

`memorySave()` MUST 在写入时同步计算 embedding 并存储到 BLOB 列。
embedding 计算失败时 SHOULD 静默降级（embedding 为 NULL），不阻塞写入。
（Previously: memorySave 只写 text/category/importance/created_at/session_key）

#### Scenario: 保存时计算 embedding
- GIVEN 调用 `memorySave('用户的名字是 zacks', 'fact', 8)`
- WHEN 写入 SQLite
- THEN `embedding` 列包含 Float32Array BLOB
- AND `text`/`category`/`importance` 字段正常写入

#### Scenario: embedding 计算失败降级
- GIVEN embedding provider 抛出异常
- WHEN memorySave 被调用
- THEN 记忆仍正常写入（embedding 为 NULL）
- AND 日志打印 warning

### Requirement: memory_search 工具接入混合检索

`memory_search` 工具 MUST 使用 `hybridSearch` 替代纯 BM25 `memorySearch`。

#### Scenario: 语义搜索命中
- GIVEN 记忆库中存有 "用户的名字是 zacks"
- WHEN 用户搜索 "叫什么名字"
- THEN 混合检索应能通过向量相似度命中该记忆
- AND 纯 BM25 无法命中时，cosine 分数弥补

#### Scenario: 向后兼容
- GIVEN 旧记忆 embedding 为 NULL
- WHEN 混合检索执行
- THEN 该记忆仅使用 BM25 评分（cosineScore = 0）
- AND 不报错

### Requirement: 自动 Recall 接入混合检索

`DefaultContextEngine.assemble()` 中的自动 Recall MUST 使用混合检索。
（Previously: 使用纯 BM25 memorySearch）

#### Scenario: Recall 使用混合检索
- GIVEN 用户发送消息 "还记得我叫什么么"
- WHEN assemble() 执行首轮 recall
- THEN 调用 hybridSearch 而非 memorySearch
- AND 语义相近的记忆能被召回

### Requirement: 旧记忆 embedding 回填

系统启动时 SHOULD 异步扫描 `embedding IS NULL` 的旧记录，计算并回填 embedding。

#### Scenario: 启动回填
- GIVEN 数据库中有 5 条 embedding 为 NULL 的旧记忆
- WHEN Core 启动（db 初始化后）
- THEN 后台异步计算这 5 条记忆的 embedding 并 UPDATE
- AND 不阻塞正常服务

#### Scenario: 无旧记录
- GIVEN 所有记忆都有 embedding
- WHEN Core 启动
- THEN 回填扫描完成，无操作
