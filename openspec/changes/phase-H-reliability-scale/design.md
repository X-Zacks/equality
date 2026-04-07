# Phase H: 设计文档

---

## H1 — 子 Agent 孤儿恢复

### 设计决策

**为什么不用 OpenClaw 的 Gateway 调用方式？**

OpenClaw 通过 `callGateway()` 发送 HTTP 请求重启子 Agent 会话。Equality 是本地单机架构，没有 Gateway HTTP 层——SubagentManager 直接调用 `runAttempt()`。因此我们简化为：在 TaskRegistry 中找到 `lost` 的 subagent 任务 → 重新 spawn。

**为什么新增 `lost → queued` 迁移？**

OpenClaw 的 orphan recovery 是在 session 层面操作（重发消息到已有 session）。Equality 的子 Agent 是任务驱动的（TaskRegistry 管理生命周期），所以恢复逻辑需要 `lost → queued → running` 的状态迁移路径。

### 启动时序

```
Core 启动
  │
  ├── TaskRegistry.restore()    ← 已有：running → lost
  │
  ├── ensureWorkspaceBootstrap()
  │
  └── scheduleOrphanRecovery({
        taskRegistry,
        spawnFn,
        delayMs: 3000        ← 等 3s 让系统就绪
      })
        │
        └── setTimeout(3s) → recoverOrphanTasks()
              ├── 扫描 state === 'lost' && runtime === 'subagent'
              ├── buildResumeMessage(task) → 合成消息
              ├── transition(taskId, 'queued') → lost → queued
              ├── spawnFn(task) → 重新执行
              └── 成功 / 失败 / 跳过 统计
                    │
                    └── failed > 0 → 指数退避重试
```

### 类型定义

```typescript
// tasks/orphan-recovery.ts

interface OrphanRecoveryResult {
  recovered: number
  failed: number
  skipped: number
}

function recoverOrphanTasks(params: {
  taskRegistry: TaskRegistry
  spawnFn: (task: TaskRecord) => Promise<boolean>
}): Promise<OrphanRecoveryResult>

function buildResumeMessage(task: TaskRecord): string

function scheduleOrphanRecovery(params: {
  taskRegistry: TaskRegistry
  spawnFn: (task: TaskRecord) => Promise<boolean>
  delayMs?: number
  maxRetries?: number
}): void
```

---

## H2 — SQLite 任务存储

### 设计决策

**使用 Node.js 内置 `node:sqlite`**

Node 22.5+ 内置了 `node:sqlite`（基于 SQLite 3.46），无需额外安装 better-sqlite3。Equality 的目标运行时是 Node 22+，可以直接使用。如果环境不支持，回退到 `JsonTaskStore`。

**全量 save 保持兼容**

虽然 SQLite 支持增量 upsert，但 `TaskStore` 接口的 `save(records)` 是全量语义。为保持向后兼容，`SqliteTaskStore.save()` 实现为事务内 clear + batch insert。同时暴露 `upsert()` 供后续优化用。

### 数据流

```
TaskRegistry
  ├── schedulePersist() → debounce 200ms
  │     └── store.save(records)
  │           ├── JsonTaskStore: writeFile(JSON.stringify)
  │           └── SqliteTaskStore:
  │                 BEGIN TRANSACTION
  │                 DELETE FROM task_runs
  │                 INSERT INTO task_runs ← 批量
  │                 COMMIT
  │
  └── restore()
        └── store.load()
              ├── JsonTaskStore: JSON.parse(readFile)
              └── SqliteTaskStore: SELECT * FROM task_runs ORDER BY created_at
```

### 表结构

```sql
CREATE TABLE IF NOT EXISTS task_runs (
  task_id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL,
  state TEXT NOT NULL,
  title TEXT NOT NULL,
  session_key TEXT,
  parent_task_id TEXT,
  parent_session_key TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  timeout_ms INTEGER,
  notification_policy TEXT NOT NULL,
  last_error TEXT,
  summary TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_state ON task_runs(state);
CREATE INDEX IF NOT EXISTS idx_task_session ON task_runs(session_key);
CREATE INDEX IF NOT EXISTS idx_task_parent ON task_runs(parent_task_id);

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

---

## H3 — API Key 轮换

### 设计决策

**独立模块，不修改 Provider 接口**

API key 轮换是 Provider 内部实现细节，不暴露在 `LLMProvider` 接口中。`executeWithKeyRotation()` 是一个独立的工具函数，由各 Provider 内部按需调用。

**默认只在 rate_limit 时轮换**

参考 OpenClaw：auth 错误（401/403）意味着 key 本身有问题，换另一个可能同样失败。billing 错误（402）是账号级别的，换 key 无意义。只有 rate_limit（429）确定是单 key 配额耗尽，换 key 有价值。

### 数据流

```
Provider.chat() / complete()
  │
  ├── collectProviderKeys('openai', primaryKey)
  │     ├── primaryKey → ['sk-main']
  │     └── 环境变量 OPENAI_API_KEY_1, _2, ... → append
  │
  └── executeWithKeyRotation({
        provider: 'openai',
        keys,
        execute: (key) => callLLM(key),
        onRetry: (p) => console.log(`Key ${p.attempt} rate limited, rotating`)
      })
        ├── keys[0] → execute → 成功 → return
        ├── keys[0] → execute → 429 → shouldRetry? yes
        ├── keys[1] → execute → 成功 → return
        └── keys[N] → 全部失败 → throw lastError
```

### 类型定义

```typescript
// providers/key-rotation.ts

interface KeyRotationOptions<T> {
  provider: string
  keys: string[]
  execute: (key: string) => Promise<T>
  shouldRetry?: (params: KeyRetryParams) => boolean
  onRetry?: (params: KeyRetryParams) => void
}

interface KeyRetryParams {
  key: string
  error: unknown
  attempt: number
  message: string
}

function executeWithKeyRotation<T>(opts: KeyRotationOptions<T>): Promise<T>
function collectProviderKeys(provider: string, primaryKey?: string): string[]
function isRateLimitError(message: string): boolean
```

---

## H4 — Session Tool Result 持久化守卫

### 设计决策

**与运行时截断分离**

`tools/truncation.ts` 截断的是当前请求中的 tool result（影响 LLM 上下文大小）。本守卫截断的是**持久化到磁盘**的 tool result（影响存储空间和历史加载速度）。两者阈值不同：
- 运行时：context window × 30%（动态，通常 ~38K~120K 字符）
- 持久化：固定 50K 字符（存储友好）

**截断副本，不修改原数据**

`truncateForPersistence()` 返回新的消息数组，不修改输入。`persist()` 中在 `JSON.stringify` 之前调用，保证内存中的 `session.messages` 不受影响。

### 数据流

```
session/persist.ts → persist(session)
  │
  ├── const { messages, truncatedCount } = truncateForPersistence(session.messages)
  │     ├── 遍历 messages
  │     ├── role === 'tool' && content.length > 50K
  │     │     └── truncateToolResult(content, 50_000) → 截断
  │     └── 其他角色 → 不动
  │
  ├── if (truncatedCount > 0) console.log(...)
  │
  └── writeFile(JSON.stringify({ ...session, messages }))
```

### 类型定义

```typescript
// session/persist-guard.ts

interface PersistGuardOptions {
  maxToolResultChars?: number      // 默认 50_000
  totalBudgetChars?: number        // 默认 500_000
}

interface PersistGuardResult {
  messages: LLMMessage[]
  truncatedCount: number
  savedChars: number
}

function truncateForPersistence(
  messages: LLMMessage[],
  opts?: PersistGuardOptions,
): PersistGuardResult
```

---

## 文件变更清单

| 操作 | 文件 | 描述 |
|------|------|------|
| 新增 | `tasks/orphan-recovery.ts` | H1: 孤儿恢复 + resume 消息 + 延迟调度 |
| 修改 | `tasks/types.ts` | H1: `VALID_TRANSITIONS` 增加 `lost → queued`；`lost` 从 TERMINAL_STATES 移除 |
| 修改 | `index.ts` | H1: 启动时 `scheduleOrphanRecovery()` |
| 新增 | `tasks/sqlite-store.ts` | H2: SqliteTaskStore 实现 |
| 新增 | `providers/key-rotation.ts` | H3: executeWithKeyRotation + collectProviderKeys |
| 新增 | `session/persist-guard.ts` | H4: truncateForPersistence |
| 修改 | `session/persist.ts` | H4: persist() 调用持久化守卫 |
| 新增 | `__tests__/phase-H.test.ts` | 全部测试 |
