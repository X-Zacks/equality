# Delta Spec: Memory/RAG

> Phase 12 新增能力

## NEW Requirement: Memory 工具

系统 MUST 提供 `memory_save` 和 `memory_search` 工具，
使 Agent 能够持久化和检索跨 Session 的长期记忆。

- 存储引擎：SQLite + FTS5（better-sqlite3）
- 检索方式：BM25 全文检索
- 自动 Recall：每轮对话注入 top-3 相关记忆到 system prompt
- 自动 Capture：检测"记住/remember"等关键词自动存储
