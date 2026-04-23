# Skill RAG + Embedding 升级 — 提案

## 1. 问题

### 1.1 Skills 检索质量差

当前 `SkillRetriever` 使用纯 BM25 关键词匹配，且**只索引 name + description + category**，不索引 body 正文（平均 6.3KB/个，总计 240KB）。

后果：
- 用户说"帮我做个PPT"→ 搜不到 `pptx-style` Skill（因为关键词不匹配）
- Agent 不知道有可用 Skill → 从零开始执行 → 质量差、耗 token

### 1.2 Memory 语义检索名存实亡

Phase K2 已实现混合检索框架（BM25 + Cosine），但 embedding 模型是自研 n-gram 哈希（128 维），**没有语义理解能力**——"TypeScript 类型系统"搜不到"TS 泛型约束"。

### 1.3 Agent 找到 Skill 后无法征求用户确认

当前 `skill_search` 工具返回结果后，Agent 自行决定是否使用，用户没有参与决策的机会。用户可能不希望 Agent 使用某个特定 Skill，或希望选择另一个。

## 2. 核心设计决策

### 决策 A：Embedding 模型

**选择：`all-MiniLM-L6-v2`（384 维，22MB），通过 `@huggingface/transformers` 在本地运行**

- 纯 JS/WASM，无需 GPU、无需额外进程
- 中英文均可，MIT 许可
- ModelScope（`https://www.modelscope.cn/models/sentence-transformers/all-MiniLM-L6-v2`）提供国内镜像
- **模型文件预下载并打包进安装包**，运行时零网络依赖

### 决策 B：降级策略

```
transformers.js (MiniLM 384维) → 加载失败 → SimpleEmbeddingProvider (n-gram 128维)
```

不接入 Ollama。只有两级降级。

### 决策 C：Skills 检索触发方式 — Agent 主动检索 + 暂停确认（Mode B）

```
Agent 执行任务 → Agent 自主决定调用 skill_search → 命中 Skill
  → skill_search 返回交互式载荷（:::interactive）
  → 前端渲染「找到技能 XXX，是否使用？ [使用] [跳过]」
  → 用户点「使用」→ Skill body 注入后续 context → Agent 继续
  → 用户点「跳过」→ Agent 不使用该 Skill，自行完成
```

选择 Mode B 而非自动检索：不会频繁打断用户，Agent 知道什么时候需要技能。

### 决策 D：索引持久化

Skill chunk embeddings 持久化到 SQLite（`%APPDATA%\Equality\skill-embeddings.db`），不每次启动重建：

| 时机 | 操作 |
|------|------|
| 首次启动（无缓存） | 全量构建 + 持久化 |
| 后续启动（有缓存） | 读取缓存，毫秒级恢复 |
| Skill 安装/更新/删除 | 增量更新受影响的 chunks |
| 对话中创建 Skill | 该 Skill 立即索引 |

### 决策 E：模型分发

构建时从 ModelScope 预下载模型文件，打包进 `src-tauri/resources/models/`，运行时通过 `TRANSFORMERS_CACHE` 环境变量指向本地目录。安装包增加约 22MB。

## 3. 范围

| ID | 名称 | 说明 |
|----|------|------|
| K2.1 | Embedding Provider 升级 | transformers.js + MiniLM + 降级链 |
| K2.2 | Skills RAG Retriever | body 分块 + 向量索引 + 混合检索 + SQLite 持久化 |
| K2.3 | skill_search 暂停确认 | 交互式载荷 + 用户确认后注入 Skill |
| K2.4 | 集成 + 模型打包 | Memory 迁移 + 模型预下载 + build 集成 |

## 4. 非目标

- Ollama / 外部 embedding API 接入
- Skills body 自动注入 System Prompt（由 Agent 主动搜索触发）
- 代码文件向量索引（Phase N CodeIndexer 范围）
- 插件系统（K1 范围，本变更不涉及）

## 5. 成功标准

- `skill_search("做PPT")` 能检索到 `pptx-style` Skill（语义匹配）
- `skill_search` 命中后返回交互式确认，用户点「使用」后 Skill body 注入 context
- Memory 搜索语义质量提升（"TS 泛型" 能检索到 "TypeScript 类型系统" 相关记忆）
- 索引持久化：重启后毫秒级恢复，不重新计算 embedding
- 安装包打包模型文件，离线可用
- tsc --noEmit 零错误
- 新增测试 ≥ 20 个断言
