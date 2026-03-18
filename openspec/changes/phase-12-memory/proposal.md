# Proposal: Memory/RAG

> Phase 12 | 优先级: 🟠 P2
> Spec: 新建 + 扩展 [specs/context-engine/spec.md](../../specs/context-engine/spec.md)

## 意图

当前 Agent 没有跨 Session 的长期记忆。用户告诉过 AI 自己的偏好/项目习惯，
下次新建会话就全忘了。每次都要重复交代背景。

## 目标

实现轻量 Memory 系统：

1. **MemoryDB** — SQLite + FTS5 全文检索，零原生依赖（better-sqlite3 已在项目中）
2. **memory_save / memory_search** — 两个工具，Agent 可以主动存/查记忆
3. **自动 Recall** — 每轮对话前自动检索相关记忆，注入 system prompt
4. **自动 Capture** — 检测用户消息中的"记住/remember"等关键词，自动存储

## 范围

- **包含**：MemoryDB (SQLite+FTS5)、两个工具、自动 recall/capture、runner 集成
- **不包含**：向量 embedding（Phase 12.1 Context Engine 引入）、LanceDB

## 成功标准

- 用户说"记住我喜欢用 TypeScript"→ 自动存储到 memory.db
- 下次新会话问"我喜欢什么语言"→ 自动 recall 出相关记忆
- memory_search 工具支持 BM25 全文检索
