# Phase J Proposal — Observability & Hooks Foundation

> Phase I.5 stitching 完成后的首个新功能 Phase。
> 目标：为后续 Phase 13（频道系统）和 Phase 15（多 Agent 编排）奠定可观测性和生命周期事件的基础。

---

## 动机

Phase G-I 实现了大量独立模块（security audit / cache trace / persist guard / context window / agent scope / catalog profiles），Phase I.5 将它们缝合到运行时。但系统仍缺少：

1. **结构化日志**（GAP-27）：当前使用 `console.log` 散落在各处，无法按级别过滤、无法持久化、无法在 UI 中展示
2. **Session 生命周期事件**（GAP-35）：session 创建/销毁/持久化/恢复时无通知机制，UI 无法实时更新
3. **Hooks 框架**（GAP-36）：工具执行前后、session 变更等关键时刻缺少可扩展的 hook 点

## 范围

| GAP | 模块 | 文件 | 断言目标 |
|-----|------|------|---------|
| GAP-27 | `diagnostics/logger.ts` | 新建 | ~30 |
| GAP-35 | `session/lifecycle.ts` | 新建 | ~25 |
| GAP-36 | `hooks/index.ts` | 新建 | ~30 |
| 集成 | `index.ts` + `runner.ts` | 修改 | ~15 |

**总计：~100 assertions，4 个新文件**

## 设计约束

1. **零依赖**：不引入 winston/pino 等三方日志库，使用 Node.js 内置能力
2. **向后兼容**：现有 `console.log` 调用不受影响，新模块可选启用
3. **性能**：hooks 使用同步 Set 存储，无 EventEmitter overhead
4. **OpenSpec 一致**：遵循 Delta-based spec 格式

---

## 里程碑

```
J.1  ── 结构化日志 (GAP-27)
  │     logger.ts: createLogger(), LogLevel, JSONL sink
  │     ~30 assertions
  │
J.2  ── Session 生命周期事件 (GAP-35)
  │     lifecycle.ts: SessionEvent, onSessionEvent(), emit
  │     ~25 assertions
  │
J.3  ── Hooks 框架 (GAP-36)
  │     hooks/index.ts: HookRegistry, before/after patterns
  │     ~30 assertions
  │
J.4  ── Gateway 集成
        index.ts + runner.ts: wire up logger + lifecycle + hooks
        ~15 assertions
```
