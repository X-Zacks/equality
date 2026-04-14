# Tasks: Phase I.5 — Gateway 缝合冲刺

> Status: in-progress | Completed: 12/12

---

## G1: codebase_search 工具注册

- [x] **G1.T1** 在 `tools/builtins/index.ts` import codebaseSearchTool
- [x] **G1.T2** 将 codebaseSearchTool 添加到 builtinTools 数组
- [x] **G1.T3** 在 export block 添加 codebaseSearchTool 导出

## G2: Hooks 框架接入 runner

- [x] **G2.T1** 在 `agent/runner.ts` import globalHookRegistry + HookPayloadMap 类型
- [x] **G2.T2** 在 toolLoop 每轮 LLM 调用前调用 `globalHookRegistry.invoke('beforeLLMCall', ...)`
- [x] **G2.T3** 在每轮 LLM 流式读取完毕后调用 `globalHookRegistry.invoke('afterLLMCall', ...)`
- [x] **G2.T4** 在每个工具执行前调用 `globalHookRegistry.invoke('beforeToolCall', ...)`（与 params.beforeToolCall 共存）
- [x] **G2.T5** 在每个工具执行后调用 `globalHookRegistry.invoke('afterToolCall', ...)`（与 params.afterToolCall 共存）

## G3: Session 生命周期事件发射

- [x] **G3.T1** 在 `session/store.ts` import emitSessionEvent
- [x] **G3.T2** 在 getOrCreate 中新建/恢复时发射 `session:created` / `session:restored`
- [x] **G3.T3** 在 reap 中回收时发射 `session:reaped`

## 验证

- [x] **V1** tsc --noEmit 零错误 ✅ (含修复预存的 phase-K.test.ts 联合类型 narrowing 问题)

## 额外修复

- [x] **FIX-1** 修复 `phase-K.test.ts` 中 5 个 memorySave 联合类型未 narrow 的预存 TS 错误
