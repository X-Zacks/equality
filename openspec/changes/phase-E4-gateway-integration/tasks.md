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

- [x] 1.1.1 新增 import：`TaskRegistry`, `JsonTaskStore`, `TERMINAL_STATES` 和 `TaskRuntime` 类型
- [x] 1.1.2 在 `skillsWatcher.start()` 之后、`cronScheduler` 构造之前创建 `taskRegistry` 实例
- [x] 1.1.3 调用 `await taskRegistry.restore()` 并输出恢复日志
- [x] 1.1.4 在 `process.on('SIGINT')` 和 `process.on('SIGTERM')` 中追加 `await taskRegistry.flush()`

### 1.2 SSE 任务事件推送（`packages/core/src/index.ts`）

- [x] 1.2.1 在 `taskRegistry.restore()` 之后订阅 `taskRegistry.events.on()`
- [x] 1.2.2 将 `state_changed` 等任务事件广播到所有 `sseClients`
- [x] 1.2.3 事件 payload 包含 `type: 'task_event'`、`taskId`、`state`、`runtime`、`timestamp`
- [x] 1.2.4 广播异常（客户端断开）时从 `sseClients` 中移除，不抛出

### 1.3 HTTP API 路由（`packages/core/src/index.ts`）

- [x] 1.3.1 实现 `GET /tasks`：列出任务摘要，支持 `?runtime=` 查询参数过滤
- [x] 1.3.2 实现 `GET /tasks/:taskId`：返回任务详情，不存在时返回 404
- [x] 1.3.3 实现 `POST /tasks/:taskId/steer`：向任务注入 steering 消息
  - [x] 1.3.3a body 缺少 `message` 时返回 400
  - [x] 1.3.3b taskId 不存在时返回 404
  - [x] 1.3.3c 任务已处于终态时返回 409 并说明当前状态
- [x] 1.3.4 实现 `DELETE /tasks/:taskId`：取消任务
  - [x] 1.3.4a 取消成功返回 `{ ok: true, state: 'cancelled' }`
  - [x] 1.3.4b 取消已结束任务抛错时返回 400 并透传原因

### 1.4 cron 任务集成（`packages/core/src/index.ts`，`runAgentTurn` 回调）

- [x] 1.4.1 在 `runAgentTurn` 内调用 `taskRegistry.register({ runtime: 'cron', ... })` 注册任务
- [x] 1.4.2 任务注册后立即 `taskRegistry.transition(task.id, 'running')`
- [x] 1.4.3 `runAttempt` 成功完成后 `taskRegistry.transition(task.id, 'succeeded', summary)`
- [x] 1.4.4 `runAttempt` 抛出异常后 `taskRegistry.transition(task.id, 'failed', errMsg)`
- [x] 1.4.5 确认 AbortError（用户取消）时转为 `cancelled` 而非 `failed`

> ⚠️ 影响范围分析发现：`CronScheduler.runAgentTurn` 签名为 `(sessionKey, userMessage) => Promise<string>`，无 `jobId` 参数。任务 title 使用 sessionKey 替代。

---

## 2. FailoverPolicy onModelSwitch 接通（E4.2）

### 2.1 修改 `providers/index.ts`

> ⚠️ 影响范围分析发现：`getDefaultProvider()` 不使用 FallbackProvider（仅返回首个可用 provider），只有 `getProviderWithFallback()` 才构建 FallbackProvider。因此 `onModelSwitch` 仅需在 `getProviderWithFallback()` 中接入。

- [x] 2.1.1 import `OnModelSwitch` 类型（来自 `providers/fallback.ts`）
- [x] 2.1.2 修改 `getProviderWithFallback()` 接受可选 `opts?: { onModelSwitch?: OnModelSwitch }` 并透传给 `FallbackProvider`
- [x] ~~2.1.3~~ `getDefaultProvider()` 不需要修改（不涉及 FallbackProvider）
- [x] ~~2.1.4~~ 已包含在 2.1.2 中

### 2.2 接入 Gateway（`packages/core/src/index.ts`）

> ⚠️ 影响范围分析发现：`/chat/stream` 中无显式 provider 时不调用 `getDefaultProvider()`（由 runner 内部通过 `routeModel()` 选择）。因此改为：在 cron 的 `runAgentTurn` 和 `/chat/stream` 无显式 provider 时，使用 `getProviderWithFallback({ onModelSwitch })` 替代。

- [x] 2.2.1 ~~在 index.ts 中创建 `makeProvider()` 辅助函数~~ 改为直接在 `getProviderWithFallback()` 中支持 onModelSwitch 参数
- [x] 2.2.2 `onModelSwitch` 回调内调用 `broadcastNotification()` 发送切换通知（调用方只需传入回调即可）
- [x] 2.2.3 通知 title 为"模型已自动切换"，body 包含 fromProvider、toProvider、reason（由 OnModelSwitch 类型保证）

---

## 3. SubagentManager 接入 Gateway（E4.3）

### 3.1 初始化（`packages/core/src/index.ts`）

- [x] 3.1.1 新增 import：`SubagentManager`
- [x] 3.1.2 在 `taskRegistry` 初始化之后创建 `subagentManager` 实例
- [x] 3.1.3 传入 `{ taskRegistry, runAttempt, defaults: { workspaceDir: getWorkspaceDir() } }`
- [x] 3.1.4 创建后立即调用各工具的 `setSubagentManager()` 完成延迟绑定

### 3.2 工具 execute 实现（`packages/core/src/tools/builtins/`）

- [x] 3.2.1 `subagent-spawn.ts`：导出 `setSubagentManagerForSpawn()` 函数，替换 execute stub
- [x] 3.2.2 `subagent-list.ts`：导出 `setSubagentManagerForList()`，替换 execute stub
- [x] 3.2.3 `subagent-steer.ts`：导出 `setSubagentManagerForSteer()`，替换 execute stub
- [x] 3.2.4 `subagent-kill.ts`：导出 `setSubagentManagerForKill()`，替换 execute stub

### 3.3 注册到 builtinTools（`packages/core/src/tools/index.ts`）

- [x] 3.3.1 import 4 个 subagent 工具（spawn/list/steer/kill）
- [x] 3.3.2 将其加入 `builtinTools` 数组
- [x] 3.3.3 同时导出 `setSubagentManager` 系列函数（或从各工具文件直接导出）
- [x] 3.3.4 ~~确认 `ToolContext` 类型中包含 `sessionKey` 字段~~ ✅ 已确认：`ToolContext.sessionKey?: string` 已存在，runner.ts 传入 `params.sessionKey`

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
