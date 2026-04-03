# Design: Phase E4 — Gateway 集成

> 依赖: [proposal.md](./proposal.md)
>
> 本文档描述 E1/E2/E3 三个模块与 Gateway 运行时的接入方案、依赖注入方式和修改范围。

---

## 总体改动概览

```
packages/core/src/
├── index.ts                          ← 主改动：初始化、路由、SSE、shutdown
├── tools/
│   ├── index.ts                      ← 加入 4 个 subagent 工具
│   └── builtins/
│       ├── subagent-spawn.ts         ← 替换 execute stub → SubagentManager 调用
│       ├── subagent-list.ts          ← 替换 execute stub
│       ├── subagent-steer.ts         ← 替换 execute stub
│       └── subagent-kill.ts          ← 替换 execute stub
└── providers/
    └── index.ts                      ← 构建 FallbackProvider 时注入 onModelSwitch
```

---

## E4.1 TaskRegistry 接入

### 4.1.1 初始化序列

Gateway 启动流程中，在创建 `CronScheduler` 之前（因为 cron 需要注入 taskRegistry）插入 TaskRegistry 初始化：

```typescript
// 新增 import
import { TaskRegistry, JsonTaskStore } from './tasks/index.js'

// 在 cronScheduler 创建之前
const taskRegistry = new TaskRegistry({
  store: new JsonTaskStore(),
  flushDebounceMs: 500,
})
const restoredCount = await taskRegistry.restore()
console.log(`[equality-core] TaskRegistry 已恢复 ${restoredCount} 个任务`)
```

**位置**：在 `skillsWatcher.start()` 之后、`cronScheduler` 构造之前。

### 4.1.2 SSE 任务事件推送

TaskEventBus 订阅放在 `taskRegistry.restore()` 之后、`app.listen()` 之前：

```typescript
taskRegistry.events.on((event) => {
  const data = JSON.stringify({
    type: 'task_event',
    taskId: event.taskId,
    state: event.newState,
    runtime: event.runtime,
    timestamp: event.timestamp,
  })
  for (const client of sseClients) {
    try { client.write(`data: ${data}\n\n`) } catch { sseClients.delete(client) }
  }
})
```

**注意**：`sseClients` Set 在 `taskRegistry` 初始化时已声明，但 `taskRegistry.events.on()` 只能在 `sseClients` 声明后调用（两者在同一作用域，顺序安全）。

### 4.1.3 HTTP API 路由

新增 4 条路由，放在 `/cron/jobs` 路由之后：

```typescript
// GET /tasks?runtime=cron|subagent|manual
app.get('/tasks', async (req, reply) => {
  const { runtime } = req.query as { runtime?: string }
  const tasks = taskRegistry.list(runtime ? { runtime: runtime as TaskRuntime } : undefined)
  return reply.send(tasks)
})

// GET /tasks/:taskId
app.get('/tasks/:taskId', async (req, reply) => {
  const { taskId } = req.params as { taskId: string }
  const task = taskRegistry.get(taskId)
  if (!task) return reply.status(404).send({ error: 'task not found' })
  return reply.send(task)
})

// POST /tasks/:taskId/steer — body: { message: string }
app.post('/tasks/:taskId/steer', async (req, reply) => {
  const { taskId } = req.params as { taskId: string }
  const { message } = req.body as { message?: string }
  if (!message?.trim()) return reply.status(400).send({ ok: false, reason: 'message required' })
  const task = taskRegistry.get(taskId)
  if (!task) return reply.status(404).send({ ok: false, reason: 'task not found' })
  if (TERMINAL_STATES.has(task.state)) {
    return reply.status(409).send({ ok: false, reason: `task is already ${task.state}` })
  }
  taskRegistry.steer(taskId, message.trim())
  return reply.send({ ok: true })
})

// DELETE /tasks/:taskId
app.delete('/tasks/:taskId', async (req, reply) => {
  const { taskId } = req.params as { taskId: string }
  try {
    const task = taskRegistry.cancel(taskId)
    return reply.send({ ok: true, state: task.state })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(400).send({ ok: false, reason: msg })
  }
})
```

同时需要 import `TERMINAL_STATES` 和 `TaskRuntime`：

```typescript
import { TaskRegistry, JsonTaskStore, TERMINAL_STATES } from './tasks/index.js'
import type { TaskRuntime } from './tasks/index.js'
```

### 4.1.4 cron 任务注册集成

**修改位置**：`cronScheduler` 的 `runAgentTurn` 回调，以及 `CronScheduler` 接口（需查看 `cron/index.ts` 是否需要传 taskRegistry）。

V1 方案：**直接在 `runAgentTurn` 内部包装**，不修改 `CronScheduler` 接口：

```typescript
runAgentTurn: async (sessionKey, userMessage, jobId?) => {
  // 注册 cron 任务到 TaskRegistry
  const task = taskRegistry.register({
    runtime: 'cron',
    title: `cron: ${jobId ?? sessionKey}`,
    sessionKey,
    metadata: { jobId },
  })
  taskRegistry.transition(task.id, 'running')

  try {
    const result = await sessionQueue.enqueue(sessionKey, () => runAttempt({ ... }))
    taskRegistry.transition(task.id, 'succeeded', result.text.slice(0, 200))
    return result.text.slice(0, 500)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    taskRegistry.transition(task.id, 'failed', msg)
    throw err
  }
},
```

**关键问题**：需确认 `CronScheduler.runAgentTurn` 回调签名是否传递 `jobId`。若不传，则 title 只用 `sessionKey`。

### 4.1.5 Shutdown 写盘

在 `SIGINT` / `SIGTERM` 处理中追加 `taskRegistry.flush()`：

```typescript
process.on('SIGINT', async () => {
  console.log('[equality-core] SIGINT received, shutting down...')
  await taskRegistry.flush()
  await mcpManager.stop()
  process.exit(0)
})
```

---

## E4.2 FailoverPolicy `onModelSwitch` 接通

**修改位置**：`packages/core/src/providers/index.ts`，在 `getDefaultProvider()` 或构建 `FallbackProvider` 处。

当前 `index.ts` 通过 `getDefaultProvider()` 获取 Provider，不直接构造 `FallbackProvider`。需要确认 `providers/index.ts` 中 `FallbackProvider` 的构建点。

**方案**：在 `providers/index.ts` 暴露一个 `createFallbackProvider(onModelSwitch?)` 工厂函数，或在 `getDefaultProvider()` 接受可选回调：

```typescript
// providers/index.ts
export function getDefaultProvider(opts?: {
  onModelSwitch?: (info: { fromProvider: string; toProvider: string; reason: FailoverReason }) => void
}): LLMProvider {
  // ... 构建 FallbackProvider 时传入 opts?.onModelSwitch
}
```

**Gateway 侧调用**：

```typescript
// index.ts — 在 /chat/stream 路由中替换 getDefaultProvider() 调用
const provider = getDefaultProvider({
  onModelSwitch: ({ fromProvider, toProvider, reason }) => {
    broadcastNotification(
      '模型已切换',
      `由于 ${reason}，已从 ${fromProvider} 切换到 ${toProvider}`
    )
  },
})
```

但 `getDefaultProvider()` 当前在多处调用（`/health`、`/chat/stream`、title-gen 等）。为避免改动过大，**V1 方案**：

1. 在 Gateway 顶层创建一次带回调的 `defaultProvider`（顶层单例模式）
2. 在 `/chat/stream` 等需要默认 provider 的路由中优先使用该单例

---

## E4.3 SubagentManager 接入

### 4.3.1 初始化

```typescript
import { SubagentManager } from './agent/subagent-manager.js'

// 在 taskRegistry 初始化之后、cronScheduler 之前
const subagentManager = new SubagentManager({
  taskRegistry,
  runAttempt,
  defaults: {
    workspaceDir: getWorkspaceDir(),
  },
})
```

### 4.3.2 工具 execute 注入方案

4 个 subagent 工具的 `execute` 函数目前是占位 stub，位于各自文件中。问题是这些工具在 Gateway 初始化时（`builtinTools` 数组构建时）就注册进去了，但 `SubagentManager` 在之后才创建。

**V1 方案：延迟绑定（mutable context）**

在各工具文件中导出一个 `setManager(manager)` 绑定函数：

```typescript
// tools/builtins/subagent-spawn.ts
let _manager: SubagentManager | null = null
export function setSubagentManager(m: SubagentManager) { _manager = m }

export const subagentSpawnTool: BuiltinTool = {
  name: 'subagent_spawn',
  execute: async (args, context) => {
    if (!_manager) return { isError: true, content: 'SubagentManager not initialized' }
    return _manager.spawn(context.sessionKey, args)
  },
}
```

Gateway 在创建 `SubagentManager` 后立即调用：

```typescript
import { setSubagentManager as setManagerForSpawn } from './tools/builtins/subagent-spawn.js'
import { setSubagentManager as setManagerForList } from './tools/builtins/subagent-list.js'
import { setSubagentManager as setManagerForSteer } from './tools/builtins/subagent-steer.js'
import { setSubagentManager as setManagerForKill } from './tools/builtins/subagent-kill.js'

// 创建 SubagentManager 后
setManagerForSpawn(subagentManager)
setManagerForList(subagentManager)
setManagerForSteer(subagentManager)
setManagerForKill(subagentManager)
```

**替代方案（V2，更简洁）**：工具注册时传入 context，context 中携带 `subagentManager` 引用。但 ToolRegistry 当前无此机制，改动更大，留给后续重构。

### 4.3.3 加入 builtinTools

**修改位置**：`packages/core/src/tools/index.ts`

```typescript
import { subagentSpawnTool } from './builtins/subagent-spawn.js'
import { subagentListTool } from './builtins/subagent-list.js'
import { subagentSteerTool } from './builtins/subagent-steer.js'
import { subagentKillTool } from './builtins/subagent-kill.js'

export const builtinTools: BuiltinTool[] = [
  // ... 现有工具 ...
  subagentSpawnTool,
  subagentListTool,
  subagentSteerTool,
  subagentKillTool,
]
```

---

## 关键决策记录

### 决策 1：为什么用延迟绑定而非工厂函数？

工厂函数（每次请求时创建 SubagentManager）会导致任务跨请求状态丢失。延迟绑定保留单例语义，代价是增加一个全局可变变量，但在 Node.js 单线程模型下是安全的。

### 决策 2：为什么 onModelSwitch 在 Gateway 顶层绑定而非每次请求？

FallbackProvider 是无状态的（或者说内部状态在单次 generate 调用内），`onModelSwitch` 只是一个回调，绑定在单例 provider 上后，所有通过它的请求都能触发通知。不需要每次请求重新构建。

### 决策 3：cron runAgentTurn 是否需要修改 CronScheduler 接口？

不需要。`runAgentTurn` 本身就是 Gateway 注入的回调，Gateway 可在回调内部直接使用闭包中的 `taskRegistry`，无需修改 CronScheduler 接口。

### 决策 4：subagent 工具是否暴露 context.sessionKey？

是。现有 runner 调用工具时传递 `context` 对象，其中包含 `sessionKey`。`subagent_spawn` 需要知道父会话 key 以建立父子关系。确认 runner.ts 的 `ToolContext` 类型包含 `sessionKey`（若不包含，需补充）。

---

## 修改文件清单

| 文件 | 改动类型 | 描述 |
|------|----------|------|
| `index.ts` | 修改 | 初始化、路由、SSE、shutdown |
| `tools/index.ts` | 修改 | 加入 4 个 subagent 工具到 builtinTools |
| `tools/builtins/subagent-spawn.ts` | 修改 | 实现 execute + 导出 setSubagentManager |
| `tools/builtins/subagent-list.ts` | 修改 | 同上 |
| `tools/builtins/subagent-steer.ts` | 修改 | 同上 |
| `tools/builtins/subagent-kill.ts` | 修改 | 同上 |
| `providers/index.ts` | 修改 | getDefaultProvider 支持 onModelSwitch 回调 |

**无需修改**：
- `tasks/` — E1 实现完整，接口稳定
- `agent/subagent-manager.ts` — E3 实现完整
- `providers/failover-policy.ts` — E2 实现完整
- `providers/fallback.ts` — E2 已重构，接口已支持 onModelSwitch
