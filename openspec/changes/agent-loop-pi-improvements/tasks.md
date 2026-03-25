# Tasks: Agent Loop 能力增强

> 状态：🔲 未开始

---

## 阶段 A：工具并行执行

- [x] A.1 在 `runner.ts` toolLoop 内，将顺序 `for` 循环替换为 `Promise.allSettled` 并发执行
  - 每个工具的执行封装为独立 async 函数（含 args 解析、onToolStart、execute、onToolResult、logToolCall）
  - 返回 `ToolExecResult` 结构体（tc、resultContent、isError、durationMs、args）
- [x] A.2 汇总阶段：按原始顺序遍历 `Promise.allSettled` 结果，顺序写入 messages
  - rejected 的 settled 视为 `isError: true`，resultContent = 错误消息
- [x] A.3 汇总阶段：LoopDetector.check() 保持按顺序调用
- [x] A.4 汇总阶段：断路器（breakerTriggered）逻辑不变，去掉"为未执行工具补占位"逻辑（并行时不存在未执行工具）
- [x] A.5 TypeScript 编译零新增错误

---

## 阶段 B：beforeToolCall / afterToolCall Hook

> 依赖：阶段 A 完成

- [x] B.1 扩展 `RunAttemptParams`，加入 `beforeToolCall?` 和 `afterToolCall?` 可选字段
- [x] B.2 在各工具的 exec 函数内，`onToolStart` 之前调用 `beforeToolCall`
  - 返回 `{ block: true, reason }` 时：resultContent = reason，isError = true，跳过 execute
  - 抛出异常时：记录 warn，视为允许执行
- [x] B.3 在 `tool.execute()` 完成后、`onToolResult` 之前调用 `afterToolCall`
  - 返回 `{ result: newContent }` 时：写入 messages 的内容替换为 newContent（onToolResult 仍用原始值）
  - 抛出异常时：记录 warn，使用原始 result
- [x] B.4 TypeScript 编译零新增错误

---

## 阶段 C：transformContext 主动上下文裁剪

> ✅ 完成（参数与 OpenClaw 对齐）

- [x] C.1 `tools/truncation.ts` 重写：动态阈值（`contextWindow × 30% × 4字/token`），绝对上限 400,000 字，head+tail 策略保留尾部重要内容（error/JSON/summary）
- [x] C.2 `tools/index.ts` 导出 `calcMaxToolResultChars`、`HARD_MAX_TOOL_RESULT_CHARS`、`DEFAULT_MAX_TOOL_RESULT_CHARS`
- [x] C.3 `runner.ts` 工具执行时调用 `calcMaxToolResultChars(provider.getCapabilities().contextWindow)` 传入动态上限
- [x] C.4 `DefaultContextEngine.assemble()` 步骤 5 新增 `enforceToolResultBudget()`：
  - 单条上限：`contextWindow × 4字 × 50%`，超限内容替换为占位（保留消息条目）
  - 全局预算：`contextWindow × 4字 × 75%`，超限时从最旧 tool result 开始 compact
  - `trimMessages` 退化为最后兜底，预算也改为动态计算
- [x] C.5 TypeScript 编译零新增错误

---

## 阶段 D：Steering 消息

> ✅ 完成

- [x] D.1 扩展 `RunAttemptParams`，加入 `steeringQueue?: string[]` 可选字段
- [x] D.2 在 `runner.ts` toolLoop 中，每轮工具全部执行完后（汇总阶段结束后），检查 `steeringQueue`
  - 有消息时：shift() 取出，push 到 messages（role: user），发出 onDelta 提示
- [x] D.3 在 `index.ts` 中创建 `steeringQueues: Map<string, string[]>`，注释说明生命周期
- [x] D.4 `runAttempt` 调用时，复用或新建对应 session 的 queue，通过 `steeringQueue` 传入引用
- [x] D.5 `finally` 块中 `steeringQueues.delete(sessionKey)`，避免队列泄漏
- [x] D.6 新增 HTTP 端点 `POST /chat/steer`
  - body: `{ sessionKey?: string, message: string }`
  - response: `{ ok: boolean, queued: boolean, reason?: string }`
  - 仅当 session 在 `activeAborts` 中（正在运行）且 steeringQueues 中有对应队列时入队（queued: true）
  - 否则返回 queued: false + reason，提示改用 `/chat/stream`
- [x] D.7 TypeScript 编译零新增错误
