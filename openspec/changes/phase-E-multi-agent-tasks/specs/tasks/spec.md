# Delta Spec: Phase E — 任务注册中心

> 本变更引入新的 spec domain：`tasks`。
> 依赖：[../../../specs/gateway/spec.md](../../../specs/gateway/spec.md)、[../../../specs/session/spec.md](../../../specs/session/spec.md)

---

## ADDED Requirements

### Requirement: 任务注册中心

系统 SHALL 提供统一的任务注册中心（Task Registry），用于管理所有长生命周期任务。

- 每个任务 MUST 具有全局唯一的 `taskId`
- 任务 MUST 记录 `runtime`、`state`、`title`、`createdAt`
- 任务 MAY 关联 `sessionKey`、`parentTaskId`、`parentSessionKey`
- 所有任务状态变更 MUST 通过统一注册中心完成
- 任务注册中心 MUST 为 cron、subagent、manual 三类运行时提供统一视图

#### Scenario: cron 任务被注册
- GIVEN 一个 cron 调度器到点触发了自动执行
- WHEN 任务开始执行前
- THEN 系统创建一个 `runtime='cron'` 的任务记录
- AND 初始状态为 `queued`
- AND 进入执行后状态变为 `running`

#### Scenario: 子任务具有父任务关系
- GIVEN 主 Agent 派生了一个子 Agent
- WHEN 子 Agent 被创建
- THEN 系统创建一个 `runtime='subagent'` 的任务记录
- AND 该记录包含 `parentTaskId` 或 `parentSessionKey`

---

### Requirement: 任务状态机

系统 SHALL 对任务状态使用统一状态机。

合法状态集合：
- `queued`
- `running`
- `succeeded`
- `failed`
- `timed_out`
- `cancelled`
- `lost`

合法迁移：
- `queued → running`
- `running → succeeded | failed | timed_out | cancelled`
- 启动恢复时，残留的 `running → lost`

非法迁移 MUST 被拒绝并记录警告日志。

#### Scenario: 合法完成流转
- GIVEN 一个 `queued` 状态的任务
- WHEN 执行器启动该任务并顺利完成
- THEN 状态按顺序变为 `running` 和 `succeeded`

#### Scenario: 非法迁移被拒绝
- GIVEN 一个已经 `succeeded` 的任务
- WHEN 某模块尝试再将其迁移到 `running`
- THEN 注册中心拒绝该迁移
- AND 保持原状态不变

---

### Requirement: 任务持久化与恢复

系统 SHALL 持久化任务快照，并在 Gateway 启动时恢复。

- 任务状态 MUST 持久化到本地磁盘
- 启动恢复时，上次退出前仍为 `running` 的任务 MUST 被标记为 `lost`
- 恢复过程 MUST NOT 自动重启 `lost` 任务（Phase E 不做 orphan recovery）
- 持久化失败 SHOULD 记录警告，但 MUST NOT 阻塞 Gateway 继续启动

#### Scenario: 异常退出后的恢复
- GIVEN Gateway 上次退出前有一个 `running` 中的 subagent 任务
- WHEN Gateway 再次启动并恢复任务快照
- THEN 该任务状态被改写为 `lost`
- AND 任务仍可在任务列表中查询到

---

### Requirement: 任务控制与通知策略

系统 SHALL 支持对运行中任务进行控制，并支持可配置的通知策略。

- 运行中任务 MUST 支持 `cancel`
- 支持 steering 的任务 MUST 支持 `steer(message)`
- 每个任务 MUST 支持 `notificationPolicy`
- `notificationPolicy` 至少包含：`done_only` / `state_changes` / `silent`
- 任务状态变化 SHOULD 通过事件流或 SSE 对外广播

#### Scenario: 用户取消运行中任务
- GIVEN 一个状态为 `running` 的后台任务
- WHEN 用户调用取消接口
- THEN 系统中止该任务的执行
- AND 将任务状态迁移为 `cancelled`

#### Scenario: 静默任务不推送通知
- GIVEN 一个任务的 `notificationPolicy='silent'`
- WHEN 任务状态发生变化
- THEN 系统不向外发送用户可见通知

---

## MODIFIED Requirements

（无）

---

## REMOVED Requirements

（无）
