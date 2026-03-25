# Tasks: Agent Loop 能力增强

> 状态：🔲 未开始

---

## 阶段 A：工具并行执行

- [ ] A.1 在 `runner.ts` toolLoop 内，将顺序 `for` 循环替换为 `Promise.allSettled` 并发执行
  - 每个工具的执行封装为独立 async 函数（含 args 解析、onToolStart、execute、onToolResult、logToolCall）
  - 返回 `ToolExecResult` 结构体（tc、resultContent、isError、durationMs、args）
- [ ] A.2 汇总阶段：按原始顺序遍历 `Promise.allSettled` 结果，顺序写入 messages
  - rejected 的 settled 视为 `isError: true`，resultContent = 错误消息
- [ ] A.3 汇总阶段：LoopDetector.check() 保持按顺序调用
- [ ] A.4 汇总阶段：断路器（breakerTriggered）逻辑不变，去掉"为未执行工具补占位"逻辑（并行时不存在未执行工具）
- [ ] A.5 TypeScript 编译零新增错误

---

## 阶段 B：beforeToolCall / afterToolCall Hook

> 依赖：阶段 A 完成

- [ ] B.1 扩展 `RunAttemptParams`，加入 `beforeToolCall?` 和 `afterToolCall?` 可选字段
- [ ] B.2 在各工具的 exec 函数内，`onToolStart` 之前调用 `beforeToolCall`
  - 返回 `{ block: true, reason }` 时：resultContent = reason，isError = true，跳过 execute
  - 抛出异常时：记录 warn，视为允许执行
- [ ] B.3 在 `tool.execute()` 完成后、`onToolResult` 之前调用 `afterToolCall`
  - 返回 `{ result: newContent }` 时：写入 messages 的内容替换为 newContent（onToolResult 仍用原始值）
  - 抛出异常时：记录 warn，使用原始 result
- [ ] B.4 TypeScript 编译零新增错误

---

## 阶段 C：transformContext 主动上下文裁剪

> ⚠️ 启动前需讨论：裁剪阈值、是否只裁剪旧轮次的 tool result

- [ ] C.1 在 `DefaultContextEngine.assemble()` 中，history 组装后、`compactIfNeeded` 前，插入 tool result 裁剪逻辑
  - `role: 'tool'` 消息内容超过阈值时替换为摘要占位
  - 最近 N 轮（待定）的 tool result 不裁剪
- [ ] C.2 TypeScript 编译零新增错误

---

## 阶段 D：Steering 消息

> ⚠️ 启动前需与阶段 A 完成后讨论时序问题

- [ ] D.1 扩展 `RunAttemptParams`，加入 `steeringQueue?: string[]` 可选字段
- [ ] D.2 在 `runner.ts` toolLoop 中，每轮工具全部执行完后（汇总阶段结束后），检查 `steeringQueue`
  - 有消息时：shift() 取出，push 到 messages（role: user），发出 onDelta 提示
- [ ] D.3 在 `index.ts` 中创建 `steeringQueues: Map<string, string[]>`
- [ ] D.4 `runAttempt` 调用时，将对应 session 的 queue 引用通过 `steeringQueue` 参数传入
- [ ] D.5 新增 HTTP 端点 `POST /chat/steer`
  - body: `{ sessionKey?: string, message: string }`
  - response: `{ ok: boolean, queued: boolean }`
  - 仅当 session 当前在 `activeAborts` 中时写入 queue（queued: true），否则丢弃（queued: false）
- [ ] D.6 TypeScript 编译零新增错误
