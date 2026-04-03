# Tasks: Phase E4 — Gateway 集成

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)
>
> 前置条件：
> - E1 `TaskRegistry` 已完成（`tasks/types.ts`, `tasks/registry.ts`, `tasks/store.ts`, `tasks/events.ts`）
> - E2 `FailoverPolicy` 已完成（`providers/failover-policy.ts`，`providers/fallback.ts` 已重构）
> - E3 `SubagentManager` + 4 个工具 schema 已完成（`agent/subagent-manager.ts`, `tools/builtins/subagent-*.ts`）
> - 以上所有模块单元测试全部通过（T27-T44，149 assertions）

---

## 1. TaskRegistry 接入 Gateway（E4.1）

### 1.1 初始化与持久化（`packages/core/src/index.ts`）

- [ ] 1.1.1 新增 import：`TaskRegistry`, `JsonTaskStore`, `TERMINAL_STATES` 和 `TaskRuntime` 类型
- [ ] 1.1.2 在 `skillsWatcher.start()` 之后、`cronScheduler` 构造之前创建 `taskRegistry` 实例
- [ ] 1.1.3 调用 `await taskRegistry.restore()` 并输出恢复日志
- [ ] 1.1.4 在 `process.on('SIGINT')` 和 `process.on('SIGTERM')` 中追加 `await taskRegistry.flush()`

### 1.2 SSE 任务事件推送（`packages/core/src/index.ts`）

- [ ] 1.2.1 在 `taskRegistry.restore()` 之后订阅 `taskRegistry.events.on()`
- [ ] 1.2.2 将 `state_changed` 等任务事件广播到所有 `sseClients`
- [ ] 1.2.3 事件 payload 包含 `type: 'task_event'`、`taskId`、`state`、`runtime`、`timestamp`
- [ ] 1.2.4 广播异常（客户端断开）时从 `sseClients` 中移除，不抛出

### 1.3 HTTP API 路由（`packages/core/src/index.ts`）

- [ ] 1.3.1 实现 `GET /tasks`：列出任务摘要，支持 `?runtime=` 查询参数过滤
- [ ] 1.3.2 实现 `GET /tasks/:taskId`：返回任务详情，不存在时返回 404
- [ ] 1.3.3 实现 `POST /tasks/:taskId/steer`：向任务注入 steering 消息
  - [ ] 1.3.3a body 缺少 `message` 时返回 400
  - [ ] 1.3.3b taskId 不存在时返回 404
  - [ ] 1.3.3c 任务已处于终态时返回 409 并说明当前状态
- [ ] 1.3.4 实现 `DELETE /tasks/:taskId`：取消任务
  - [ ] 1.3.4a 取消成功返回 `{ ok: true, state: 'cancelled' }`
  - [ ] 1.3.4b 取消已结束任务抛错时返回 400 并透传原因

### 1.4 cron 任务集成（`packages/core/src/index.ts`，`runAgentTurn` 回调）

- [ ] 1.4.1 在 `runAgentTurn` 内调用 `taskRegistry.register({ runtime: 'cron', ... })` 注册任务
- [ ] 1.4.2 任务注册后立即 `taskRegistry.transition(task.id, 'running')`
- [ ] 1.4.3 `runAttempt` 成功完成后 `taskRegistry.transition(task.id, 'succeeded', summary)`
- [ ] 1.4.4 `runAttempt` 抛出异常后 `taskRegistry.transition(task.id, 'failed', errMsg)`
- [ ] 1.4.5 确认 AbortError（用户取消）时转为 `cancelled` 而非 `failed`

---

## 2. FailoverPolicy onModelSwitch 接通（E4.2）

### 2.1 修改 `providers/index.ts`

- [ ] 2.1.1 为 `getDefaultProvider()` 添加可选参数 `opts?: { onModelSwitch?: OnModelSwitch }`
- [ ] 2.1.2 import `OnModelSwitch` 类型（来自 `providers/fallback.ts` 或 `providers/failover-policy.ts`）
- [ ] 2.1.3 修改 `getProviderWithFallback()` 同样接受 `onModelSwitch` 选项并透传给 `FallbackProvider`
- [ ] 2.1.4 `getDefaultProvider()` 在构建 `FallbackProvider` 时将 `opts.onModelSwitch` 传入构造器

### 2.2 接入 Gateway（`packages/core/src/index.ts`）

- [ ] 2.2.1 在 Gateway 顶层创建带 `onModelSwitch` 回调的 `defaultProvider` 单例（模块级变量）
- [ ] 2.2.2 `onModelSwitch` 回调内调用 `broadcastNotification()` 发送切换通知
- [ ] 2.2.3 通知 title 为"模型已自动切换"，body 包含 fromProvider、toProvider、reason
- [ ] 2.2.4 `/chat/stream` 路由中无显式 provider 指定时，优先使用该顶层 `defaultProvider`

---

## 3. SubagentManager 接入 Gateway（E4.3）

### 3.1 初始化（`packages/core/src/index.ts`）

- [ ] 3.1.1 新增 import：`SubagentManager`
- [ ] 3.1.2 在 `taskRegistry` 初始化之后创建 `subagentManager` 实例
- [ ] 3.1.3 传入 `{ taskRegistry, runAttempt, defaults: { workspaceDir: getWorkspaceDir() } }`
- [ ] 3.1.4 创建后立即调用各工具的 `setSubagentManager()` 完成延迟绑定

### 3.2 工具 execute 实现（`packages/core/src/tools/builtins/`）

- [ ] 3.2.1 `subagent-spawn.ts`：导出 `setSubagentManager()` 函数，替换 execute stub
  - execute 解析 `prompt`, `goal`, `allowed_tools`, `timeout_seconds`
  - 从 `ctx.sessionKey` 获取父会话 key
  - 调用 `manager.spawn(parentSessionKey, params)`
  - 成功返回 `{ taskId, state, goal }`
  - 失败（depth 超限等）返回 `isError: true`

- [ ] 3.2.2 `subagent-list.ts`：导出 `setSubagentManager()`，替换 execute stub
  - 从 `ctx.sessionKey` 获取父会话 key
  - 调用 `manager.list(parentSessionKey)`
  - 返回子任务列表（id、state、goal、createdAt）

- [ ] 3.2.3 `subagent-steer.ts`：导出 `setSubagentManager()`，替换 execute stub
  - 解析 `task_id`、`message`
  - 调用 `manager.steer(taskId, message)`
  - 成功返回 `{ ok: true }`；taskId 不存在返回 `isError: true`

- [ ] 3.2.4 `subagent-kill.ts`：导出 `setSubagentManager()`，替换 execute stub
  - 解析 `task_id`
  - 调用 `manager.kill(taskId)`
  - 成功返回 `{ ok: true, state: 'cancelled' }`；taskId 不存在返回 `isError: true`

### 3.3 注册到 builtinTools（`packages/core/src/tools/index.ts`）

- [ ] 3.3.1 import 4 个 subagent 工具（spawn/list/steer/kill）
- [ ] 3.3.2 将其加入 `builtinTools` 数组
- [ ] 3.3.3 同时导出 `setSubagentManager` 系列函数（或从各工具文件直接导出）
- [ ] 3.3.4 确认 `ToolContext` 类型中包含 `sessionKey` 字段（如不包含，补充类型定义）

---

## 4. 集成验证（端到端冒烟测试）

### 4.1 TaskRegistry 验证

- [ ] 4.1.1 启动 Gateway，日志中出现 `TaskRegistry 已恢复 N 个任务`
- [ ] 4.1.2 GET `/tasks` 返回空数组（首次启动无历史）
- [ ] 4.1.3 触发一次 cron 任务后，GET `/tasks` 返回 1 条 `runtime='cron'` 记录
- [ ] 4.1.4 SSE 客户端收到 `task_event` 事件流（state 从 queued → running → succeeded）
- [ ] 4.1.5 SIGINT 后重启 Gateway，GET `/tasks` 仍返回上次的任务记录

### 4.2 FailoverPolicy 验证

- [ ] 4.2.1 手动触发 failover（可通过 mock 或测试端点）
- [ ] 4.2.2 SSE 客户端收到 `notification` 类型事件，title 包含"模型已自动切换"

### 4.3 SubagentManager 验证

- [ ] 4.3.1 启动后 GET `/tools` 响应包含 `subagent_spawn`, `subagent_list`, `subagent_steer`, `subagent_kill`
- [ ] 4.3.2 模拟 LLM 调用 `subagent_spawn`，返回 `{ taskId: "...", state: "queued" }` 而非 `isError: true`
- [ ] 4.3.3 GET `/tasks?runtime=subagent` 返回子任务记录
- [ ] 4.3.4 调用 `subagent_kill` 后任务状态变为 `cancelled`

---

## 附：测试编号延续

E4 不新增独立单元测试文件（集成行为靠 E1/E2/E3 的单元测试覆盖），但在 4.1-4.3 中补充端到端冒烟测试记录。

若发现接口对接问题需补单元测试，从 T45 开始编号。
