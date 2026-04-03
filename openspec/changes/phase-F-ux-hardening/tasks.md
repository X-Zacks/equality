# Phase F: 实施任务清单

---

## F1: 交互式 UI 载荷

### 1.1 Core 侧类型与解析

- [x] 1.1.1 新建 `packages/core/src/agent/interactive.ts` ✅
- [x] 1.1.2 单元测试 `packages/core/src/__tests__/interactive.test.ts` ✅ (37 assertions)

### 1.2 Runner 集成

- [x] 1.2.1 `RunAttemptParams` 新增 `onInteractive` ✅
- [x] 1.2.2 runner.ts interactive 检测 + 剥离 + 回调 ✅

### 1.3 Gateway SSE

- [x] 1.3.1 `index.ts` `/chat/stream` 传入 `onInteractive` → SSE ✅

### 1.4 Desktop 渲染

- [x] 1.4.1 `useGateway.ts` `DeltaEvent` + `InteractivePayload` 类型 ✅
- [x] 1.4.2 `Chat.tsx` interactive 状态管理 + 渲染 + 回传 ✅
- [x] 1.4.3 `InteractiveBlock.tsx` + `InteractiveBlock.css` ✅
- [x] 1.4.4 Desktop `npx tsc --noEmit` 零错误 ✅

---

## F2: Prompt 稳定性测试

### 2.1 快照框架

- [x] 2.1.1 `system-prompt.test.ts` (22 assertions, 6 场景) ✅
- [x] 2.1.2 golden 快照 `__snapshots__/system-prompt.snap.json` ✅

### 2.2 验证

- [ ] 2.2.1 所有 6 场景通过
- [ ] 2.2.2 手动修改 system-prompt.ts 一行 → 测试失败 → 还原 → 测试通过
- [ ] 2.2.3 `--update` 模式更新快照后通过

---

## 验证

- [x] 3.1 Core `npx tsc --noEmit` 零错误 ✅
- [x] 3.2 Desktop `npx tsc --noEmit` 零错误 ✅
- [x] 3.3 既有测试全部通过（E1: 56 + E2: 59 + E3: 34） ✅
- [x] 3.4 F1 interactive 测试通过 (37 assertions) ✅
- [x] 3.5 F2 prompt 快照测试通过 (22 assertions) ✅
- [x] 3.6 Git 提交
