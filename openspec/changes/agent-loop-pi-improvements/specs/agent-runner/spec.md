# Delta Spec: Agent Runner

> 所属变更：[agent-loop-pi-improvements](../../)  
> 主规格：[specs/agent-runner/spec.md](../../../specs/agent-runner/spec.md)

---

## ADDED Requirements

### Requirement: 工具并行执行

系统 SHALL 在同一轮 LLM 响应中并发执行多个工具调用。

- 并发模式下，各工具 MUST 各自独立触发 `onToolStart` 和 `onToolResult` 事件
- 工具结果写入消息列表时 MUST 严格按照 LLM 输出的工具调用原始顺序
- 任一工具执行失败（抛出异常）MUST NOT 导致其他工具的结果丢失
- LoopDetector 检测 MUST 在所有工具执行完毕后，按原始顺序批量执行

#### Scenario: 同一轮三个工具并发执行
- GIVEN LLM 响应包含三个工具调用：`read_file`、`glob`、`bash`
- WHEN `runAttempt` 执行工具调用
- THEN 三个工具 SHALL 同时启动（不等待前一个完成）
- AND 系统等待所有工具完成（无论成功或失败）
- AND 工具结果按 read_file → glob → bash 顺序写入消息列表

#### Scenario: 并行执行中某工具失败
- GIVEN 三个工具并发执行，其中 `bash` 抛出异常
- WHEN 系统汇总结果
- THEN `read_file` 和 `glob` 的结果 SHALL 正常写入消息列表
- AND `bash` 的结果写入 `isError: true` 的工具结果
- AND Agent 继续运行（不崩溃）

---

### Requirement: 工具执行前拦截（beforeToolCall Hook）

系统 SHOULD 支持可选的 `beforeToolCall` 异步 Hook，在工具执行前提供拦截机会。

- Hook 返回 `{ block: true, reason: string }` 时 MUST 跳过工具执行
- 被 block 的工具 MUST 向 LLM 返回 `isError: true` 的工具结果，内容为 `reason`
- Hook 本身抛出异常时 MUST 记录 warn 并继续执行工具（Hook 不能比工具本身更脆弱）

#### Scenario: 拦截危险命令
- GIVEN `beforeToolCall` hook 检测到 bash 命令包含 `rm -rf /`
- WHEN LLM 请求执行该 bash 调用
- THEN hook 返回 `{ block: true, reason: "危险命令已拦截" }`
- AND bash 工具不执行
- AND LLM 收到工具结果：`isError: true`，内容为 "危险命令已拦截"
- AND LLM 继续响应（可能道歉或换一种方式完成任务）

---

### Requirement: 工具执行后处理（afterToolCall Hook）

系统 SHOULD 支持可选的 `afterToolCall` 异步 Hook，在工具结果写入消息列表前提供后处理机会。

- Hook 返回 `{ result: newContent }` 时，写入消息列表的内容 MUST 替换为 `newContent`
- `onToolResult` 回调 SHOULD 使用工具原始返回值（不受 Hook 替换影响）
- Hook 抛出异常时 MUST 记录 warn 并使用原始结果

#### Scenario: 结果后处理
- GIVEN `afterToolCall` hook 对 read_file 结果追加行号
- WHEN read_file 执行完毕，原始结果为 "line1\nline2"
- THEN hook 返回 `{ result: "1: line1\n2: line2" }`
- AND LLM 看到的工具结果为带行号版本

---

### Requirement: 执行中注入用户指令（Steering）

系统 MAY 支持在 Agent 工具循环执行过程中注入新的用户指令（Steering 消息）。

- Steering 消息 MUST 通过独立 HTTP 端点 `POST /chat/steer` 提交
- Steering 消息 SHALL 在当前轮次所有工具执行完毕后、下一次 LLM 调用前注入
- 当 Session 处于空闲状态时，Steering 消息 MUST 被丢弃，响应 `queued: false`

#### Scenario: 用户在 Agent 执行中途调整方向
- GIVEN Agent 正在执行工具调用循环
- WHEN 用户通过 `POST /chat/steer` 发送 "改用 read_file 代替 bash"
- THEN 消息进入 Steering 队列
- AND 当前轮次工具执行完毕后，该消息作为 user 角色注入消息列表
- AND LLM 在下一轮调用时看到该指令并调整行为
