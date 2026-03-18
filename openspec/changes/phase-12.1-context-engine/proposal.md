# Proposal: Context Engine 可插拔接口

> Phase 12.1 | 优先级: 🟠 P2
> Spec: [specs/context-engine/spec.md](../../specs/context-engine/spec.md)

## 意图

当前 runner.ts 中的上下文管理逻辑散布多处：
- 步骤 4: 手动 push 用户消息到 session
- 步骤 4.5-4.6: memory recall/capture
- 步骤 5: 手动构造 system + history
- 步骤 6.5: compactIfNeeded
- trimMessages: 暴力截断

这些逻辑互相耦合、不可替换。ContextEngine 接口将它们统一收口。

## 目标

1. **ContextEngine 接口** — 定义 bootstrap/ingest/assemble/afterTurn
2. **DefaultContextEngine** — 将现有散布的逻辑归集到一个实现中
3. **runner 简化** — runner 只调 `engine.assemble()`，不再直接操作消息列表

## 范围

- **包含**：接口定义、DefaultContextEngine、runner 重构
- **不包含**：RagContextEngine（向量检索版本，未来扩展）

## 成功标准

- runner.ts 中上下文构造逻辑替换为 `engine.assemble()` 一行调用
- 行为与之前完全一致（memory recall、compaction、trimMessages 都在 engine 内部）
- 可通过替换 engine 实现来切换上下文策略
