# Delta Spec: Phase E — Gateway 任务控制面

> 依赖: [../../../specs/gateway/spec.md](../../../specs/gateway/spec.md)
>
> 本 Delta Spec 覆盖 GAP-8 / GAP-9：任务查询、steer、kill 与任务事件推送。

---

## ADDED Requirements

### Requirement: 任务 HTTP API

Gateway SHALL 暴露统一的任务控制面 HTTP API。

至少包括：
- `GET /tasks`：列出任务摘要
- `GET /tasks/:taskId`：获取任务详情
- `POST /tasks/:taskId/steer`：向目标任务发送 steering 消息
- `DELETE /tasks/:taskId`：取消目标任务

- 任务控制 API MUST 仅面向本地可信调用方
- 对不存在的任务 MUST 返回 404
- 对已结束任务的 `steer` / `cancel` MUST 返回可解释的错误信息

#### Scenario: 查询任务详情
- GIVEN 本地 UI 需要显示一个长任务的执行状态
- WHEN 前端调用 `GET /tasks/:taskId`
- THEN Gateway 返回该任务的当前状态、运行时类型和最近摘要

#### Scenario: 向运行中任务发送 steering
- GIVEN 一个仍在 `running` 的子任务
- WHEN 前端调用 `POST /tasks/:taskId/steer`
- THEN Gateway 将该消息投递给任务注册中心
- AND 返回 `ok=true`

---

### Requirement: 任务事件推送

Gateway SHOULD 提供任务事件流，便于 UI 实时显示任务进度。

- 任务状态变化 SHOULD 以 SSE 或等价事件流推送
- 至少包括：`queued`、`running`、`succeeded`、`failed`、`cancelled`、`timed_out`
- 事件负载 SHOULD 包含 `taskId`、`state`、`runtime`、`timestamp`
- 事件广播 MUST NOT 阻塞主执行流程

#### Scenario: 任务状态变化被实时推送
- GIVEN 一个任务从 `queued` 迁移到 `running`
- WHEN 状态变更完成
- THEN Gateway 向任务事件流推送一条 `state_changed` 事件
- AND UI 可立即刷新任务状态

---

## MODIFIED Requirements

### Requirement: Gateway 启动序列（修改）

**原规格**：
Gateway 按配置、API Key、SessionStore、Skills、HTTP 服务等顺序启动。

**修改后**：
- Gateway 启动时 MUST 初始化 `TaskRegistry`
- Gateway 启动时 SHOULD 恢复持久化任务快照
- Gateway 关闭时 SHOULD 尽力刷新任务快照到磁盘

#### Scenario: Gateway 启动恢复任务视图
- GIVEN 上次运行留下了任务快照文件
- WHEN Gateway 启动
- THEN 系统先恢复该快照
- AND 将残留 `running` 任务标记为 `lost`

---

## REMOVED Requirements

（无）
