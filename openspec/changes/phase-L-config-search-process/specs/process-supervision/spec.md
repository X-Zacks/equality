# Delta Spec: Process Supervision

> Phase L3 — GAP-34

## ADDED Requirements

### Requirement: 命令队列

系统 MUST 通过 `CommandQueue` 限制并发子进程数。

- 默认并发上限：5（可通过配置调整）
- 超过并发上限时，新命令 MUST 排队等待
- 排队超时（默认 60s）后 MUST 拒绝命令
- 队列 MUST 支持 FIFO 顺序

#### Scenario: 在并发上限内执行
- GIVEN 当前运行进程数为 3，上限为 5
- WHEN `enqueue(command, cwd)` 被调用
- THEN 命令 MUST 立即执行
- AND 状态 MUST 为 `'running'`

#### Scenario: 超过并发上限排队
- GIVEN 当前运行进程数已达 5
- WHEN `enqueue(command, cwd)` 被调用
- THEN 命令 MUST 进入队列
- AND 状态 MUST 为 `'queued'`
- WHEN 某个运行中的命令完成
- THEN 排队命令 MUST 自动开始执行

#### Scenario: 排队超时
- GIVEN 命令已在队列中等待超过 60s
- WHEN 超时触发
- THEN 命令状态 MUST 变为 `'timeout'`
- AND Promise MUST reject

#### Scenario: 队列状态查询
- GIVEN 3 个运行中 + 2 个排队
- WHEN `getStatus()` 被调用
- THEN MUST 返回 `{ running: 3, queued: 2, maxConcurrent: 5 }`

### Requirement: 进程 Kill Tree

系统 MUST 支持杀死进程及其所有子进程。

- Windows: `taskkill /F /T /PID {pid}`
- Unix: `kill -TERM -{pgid}`（进程组）
- 如果 TERM 超时（3s），MUST 升级为 SIGKILL

#### Scenario: Kill tree on Windows
- GIVEN 一个 PID 为 12345 的进程有 3 个子进程
- WHEN `killProcessTree(12345)` 被调用
- THEN 主进程和所有子进程 MUST 被终止
- AND MUST 返回 `true`

#### Scenario: 进程已退出
- GIVEN PID 不存在
- WHEN `killProcessTree(99999)` 被调用
- THEN MUST 返回 `false`（静默处理）

### Requirement: 队列命令取消

- `kill(commandId)` — 终止指定命令
- 如果命令在运行中，MUST 调用 killProcessTree
- 如果命令在队列中，MUST 直接移除

#### Scenario: 取消运行中的命令
- GIVEN 命令 `cmd-1` 正在运行
- WHEN `kill('cmd-1')` 被调用
- THEN 进程 MUST 被 killProcessTree 终止
- AND 状态 MUST 变为 `'failed'`

#### Scenario: 取消排队中的命令
- GIVEN 命令 `cmd-2` 在队列中等待
- WHEN `kill('cmd-2')` 被调用
- THEN MUST 从队列移除
- AND MUST 返回 `true`

### Requirement: drain 清理

- `drain()` — 等待所有运行中命令完成并清空队列
- 已排队的命令 MUST 被取消
- MUST 返回 Promise

#### Scenario: drain 清理
- GIVEN 2 个运行中 + 3 个排队
- WHEN `drain()` 被调用
- THEN 排队命令 MUST 被取消
- AND MUST 等待运行中命令自然完成
