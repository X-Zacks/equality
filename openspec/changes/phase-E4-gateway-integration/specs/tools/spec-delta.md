# Delta Spec: Phase E4 — 工具注册表 subtask 工具接入

> 本 Delta 覆盖 `tools/index.ts`（builtinTools 注册）和 4 个 subtask 工具文件的 execute 实现。
>
> 依赖: Phase E3 的 `tools/spec-delta.md`

---

## ADDED Requirements

### Requirement: subtask 工具注册

`builtinTools` 数组 SHALL 包含 `subtask_spawn`、`subtask_list`、`subtask_steer`、`subtask_kill` 四个工具。

约束：
- 四个工具 MUST 在 Gateway 启动时注册到 `ToolRegistry`
- `GET /tools` 端点响应 MUST 包含上述工具名

#### Scenario: 工具注册完整性
- GIVEN Gateway 冷启动完成
- WHEN 调用 `GET /tools`
- THEN 响应 JSON 数组包含 `subtask_spawn`、`subtask_list`、`subtask_steer`、`subtask_kill`

---

### Requirement: subtask 工具延迟绑定机制

由于 `SubtaskManager` 在工具注册之后才被创建，4 个 subtask 工具 SHALL 通过**延迟绑定**机制接收 Manager 引用。

每个工具文件 MUST 导出 `setSubtaskManager(manager: SubtaskManager): void` 函数。

约束：
- Gateway 在创建 `SubtaskManager` 后 MUST 立即调用 4 次 `setSubtaskManager()`
- 若 `execute` 在 `setSubtaskManager()` 调用前被触发（Manager 未初始化），MUST 返回 `isError: true` 并说明原因
- 延迟绑定使用模块级变量，在 Node.js 单线程环境下是安全的

#### Scenario: 未绑定时调用工具
- GIVEN Gateway 异常启动，`setSubtaskManager()` 未被调用
- WHEN LLM 调用任意 subtask 工具
- THEN 工具返回 `{ isError: true, content: 'SubtaskManager not initialized' }`

---

### Requirement: subtask_spawn 工具语义

`subtask_spawn` 工具 SHALL 通过 `SubtaskManager.spawn()` 创建子任务。

输入参数：
- `prompt`（必需）：子任务的任务指令
- `goal`（可选）：任务目标描述（用于展示）
- `allowed_tools`（可选）：逗号分隔的工具白名单
- `timeout_seconds`（可选）：超时时间（秒），默认 `0`（不限制，受 30 分钟全局安全阀保护）

约束：
- execute 实现 MUST 从 `ctx.sessionKey` 读取父会话 key
- execute 实现 MUST 从 `ctx.provider` 读取父会话 Provider 信息（`providerId` + `modelId`），作为 `parentProviderInfo` 传给 `spawn()`
- 子任务 MUST 继承父会话的模型（不走自动路由）
- 调用成功 MUST 返回 `{ taskId, success, summary }` 的 JSON 字符串
- 子任务深度超限（depth >= maxDepth）时 MUST 返回 `isError: true`

#### Scenario: 成功创建子任务
- GIVEN SubtaskManager 已初始化，父 Agent depth=0
- WHEN 调用 `subtask_spawn({ prompt: "分析 src/ 目录结构" })`
- THEN 返回 `{ taskId: "task_xxx", success: true, summary: "..." }`

#### Scenario: 子任务继承父会话模型
- GIVEN 用户在主会话选择了 `claude/claude-opus-4`
- WHEN LLM 调用 `subtask_spawn({ prompt: "..." })`
- THEN 子任务使用 `claude/claude-opus-4` 而非自动路由模型

---

### Requirement: subtask_list 工具语义

`subtask_list` 工具 SHALL 通过 `SubtaskManager.list()` 列出当前父会话的所有子任务。

约束：
- 使用 `ctx.sessionKey` 作为父会话 key 查询
- 返回 JSON 数组，每项包含 `id`、`state`、`goal`（若有）、`createdAt`

#### Scenario: 列出子任务
- GIVEN 父 Agent 已 spawn 2 个子任务
- WHEN 调用 `subtask_list({})`
- THEN 返回包含 2 条记录的 JSON 数组

---

### Requirement: subtask_steer 工具语义

`subtask_steer` 工具 SHALL 通过 `SubtaskManager.steer()` 向子任务发送 steering 消息。

输入参数：
- `task_id`（必需）：目标子任务 ID
- `message`（必需）：steering 消息内容

约束：
- `task_id` 不存在时 MUST 返回 `isError: true`
- 成功时返回 `{ ok: true }`

---

### Requirement: subtask_kill 工具语义

`subtask_kill` 工具 SHALL 通过 `SubtaskManager.kill()` 取消子任务。

输入参数：
- `task_id`（必需）：目标子任务 ID

约束：
- `task_id` 不存在时 MUST 返回 `isError: true`
- 成功时返回 `{ ok: true, state: 'cancelled' }`

---

### Requirement: ToolContext 包含 sessionKey 和 provider

runner.ts 在调用工具 `execute` 时传递的 `ctx` 对象 SHALL 包含 `sessionKey` 和 `provider` 字段。

约束：
- `ToolContext` 类型定义 MUST 包含 `sessionKey: string` 和 `provider?: LLMProvider`
- `runAttempt` 调用工具时 MUST 将当前会话的 sessionKey 和已解析的 provider 注入到 ctx
- subtask 工具 MUST 通过 `ctx.sessionKey` 获取父会话 key，通过 `ctx.provider` 获取父 Provider 信息

#### Scenario: subtask_spawn 使用 ctx.sessionKey 和 ctx.provider
- GIVEN runner 在会话 `main-session` 中以 `claude/claude-opus-4` 执行工具调用
- WHEN LLM 调用 `subtask_spawn({ prompt: "..." })`
- THEN `execute` 中 `ctx.sessionKey === 'main-session'`
- AND `execute` 中 `ctx.provider.modelId === 'claude-opus-4'`
- AND 子任务的 `parentSessionKey` 为 `'main-session'`
- AND 子任务使用 `claude-opus-4` 运行

---

## MODIFIED Requirements

（无 — subtask 工具在 Phase E3 中为 schema 占位，无需标记 MODIFIED）

---

## REMOVED Requirements

（无）
