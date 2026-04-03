# Delta Spec: Phase E4 — Gateway 启动与运行时集成

> 本 Delta 覆盖 Phase E4 对 Gateway 的改动：任务 HTTP API、SSE 任务事件推送、SubagentManager 初始化、FallbackProvider 模型切换通知。
>
> 依赖: Phase E 的 `tasks/spec.md`、`agent-runner/spec-delta.md`、`llm-provider/spec-delta.md`

---

## ADDED Requirements

### Requirement: 任务 HTTP API

Gateway SHALL 暴露任务控制面 HTTP API，供本地 UI 管理任务。

端点列表：
- `GET /tasks`：返回任务摘要列表，支持 `?runtime=cron|subagent|manual` 过滤
- `GET /tasks/:taskId`：返回单个任务的完整 `TaskRecord`
- `POST /tasks/:taskId/steer`：向运行中任务发送 steering 消息
- `DELETE /tasks/:taskId`：取消指定任务

约束：
- 对不存在的 `taskId` MUST 返回 HTTP 404
- `POST .../steer` 缺少 `message` 字段时 MUST 返回 HTTP 400
- 对已处于终态（`succeeded`/`failed`/`cancelled`/`timed_out`/`lost`）的任务执行 steer MUST 返回 HTTP 409，并在响应体中说明当前状态
- `DELETE /tasks/:taskId` 取消已结束任务时 MUST 返回 HTTP 400 并透传错误原因

#### Scenario: 查询任务列表
- GIVEN Gateway 已处理过若干 cron 任务
- WHEN 前端调用 `GET /tasks`
- THEN 返回 JSON 数组，每项包含 `id`、`state`、`runtime`、`title`、`createdAt`

#### Scenario: 按 runtime 过滤任务
- GIVEN 存在 cron 任务和 subagent 任务各若干条
- WHEN 调用 `GET /tasks?runtime=cron`
- THEN 返回列表中仅包含 `runtime='cron'` 的条目

#### Scenario: 对终态任务发送 steer
- GIVEN 一个状态为 `succeeded` 的任务
- WHEN 调用 `POST /tasks/:taskId/steer` 携带有效消息
- THEN Gateway 返回 HTTP 409
- AND 响应体包含当前状态 `succeeded`

---

### Requirement: SSE 任务事件流

Gateway SHOULD 通过已有 `/events` SSE 端点推送任务状态变更事件。

事件格式（JSON）：
```json
{
  "type": "task_event",
  "taskId": "...",
  "state": "running",
  "runtime": "cron",
  "timestamp": 1712345678901
}
```

约束：
- 任何任务状态变更 MUST 触发 SSE 推送
- 事件推送 MUST NOT 阻塞任务执行流程（异步广播）
- 客户端断开时 MUST 从 `sseClients` 集合中移除，广播不得抛出未捕获异常

#### Scenario: cron 任务状态实时推送
- GIVEN 一个 SSE 客户端已连接 `/events`
- WHEN cron 触发一次任务执行，状态从 `queued → running → succeeded`
- THEN 客户端按顺序收到 3 条 `task_event` 事件

---

### Requirement: subagent 工具可用

Gateway 启动后，`subagent_spawn`、`subagent_list`、`subagent_steer`、`subagent_kill` 四个工具 SHALL 在 `toolRegistry` 中可查。

约束：
- `GET /tools` 的响应 MUST 包含上述 4 个工具名
- LLM 调用 `subagent_spawn` MUST 返回有效的 `taskId`（而非 `isError: true`）
- `subagent_spawn` 的 `execute` MUST 使用 `ctx.sessionKey` 作为父会话 key

#### Scenario: LLM 成功创建子 Agent
- GIVEN Gateway 已初始化 SubagentManager
- WHEN LLM 调用 `subagent_spawn({ prompt: "...", goal: "分析日志" })`
- THEN 工具返回 `{ taskId: "...", state: "queued", goal: "分析日志" }`
- AND `GET /tasks?runtime=subagent` 可查到该任务记录

#### Scenario: 深度限制保护
- GIVEN 一个子 Agent（depth=1）调用 `subagent_spawn`
- WHEN 执行触发
- THEN 工具返回 `isError: true`，说明深度限制（不允许孙子 Agent）

---

### Requirement: 模型切换 SSE 通知

Gateway SHOULD 在 Provider failover 切换模型时，通过 `/events` SSE 推送通知事件。

事件格式与现有 `broadcastNotification` 一致（`type: 'notification'`）：
```json
{
  "type": "notification",
  "title": "模型已自动切换",
  "body": "由于 rate_limit，已从 copilot/gpt-4o 切换到 deepseek/deepseek-chat"
}
```

约束：
- 仅在实际发生 provider 切换时触发，不在每次请求时触发
- 通知 SHOULD 说明切换原因（`FailoverReason`）和新旧 provider ID

#### Scenario: rate_limit 触发切换通知
- GIVEN 主 Provider 返回 429 rate_limit 错误
- WHEN FallbackProvider 切换到下一个可用 Provider
- THEN SSE 客户端收到 `notification` 类型事件
- AND body 中包含 `rate_limit` 字样

---

## MODIFIED Requirements

### Requirement: Gateway 启动序列（修改）

**原规格（Phase E 增量）**：
Gateway 启动时初始化 `TaskRegistry`，恢复持久化快照，关闭时 flush。

**本次修改（E4 增量）**：
在初始化 TaskRegistry 之后，Gateway 还 SHALL：
1. 订阅 `TaskEventBus` → SSE 广播
2. 初始化 `SubagentManager`（依赖 `taskRegistry` 和 `runAttempt`）
3. 绑定 subagent 工具的 `setSubagentManager()`
4. 初始化带 `onModelSwitch` 回调的顶层 `defaultProvider` 单例

完整启动顺序：
```
initSecrets()
getWorkspaceDir()
toolRegistry + builtinTools（含 subagent 工具 schema）
mcpManager
skillsWatcher
TaskRegistry.restore()              ← 本次新增
SubagentManager 初始化             ← 本次新增
setSubagentManager x4              ← 本次新增：绑定工具 execute
defaultProvider（带 onModelSwitch）← 本次新增
CronScheduler
app.listen()
```

#### Scenario: 启动日志验证
- GIVEN Gateway 冷启动
- WHEN 所有模块初始化完成
- THEN 日志中依次出现：
  - `TaskRegistry 已恢复 N 个任务`
  - `SubagentManager 已初始化`
  - `已注册 N 个工具: ..., subagent_spawn, subagent_list, subagent_steer, subagent_kill`

---

### Requirement: Gateway 关闭序列（修改）

**原规格**：SIGINT/SIGTERM 时调用 `mcpManager.stop()`。

**修改后**：
关闭序列 MUST 为：
1. `taskRegistry.flush()` — 立即写盘
2. `mcpManager.stop()` — 关闭 MCP 连接
3. `process.exit(0)`

`taskRegistry.flush()` 失败时 SHOULD 记录警告日志但不阻止进程退出。

---

## REMOVED Requirements

（无）
