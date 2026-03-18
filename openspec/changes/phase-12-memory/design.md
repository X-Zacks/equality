# Design: Memory/RAG

> Phase 12 | 扩展 [specs/context-engine/spec.md](../../specs/context-engine/spec.md)

## 架构决策

### 1. SQLite + FTS5 全文检索

**选择**：复用 better-sqlite3（已在 cost/ledger.ts 使用），开启 FTS5。

表结构：
```sql
CREATE TABLE memories (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  category   TEXT DEFAULT 'general',
  importance INTEGER DEFAULT 5,
  created_at INTEGER NOT NULL,
  session_key TEXT
);
CREATE VIRTUAL TABLE memories_fts USING fts5(text, content=memories, content_rowid=rowid);
```

**理由**：
- 零额外依赖，FTS5 是 SQLite 内置扩展
- BM25 排名开箱即用
- 单文件持久化：`%APPDATA%\Equality\memory.db`

### 2. 两个工具

| 工具 | 参数 | 行为 |
|------|------|------|
| `memory_save` | text, category?, importance? | 存储记忆到 SQLite |
| `memory_search` | query, limit? | FTS5 BM25 检索，返回 top-N |

### 3. 自动 Recall（每轮注入）

`runner.ts` 在构造消息前，用用户消息作查询词检索 top-3 记忆，
作为 `<memories>` 块注入 system prompt 末尾。

### 4. 自动 Capture（关键词触发）

检测用户消息中的触发词（记住/remember/偏好/prefer 等），
自动调用 memory_save。在 runner 中实现，不依赖 LLM 判断。

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/memory/db.ts` | 新增 | MemoryDB 类（SQLite + FTS5） |
| `packages/core/src/memory/index.ts` | 新增 | 导出 |
| `packages/core/src/tools/builtins/memory.ts` | 新增 | memory_save + memory_search 工具 |
| `packages/core/src/tools/registry.ts` | 修改 | 注册 memory 工具 |
| `packages/core/src/agent/runner.ts` | 修改 | 自动 recall + capture |
