# Delta Spec: Phase E — Agent Runner 多 Agent 扩展

> 依赖: [../../../specs/agent-runner/spec.md](../../../specs/agent-runner/spec.md)
>
> 本 Delta Spec 覆盖 GAP-8：单次 `runAttempt` 之外的子 Agent 委派与回填行为。

---

## ADDED Requirements

### Requirement: 子 Agent 委派执行

系统 SHALL 允许主 Agent 将某些工作委派给子 Agent 执行。

- 子 Agent MUST 运行在独立的 child session 中
- 子 Agent MUST 继承父任务的必要上下文（如工作目录、工具白名单、模型偏好）
- 子 Agent 的最终结果 SHOULD 以摘要形式回填给父任务，而非完整逐 token 回放
- 子 Agent 的执行 MUST 注册到任务注册中心

#### Scenario: 子 Agent 独立 session 运行
- GIVEN 主 Agent 创建了一个子 Agent 任务
- WHEN 子 Agent 开始执行
- THEN 它使用独立的 `childSessionKey`
- AND 不直接污染父会话的完整消息历史

#### Scenario: 子 Agent 完成后回填摘要
- GIVEN 子 Agent 已完成一次调查任务
- WHEN 结果被回传给父 Agent
- THEN 父 Agent 获得一条摘要化结果
- AND 可基于该摘要继续后续决策

---

### Requirement: 子 Agent steering

系统 SHALL 支持对运行中的子 Agent 注入方向调整消息（steering）。

- steering MUST 以异步消息方式投递给目标子任务
- steering MUST 保持 FIFO 顺序
- 若目标任务已结束，steering 请求 MUST 被拒绝并说明原因

#### Scenario: 运行中子任务接收 steering
- GIVEN 一个运行中的子 Agent
- WHEN 用户或父 Agent 发送“不要继续改代码，先只收集错误日志”
- THEN 该消息进入子任务的 steering 队列
- AND 子 Agent 在下一轮适当时机消费该消息

---

### Requirement: 子 Agent 取消

系统 SHALL 支持取消运行中的子 Agent。

- `kill` MUST 触发子任务的 `AbortController`
- 被取消的子任务 MUST NOT 再继续写入新的执行结果
- 取消后的子任务状态 MUST 变为 `cancelled`

#### Scenario: kill 中止子任务
- GIVEN 一个正在运行的子 Agent
- WHEN 控制面发出 kill 指令
- THEN 子任务的运行立即被中止
- AND 任务状态迁移为 `cancelled`

---

## MODIFIED Requirements

### Requirement: 运行入口（修改）

**原规格**：
`runAttempt(params)` 表示“一次用户消息 → 一次完整 AI 响应”的统一入口。

**修改后**：
- `runAttempt(params)` 除用户显式发起外，也 MAY 由系统内部的子 Agent 派生调用触发
- 派生调用 SHOULD 通过 `taskId` 和 `parentSessionKey` 与父任务关联
- 子 Agent 运行结果 MAY 不直接面向最终用户，而是先回流给父 Agent

#### Scenario: 系统内部派生运行
- GIVEN 主 Agent 决定委派一个子任务
- WHEN 系统内部调用 child `runAttempt()`
- THEN 子任务被视为一次合法的 Agent 运行
- AND 其输出优先回流给父任务，而非直接推给用户界面

---

## REMOVED Requirements

（无）
