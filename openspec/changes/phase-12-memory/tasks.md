# Phase 12: Memory/RAG — Tasks

> 状态：✅ 完成

## 实施清单

### 1. MemoryDB（db.ts）

- [x] 1.1 SQLite 初始化：memories 表 + FTS5 虚拟表
- [x] 1.2 `save(text, category, importance)` — 插入 + FTS 同步
- [x] 1.3 `search(query, limit)` — FTS5 BM25 检索
- [x] 1.4 `list(limit)` — 按时间降序
- [x] 1.5 `delete(id)` — 删除 + FTS 同步
- [x] 1.6 `count()` — 统计

### 2. 工具（memory.ts）

- [x] 2.1 memory_save 工具定义
- [x] 2.2 memory_search 工具定义
- [x] 2.3 注册到 ToolRegistry

### 3. Runner 集成

- [x] 3.1 自动 Recall：检索 top-3 注入 system prompt
- [x] 3.2 自动 Capture：关键词检测 + memory_save

### 4. 验证

- [x] 4.1 TypeScript 编译零新增错误
