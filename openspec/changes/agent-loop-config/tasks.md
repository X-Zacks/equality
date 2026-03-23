# Tasks: Agent Loop Config

## Phase 1：Core 配置化

- [ ] **1.1** `packages/core/src/config/secrets.ts`
  - `KEY_NAMES` 数组追加 `'AGENT_MAX_TOOL_CALLS'`、`'AGENT_MAX_LLM_TURNS'`

- [ ] **1.2** `packages/core/src/tools/loop-detector.ts`
  - 将 `CIRCUIT_BREAKER_LIMIT = 30` 常量重命名为 `DEFAULT_CIRCUIT_BREAKER_LIMIT = 50`
  - 新增 `MAX_CIRCUIT_BREAKER_LIMIT = 500`
  - `LoopDetector` 添加构造函数参数 `circuitBreakerLimit?: number`
  - `checkCircuitBreaker()` 使用 `this.circuitBreakerLimit`

- [ ] **1.3** `packages/core/src/agent/runner.ts`
  - 删除顶层常量 `const MAX_TOOL_LOOP = 50`
  - 在 `runAttempt` 函数体内新增工具函数 `getAgentConfigNumber()`（复用 bash.ts 模式）
  - 在 `runAttempt` 函数体顶部读取：
    ```typescript
    const maxLlmTurns  = getAgentConfigNumber('AGENT_MAX_LLM_TURNS',  50, 1, 500)
    const maxToolCalls = getAgentConfigNumber('AGENT_MAX_TOOL_CALLS', 50, 1, 500)
    ```
  - `toolLoop: while (loopCount < maxLlmTurns)` 替换原来 `MAX_TOOL_LOOP`
  - `new LoopDetector(maxToolCalls)` 替换原来 `new LoopDetector()`
  - 运行 `pnpm typecheck` 确认无错误

## Phase 2：前端 UI

- [ ] **2.1** `packages/desktop/src/Settings.tsx`
  - 在「性能设置」区域 bash 超时三项之后，新增「🔁 Agent 循环上限」分组
  - 工具调用上限输入项（`AGENT_MAX_TOOL_CALLS`，placeholder `50`，单位 `次`）
  - LLM 轮次上限输入项（`AGENT_MAX_LLM_TURNS`，placeholder `50`，单位 `次`）
  - 独立保存按钮，调用 `handleSave('agentLoop', [...])`
  - 「工具」Tab 底部提示文字从「工具调用上限：30 次/轮」改为「工具调用上限见「⚙️ 高级」设置」

## Phase 3：验证

- [ ] **3.1** 设置 `AGENT_MAX_TOOL_CALLS = 5`，发送需要 10 次工具调用的任务，确认第 5 次后触发断路器终止
- [ ] **3.2** 未设置任何配置时，确认默认值 50 生效（不崩溃）
- [ ] **3.3** 设置非法值（`abc`），确认回落到默认值 50
- [ ] **3.4** 设置 `AGENT_MAX_TOOL_CALLS = 99999`，确认截断到 500
- [ ] **3.5** 在设置页输入 `200`，保存后重新打开设置页，确认显示 `200`

## 文件变更汇总

| 文件 | 操作 | Phase |
|------|------|-------|
| `packages/core/src/config/secrets.ts` | 追加 2 个 KEY_NAMES | 1.1 |
| `packages/core/src/tools/loop-detector.ts` | 构造函数参数化 | 1.2 |
| `packages/core/src/agent/runner.ts` | 读配置替换硬编码 | 1.3 |
| `packages/desktop/src/Settings.tsx` | 新增 UI 输入项 | 2.1 |
