# Design: Phase 4 — 定时任务（Cron / Scheduler）

> 基于 [proposal.md](./proposal.md) 的技术设计。

---

## 1. 新增文件一览

| 文件 | 用途 |
|------|------|
| `packages/core/src/cron/types.ts` | 类型定义（CronJob, Schedule, Payload, CronRunLog） |
| `packages/core/src/cron/store.ts` | JSON 文件持久化 CRUD |
| `packages/core/src/cron/scheduler.ts` | 内存调度引擎（tick 循环 + 执行器） |
| `packages/core/src/cron/index.ts` | barrel export |
| `packages/core/src/tools/builtins/cron.ts` | `cron` 工具定义 + execute |

### 需修改文件

| 文件 | 修改内容 |
|------|---------|
| `packages/core/src/tools/builtins/index.ts` | 注册 cronTool |
| `packages/core/src/index.ts` | 启动 scheduler，注册 HTTP API（可选） |
| `packages/desktop/src-tauri/Cargo.toml` | 添加 tauri-plugin-notification（如未安装） |
| `packages/desktop/src-tauri/src/lib.rs` | 注册 notification plugin |
| `packages/desktop/src-tauri/capabilities/default.json` | 添加 notification 权限 |

---

## 2. 类型设计 (`cron/types.ts`)

```typescript
/** ─── Schedule 类型 ─── */

/** cron 表达式：如 "0 17 * * *" = 每天 5PM */
interface CronSchedule {
  kind: 'cron'
  expr: string  // 标准 5-field cron expression
}

/** 固定间隔：如每 30 分钟 */
interface EverySchedule {
  kind: 'every'
  intervalMs: number
}

/** 一次性：如 "2025-08-02T09:00:00" */
interface AtSchedule {
  kind: 'at'
  iso: string   // ISO 8601 datetime string
}

type Schedule = CronSchedule | EverySchedule | AtSchedule

/** ─── Payload 类型 ─── */

/** 桌面通知 */
interface NotifyPayload {
  kind: 'notify'
  title?: string
  text: string
}

/** 注入消息到指定会话（触发 AI 回复） */
interface ChatPayload {
  kind: 'chat'
  message: string         // 注入的用户消息文本
  sessionKey?: string     // 默认 desktop-default
}

/** 执行完整 agent turn（带 tool loop） */
interface AgentPayload {
  kind: 'agent'
  prompt: string          // agent 执行的指令
  sessionKey?: string
}

type Payload = NotifyPayload | ChatPayload | AgentPayload

/** ─── CronJob ─── */

interface CronJob {
  id: string              // nanoid or uuid
  name: string            // 人类可读名称："每天写日报提醒"
  schedule: Schedule
  payload: Payload
  enabled: boolean        // 暂停/恢复
  deleteAfterRun: boolean // true = 一次性任务，执行后自动删除
  createdAt: string       // ISO
  lastRunAt?: string      // ISO
  nextRunAt?: string      // ISO
  runCount: number        // 累计执行次数
}

/** 运行日志条目 */
interface CronRunLog {
  jobId: string
  ranAt: string           // ISO
  success: boolean
  resultSummary?: string  // 执行结果摘要（截断到 200 字）
  durationMs: number
}
```

---

## 3. CronStore (`cron/store.ts`)

### 存储位置

```
%APPDATA%/Equality/cron-jobs.json   # 主数据
%APPDATA%/Equality/cron-runs.json   # 运行日志（最近 200 条）
```

### API

```typescript
class CronStore {
  private jobs: Map<string, CronJob>
  private runs: CronRunLog[]

  /** 从磁盘加载 */
  async load(): Promise<void>
  /** 持久化到磁盘 */
  async save(): Promise<void>

  /** CRUD */
  add(job: CronJob): void
  get(id: string): CronJob | undefined
  update(id: string, patch: Partial<CronJob>): boolean
  remove(id: string): boolean
  list(): CronJob[]

  /** 运行日志 */
  addRun(log: CronRunLog): void
  getRuns(jobId?: string, limit?: number): CronRunLog[]
}
```

### 持久化策略

- 每次写操作后立即 `save()`（数据量小，JSON 文件写入很快）
- 运行日志保留最近 200 条，超出 FIFO 淘汰
- 文件使用 `writeFileSync` + `JSON.stringify(data, null, 2)` 确保可读

---

## 4. CronScheduler (`cron/scheduler.ts`)

### 架构

```
CronScheduler
  ├── store: CronStore          (持久化层)
  ├── timer: NodeJS.Timer       (setInterval 60s)
  ├── executor: CronExecutor    (执行 payload)
  └── tick()                    (核心调度逻辑)
```

### tick 逻辑（每分钟执行一次）

```typescript
async tick(): Promise<void> {
  const now = Date.now()
  for (const job of this.store.list()) {
    if (!job.enabled) continue
    if (!job.nextRunAt) continue

    const nextMs = new Date(job.nextRunAt).getTime()
    if (nextMs > now) continue

    // 到点了！执行
    const startTime = Date.now()
    try {
      const result = await this.executor.execute(job.payload)

      // 更新 job 状态
      this.store.update(job.id, {
        lastRunAt: new Date().toISOString(),
        nextRunAt: computeNextRun(job.schedule),
        runCount: job.runCount + 1,
      })

      // 一次性任务自动删除
      if (job.deleteAfterRun) {
        this.store.remove(job.id)
      }

      // 记录运行日志
      this.store.addRun({
        jobId: job.id,
        ranAt: new Date().toISOString(),
        success: true,
        resultSummary: result?.slice(0, 200),
        durationMs: Date.now() - startTime,
      })
    } catch (err) {
      this.store.addRun({
        jobId: job.id,
        ranAt: new Date().toISOString(),
        success: false,
        resultSummary: String(err).slice(0, 200),
        durationMs: Date.now() - startTime,
      })
    }
  }
}
```

### computeNextRun

```typescript
function computeNextRun(schedule: Schedule): string | undefined {
  switch (schedule.kind) {
    case 'cron':
      // 使用 cron-parser 计算下一次触发时间
      return CronExpressionParser.parseExpression(schedule.expr).next().toISOString()

    case 'every':
      return new Date(Date.now() + schedule.intervalMs).toISOString()

    case 'at':
      // 一次性任务，已过期则返回 undefined
      const target = new Date(schedule.iso).getTime()
      return target > Date.now() ? schedule.iso : undefined
  }
}
```

### 生命周期

```typescript
class CronScheduler {
  async start(): Promise<void> {
    await this.store.load()
    // 启动时刷新所有 job 的 nextRunAt
    for (const job of this.store.list()) {
      if (job.enabled && !job.nextRunAt) {
        this.store.update(job.id, {
          nextRunAt: computeNextRun(job.schedule)
        })
      }
    }
    // 立即 tick 一次（恢复可能错过的任务）
    await this.tick()
    // 开始定时 tick
    this.timer = setInterval(() => this.tick(), 60_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
```

---

## 5. 执行器 (`CronExecutor`)

内嵌在 scheduler.ts 中：

```typescript
class CronExecutor {
  constructor(
    private sessionStore: typeof import('../session/store.js'),
    private toolRegistry: ToolRegistry,
    private notifier: (title: string, body: string) => void,
  ) {}

  async execute(payload: Payload): Promise<string | undefined> {
    switch (payload.kind) {
      case 'notify':
        this.notifier(payload.title ?? 'Equality 提醒', payload.text)
        return `已发送通知: ${payload.text}`

      case 'chat': {
        const key = payload.sessionKey ?? 'desktop-default'
        const session = await this.sessionStore.getOrCreate(key)
        session.messages.push({ role: 'user', content: payload.message })
        // 不触发 runAttempt，只注入消息。AI 回复在用户下次打开对话时自然发生
        // 或者如需即时回复，可调用 runAttempt
        return `已向会话 ${key} 注入消息`
      }

      case 'agent': {
        const key = payload.sessionKey ?? 'desktop-default'
        const { runAttempt } = await import('../agent/runner.js')
        const result = await runAttempt({
          sessionKey: key,
          userMessage: payload.prompt,
          toolRegistry: this.toolRegistry,
          workspaceDir: process.cwd(),
        })
        return result.text.slice(0, 500)
      }
    }
  }
}
```

### 桌面通知适配

Core 层不直接依赖 Tauri。通知通过**回调函数注入**：

```typescript
// packages/core/src/index.ts 启动时
const scheduler = new CronScheduler({
  toolRegistry,
  sessionStore: { getOrCreate },
  notifier: (title, body) => {
    // 方案 A：发送 SSE 事件到前端，由前端调用 Tauri notification
    broadcastEvent({ type: 'notification', title, body })
    // 方案 B：如果 Core 直接有系统通知能力（非 Tauri 环境用 node-notifier）
  },
})
```

**推荐方案 A**：Core 通过 SSE 广播通知事件，前端订阅后调用 `@tauri-apps/plugin-notification`：

```typescript
// Desktop 前端
import { sendNotification } from '@tauri-apps/plugin-notification'

eventSource.addEventListener('notification', (e) => {
  const { title, body } = JSON.parse(e.data)
  sendNotification({ title, body })
})
```

---

## 6. Cron 工具 (`tools/builtins/cron.ts`)

### Tool Schema

```typescript
const cronTool: ToolDefinition = {
  name: 'cron',
  description: '管理定时任务。可以创建、查看、修改、删除和立即执行定时任务。支持 cron 表达式、固定间隔和一次性定时。',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '操作类型',
        enum: ['add', 'list', 'update', 'remove', 'run', 'runs'],
      },
      // add/update 专用
      name: {
        type: 'string',
        description: '任务名称（add/update 时使用），如 "每天写日报提醒"',
      },
      schedule_kind: {
        type: 'string',
        description: '调度类型：cron（cron表达式）/ every（固定间隔）/ at（一次性）',
        enum: ['cron', 'every', 'at'],
      },
      schedule_value: {
        type: 'string',
        description: 'cron: cron 表达式如 "0 17 * * *"; every: 毫秒数如 "3600000"; at: ISO 时间如 "2025-08-02T09:00:00"',
      },
      payload_kind: {
        type: 'string',
        description: '执行类型：notify（桌面通知）/ chat（注入消息到会话）/ agent（执行 AI 任务）',
        enum: ['notify', 'chat', 'agent'],
      },
      payload_text: {
        type: 'string',
        description: '通知文本 / 消息内容 / agent 指令',
      },
      delete_after_run: {
        type: 'string',
        description: '是否执行一次后自动删除（"true"/"false"），默认 false。一次性 at 任务推荐设为 true',
      },
      // remove/run/update 专用
      job_id: {
        type: 'string',
        description: '任务 ID（remove/run/update/runs 时使用）',
      },
      // update 专用
      enabled: {
        type: 'string',
        description: '启用/禁用（"true"/"false"）',
      },
    },
    required: ['action'],
  },
  execute: async (input, ctx) => { /* see implementation */ },
}
```

### Action 实现

| Action | 说明 | 返回内容 |
|--------|------|---------|
| `add` | 创建新任务 | `✅ 已创建定时任务 "xxx"（ID: abc123），下次执行: 2025-08-01T17:00:00` |
| `list` | 列出所有任务 | 表格格式：ID / 名称 / 调度 / 下次执行 / 执行次数 / 状态 |
| `update` | 修改任务（name/enabled/schedule/payload） | `✅ 已更新任务 "xxx"` |
| `remove` | 删除任务 | `✅ 已删除任务 "xxx"` |
| `run` | 立即执行一次 | `✅ 已手动执行 "xxx"，结果: ...` |
| `runs` | 查看执行日志 | 最近 10 次执行记录 |

### CronStore 实例共享

**关键问题**：cron 工具的 `execute` 函数需要访问全局 CronStore / CronScheduler 实例。

**方案**：通过 ToolContext 扩展注入（最小改动）：

```typescript
// tools/types.ts — 扩展 ToolContext
export interface ToolContext {
  workspaceDir: string
  abortSignal?: AbortSignal
  proxyUrl?: string
  env?: Record<string, string>
  provider?: LLMProvider
  /** Phase 4: cron scheduler 引用 */
  cronScheduler?: import('../cron/types.js').CronSchedulerRef
}

// cron/types.ts
export interface CronSchedulerRef {
  store: CronStore
  runJobNow(jobId: string): Promise<string>
}
```

---

## 7. Core 集成 (`index.ts`)

### 启动阶段

```typescript
// packages/core/src/index.ts — 在 app.listen 之前
import { CronScheduler } from './cron/index.js'

const cronScheduler = new CronScheduler({
  toolRegistry,
  sessionStore: { getOrCreate },
  notifier: (title, body) => {
    // 通过全局 SSE 广播
    broadcastNotification(title, body)
  },
})
await cronScheduler.start()
console.log(`[equality-core] Cron scheduler started, ${cronScheduler.jobCount} jobs loaded`)
```

### 注入到 runAttempt

```typescript
// 所有 runAttempt 调用中传入 cronScheduler 引用
const result = await runAttempt({
  sessionKey,
  userMessage: message,
  toolRegistry,
  workspaceDir: process.cwd(),
  cronScheduler,  // 新增
  // ...
})
```

### SSE 广播（通知推送）

```typescript
// 简易 SSE 广播
const sseClients = new Set<import('http').ServerResponse>()

app.get('/events', async (req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.flushHeaders()
  sseClients.add(reply.raw)
  reply.raw.on('close', () => sseClients.delete(reply.raw))
})

function broadcastNotification(title: string, body: string) {
  const data = JSON.stringify({ type: 'notification', title, body })
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`)
  }
}
```

### HTTP API（可选，低优先级）

```
GET  /cron/jobs          → 列出所有任务
POST /cron/jobs          → 创建任务（Body: CronJob 部分字段）
DELETE /cron/jobs/:id    → 删除任务
```

---

## 8. Desktop 集成

### Tauri Notification Plugin

```toml
# packages/desktop/src-tauri/Cargo.toml
[dependencies]
tauri-plugin-notification = "2"
```

```rust
// packages/desktop/src-tauri/src/lib.rs
.plugin(tauri_plugin_notification::init())
```

```json
// packages/desktop/src-tauri/capabilities/default.json
{
  "permissions": [
    "notification:default",
    "notification:allow-notify",
    "notification:allow-request-permission"
  ]
}
```

### 前端 SSE 订阅

```typescript
// Desktop 前端 — 在 App mount 时
import { sendNotification, requestPermission } from '@tauri-apps/plugin-notification'

// 请求通知权限
await requestPermission()

// 订阅 Core 的 SSE 通知事件
const es = new EventSource('http://localhost:18790/events')
es.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.type === 'notification') {
    sendNotification({ title: data.title, body: data.body })
  }
}
```

---

## 9. 依赖

### npm 包

| 包 | 用途 | 大小 |
|----|------|------|
| `cron-parser` | 解析 cron 表达式，计算下次触发时间 | ~20KB |

> 不需要 `node-cron`。`cron-parser` 只做表达式解析，调度循环我们自己用 `setInterval` 实现。

### Tauri 插件

| 插件 | 用途 |
|------|------|
| `tauri-plugin-notification` | 系统桌面通知 |

---

## 10. 关键设计约束

1. **Core 不依赖 Tauri**：通知通过回调/SSE 传递，Core 层保持纯 Node.js
2. **调度精度 = 分钟**：`setInterval(60_000)` 足够，不追求秒级
3. **即时持久化**：每次 CRUD 都 `save()`，确保崩溃不丢数据
4. **CronStore 单例**：全局一个实例，工具通过 `ToolContext.cronScheduler` 访问
5. **时区 = 系统本地**：`new Date()` 默认用本地时区，不做时区转换
6. **at 任务过期处理**：如果 at 时间已过（应用关闭期间错过），启动时不补执行，直接标记过期删除
