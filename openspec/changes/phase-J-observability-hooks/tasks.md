# Phase J: 任务清单

## J1 — Structured Logger (GAP-27)

- [x] T1: 编写 Delta Spec — `specs/diagnostics-logger/spec.md`
- [x] T2: 新建 `diagnostics/logger.ts` — LogLevel / LogEntry / Logger 类型
- [x] T3: resolveLogLevel() — 环境变量解析 + fallback
- [x] T4: createLogger(module, opts) — 工厂函数
- [x] T5: JSONL 文件输出 — 复用 QueuedFileWriter
- [x] T6: 敏感数据脱敏 — 复用 sanitizeDiagnosticPayload
- [x] T7: VALID_LOG_LEVELS 常量导出
- [x] T8: 测试 — ≥ 20 个断言 (实际 25)

## J2 — Session Lifecycle Events (GAP-35)

- [x] T9: 编写 Delta Spec — `specs/session-lifecycle/spec.md`
- [x] T10: 新建 `session/lifecycle.ts` — SessionEventType / SessionEvent 类型
- [x] T11: onSessionEvent() — 注册监听器
- [x] T12: offSessionEvent() — 移除监听器
- [x] T13: emitSessionEvent() — 同步分发 + 异常隔离
- [x] T14: listenerCount() + clearAllSessionListeners() — 辅助 API
- [x] T15: SESSION_EVENT_TYPES 常量导出（5 种事件）
- [x] T16: 测试 — ≥ 20 个断言 (实际 23)

## J3 — Hooks Framework (GAP-36)

- [x] T17: 编写 Delta Spec — `specs/hooks-framework/spec.md`
- [x] T18: 新建 `hooks/index.ts` — HookPoint / HookPayloadMap 类型
- [x] T19: HookRegistry.register() — 注册 + 返回取消函数
- [x] T20: HookRegistry.invoke() — 顺序执行 + Promise.race 超时 + block 支持
- [x] T21: HookRegistry.count/clear/clearPoint — 辅助 API
- [x] T22: 6 种 Payload 类型定义（BeforeToolCallPayload 等）
- [x] T23: globalHookRegistry 全局 singleton 导出
- [x] T24: HOOK_POINTS 常量导出
- [x] T25: 测试 — ≥ 25 个断言 (实际 30)

## 统计

- 实际总断言数：78（J1:25 + J2:23 + J3:30）
- tsc --noEmit：零错误 ✅
- 现有测试：509 个无回归 → 总计 587 个断言全部通过 ✅
