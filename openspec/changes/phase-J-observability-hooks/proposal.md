# Phase J 提案：Observability & Hooks Foundation

## 动机

Phase G-I 实现了大量独立模块（security audit / cache trace / persist guard / context window / agent scope / catalog profiles），Phase I.5 将它们缝合到运行时。但系统仍缺少：

1. **结构化日志**——当前使用 `console.log` 散落在各处，无法按级别过滤、无法持久化、无法在 UI 中展示
2. **Session 生命周期事件**——session 创建/销毁/持久化/恢复时无通知机制，UI 无法实时更新
3. **Hooks 框架**——工具执行前后、LLM 调用前后、session 持久化等关键时刻缺少可扩展的 hook 点

## 范围

| ID | 名称 | GAP | 优先级 |
|----|------|-----|--------|
| J1 | Structured Logger | GAP-27 | P1 |
| J2 | Session Lifecycle Events | GAP-35 | P2 |
| J3 | Hooks Framework | GAP-36 | P2 |

## 非目标

- 日志 UI 可视化面板（属于 Desktop 前端）
- 分布式 tracing（Equality 是单机桌面应用）
- 引入 winston/pino 等三方日志库（零依赖原则）
- Hook 动态加载/插件系统（留待 Phase K）
- 将 logger/hooks 接入 runner.ts 主循环（属于后续 Gateway 集成任务）

## 成功标准

- J1: createLogger() 支持 4 级日志（debug/info/warn/error），JSONL 文件输出，自动脱敏
- J2: 5 种 session 事件（created/restored/persisted/destroyed/reaped），同步分发，异常隔离
- J3: 6 个 hook 点（beforeToolCall/afterToolCall/beforeLLMCall/afterLLMCall/beforePersist/afterPersist），优先级排序，错误隔离
- 新增测试 ≥ 75 个断言
- tsc --noEmit 零错误
- 现有 509 个断言无回归
