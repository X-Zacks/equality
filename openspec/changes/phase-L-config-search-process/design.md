# Phase L 设计文档

## L1 — Config Schema Validation

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 验证库 | 自研轻量 validator | 零依赖原则；Equality 配置项 ≤30 个，无需 Zod 全量能力 |
| Schema 格式 | TypeScript 对象字面量 | IDE 自动补全 + 类型推断 |
| 存储 | 现有 `settings.json` | 不改变存储层 |
| 迁移 | 版本号 + 迁移函数数组 | 类似 SQLite migration 模式 |
| 热重载 | fs.watch + debounce | 文件变更时自动重新验证并通知 |

### 新增文件

- `config/schema.ts` — ConfigSchema 类型 + 内置 schema 定义（21 项 + 新增项）
- `config/validate.ts` — validateConfig() 验证 + 默认值填充
- `config/migrate.ts` — migrateConfig() 版本迁移框架

### 修改文件

- `config/secrets.ts` — 启动时调用 validateConfig()

### 类型定义

```typescript
type ConfigFieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'json'

interface ConfigFieldSchema {
  type: ConfigFieldType
  required?: boolean
  default?: unknown
  description?: string
  validate?: (value: unknown) => boolean | string  // true = valid, string = error
  deprecated?: string   // deprecation message
  since?: string        // version introduced
}

type ConfigSchema = Record<string, ConfigFieldSchema>

interface ConfigValidationResult {
  valid: boolean
  errors: Array<{ key: string; message: string }>
  warnings: Array<{ key: string; message: string }>
  applied: Record<string, unknown>  // config with defaults filled
}

interface ConfigMigration {
  fromVersion: number
  toVersion: number
  migrate(config: Record<string, unknown>): Record<string, unknown>
}
```

### 数据流

```
启动时：
  loadSettings() → rawConfig
  → validateConfig(rawConfig, EQUALITY_CONFIG_SCHEMA)
    → 类型检查 + 必填检查 + 自定义 validate
    → 填充默认值
    → { valid, errors, warnings, applied }
  → 如果 !valid → 输出 warn 日志 + 使用 applied（带默认值）

版本升级时：
  → migrateConfig(rawConfig, currentVersion, migrations)
    → 按顺序执行 fromVersion → toVersion 迁移
    → 写回 settings.json
```

---

## L2 — Web Search Abstraction

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 接口设计 | `WebSearchProvider` 接口 | 对齐 `LLMProvider` 的设计模式 |
| 注册中心 | `WebSearchRegistry` 单例 | 运行时注册/切换 |
| 默认 provider | Brave（主）→ DDG（回退） | 保持向后兼容 |
| Provider 选择 | 按 API key 可用性自动检测 | 用户无需手动配置首选 provider |
| 缓存 | 复用现有内存缓存（5min） | 不改变缓存策略 |

### 新增文件

- `search/types.ts` — WebSearchProvider / WebSearchResult / WebSearchRegistry 类型
- `search/registry.ts` — WebSearchRegistry 实现
- `search/providers/brave.ts` — Brave Search provider（从 web-search.ts 提取）
- `search/providers/duckduckgo.ts` — DDG provider（从 web-search.ts 提取）

### 修改文件

- `tools/builtins/web-search.ts` — 改为通过 Registry 调用而非硬编码

### 类型定义

```typescript
interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string    // provider id
}

interface WebSearchProvider {
  readonly id: string
  readonly name: string
  isAvailable(): boolean | Promise<boolean>
  search(query: string, options?: { count?: number; language?: string }): Promise<WebSearchResult[]>
}

class WebSearchRegistry {
  register(provider: WebSearchProvider): void
  unregister(providerId: string): boolean
  getProvider(id: string): WebSearchProvider | undefined
  getDefaultProvider(): WebSearchProvider | undefined  // 自动检测
  listProviders(): Array<{ id: string; name: string; available: boolean }>
  search(query: string, options?: { providerId?: string; count?: number }): Promise<WebSearchResult[]>
}
```

### 数据流

```
WebSearchRegistry.register(braveProvider)
WebSearchRegistry.register(ddgProvider)

web_search 工具调用：
  → registry.search(query)
    → getDefaultProvider()  // 按 API key 检测
    → provider.search(query, options)
    → WebSearchResult[]
    → wrapExternalContent() → 安全包装
```

---

## L3 — Process Supervision

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 并发模型 | 命令队列 + 信号量 | 限制同时执行的进程数 |
| 并发上限 | 5（可配） | 桌面单机 CPU 考量 |
| Kill tree | Windows `taskkill /F /T` + Unix `kill -TERM -pgid` | 跨平台 |
| 超时清理 | 定期扫描 stale 进程 | 防止僵尸进程 |
| 队列策略 | FIFO + 优先级可选 | 简单有效 |

### 新增文件

- `process/command-queue.ts` — CommandQueue 类（enqueue/dequeue/drain）
- `process/kill-tree.ts` — killProcessTree() 跨平台实现

### 修改文件

- `tools/bash-sandbox.ts` — 通过 CommandQueue 限制并发
- `tools/process-manager.ts` — 集成 kill tree

### 类型定义

```typescript
interface CommandQueueOptions {
  maxConcurrent?: number  // default 5
  queueTimeout?: number   // max time in queue before rejection, default 60s
}

interface QueuedCommand {
  id: string
  command: string
  cwd: string
  priority?: number       // lower = higher priority
  enqueueTime: number
  startTime?: number
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout'
}

class CommandQueue {
  constructor(opts?: CommandQueueOptions)
  enqueue(command: string, cwd: string, opts?: { priority?: number; timeout?: number }): Promise<QueuedCommand>
  getStatus(): { running: number; queued: number; maxConcurrent: number }
  drain(): Promise<void>
  kill(commandId: string): boolean
}

function killProcessTree(pid: number): Promise<boolean>
```

### 数据流

```
bash 工具调用 → commandQueue.enqueue(cmd, cwd)
  → 队列检查并发数 < maxConcurrent?
    → 是 → 立即执行 spawn()
    → 否 → 排队等待
  → 执行完成 → dequeue 下一个
  → 超时 → killProcessTree(pid) → 状态变为 'timeout'
```
