# Phase J 设计文档

## J1 — Structured Logger

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 日志库 | 自研（零依赖） | Equality 桌面应用无需 winston/pino 的复杂功能 |
| 输出格式 | JSONL（每行一个 JSON） | 机器可解析，可追加写入，与 cache-trace 一致 |
| 文件写入 | 复用 `QueuedFileWriter` | Phase I4 已提供异步队列写入器 |
| 脱敏实现 | 复用 `sanitizeDiagnosticPayload` | Phase I4 已提供完整脱敏逻辑 |
| 级别控制 | 环境变量 `EQUALITY_LOG_LEVEL` | 运行时可配，无需重编译 |

### 新增文件

- `diagnostics/logger.ts` — createLogger 工厂 + LogLevel / LogEntry / Logger 类型

### 依赖的已有文件

- `diagnostics/redact.ts` — `sanitizeDiagnosticPayload()` 脱敏
- `diagnostics/queued-writer.ts` — `QueuedFileWriter` 异步写入

### 类型定义

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string        // ISO 8601
  level: LogLevel
  module: string
  message: string
  [key: string]: unknown
}

interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void
  info(message: string, extra?: Record<string, unknown>): void
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
  readonly module: string
  readonly level: LogLevel
}
```

### 数据流

```
createLogger('agent-runner', { level: 'info' })
  → logger.info('tool loop', { loopCount: 1 })
    → resolveLogLevel() 过滤
    → LogEntry { ts, level, module, message, ...extra }
    → sanitizeDiagnosticPayload(extra)  // 脱敏
    → console[level](...)               // 控制台输出
    → QueuedFileWriter.write(JSON+'\n') // 文件输出（可选）
```

---

## J2 — Session Lifecycle Events

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 事件分发 | 同步遍历 Set | 不丢事件，无 EventEmitter 开销 |
| 存储结构 | `Map<EventType, Set<Handler>>` | O(1) 注册/移除 |
| 异常策略 | try/catch 隔离 | 单个 handler 崩溃不影响其余 |
| 监听器上限 | 100 per type | 防止泄漏 |
| 架构 | 模块级 singleton | session 事件全局唯一来源 |

### 新增文件

- `session/lifecycle.ts` — 事件类型 + 注册/移除/发射 API

### 类型定义

```typescript
type SessionEventType =
  | 'session:created'
  | 'session:restored'
  | 'session:persisted'
  | 'session:destroyed'
  | 'session:reaped'

interface SessionEvent {
  type: SessionEventType
  sessionKey: string
  timestamp: number
  data?: Record<string, unknown>
}
```

### 数据流

```
emitSessionEvent('session:persisted', sessionKey, { messageCount: 42 })
  → 查找 listeners.get('session:persisted')
  → 构建 SessionEvent { type, sessionKey, timestamp, data }
  → for handler of set: try { handler(event) } catch { warn }
```

---

## J3 — Hooks Framework

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Hook 存储 | `Map<HookPoint, Array<Handler>>` | 保持注册顺序 |
| 调用方式 | 顺序 await | 支持异步 hook，保证确定性执行顺序 |
| 阻止能力 | `{ block: true, reason }` 返回值 | 仅 before* hook 有意义 |
| 超时 | 5s `Promise.race` | 防止 hook 卡死主流程 |
| 异常策略 | try/catch + warn 日志 | 单个 hook 崩溃不影响其余 |
| Hook 上限 | 50 per point | 防止过度注册 |

### 新增文件

- `hooks/index.ts` — HookRegistry 类 + 全局 singleton + Payload 类型

### 类型定义

```typescript
type HookPoint =
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'beforeLLMCall'
  | 'afterLLMCall'
  | 'beforePersist'
  | 'afterPersist'

// 每个 HookPoint 有对应的类型安全 Payload：
interface BeforeToolCallPayload { toolName: string; args: Record<string, unknown>; sessionKey: string }
interface AfterToolCallPayload  { toolName: string; result: string; isError: boolean; durationMs: number; ... }
interface BeforeLLMCallPayload  { sessionKey: string; providerId: string; modelId: string; messageCount: number; ... }
interface AfterLLMCallPayload   { sessionKey: string; inputTokens: number; outputTokens: number; ... }
interface PersistPayload        { sessionKey: string; messageCount: number }
```

### 数据流

```
globalHookRegistry.register('beforeToolCall', myHandler)
  → hooks.get('beforeToolCall').push(myHandler)

globalHookRegistry.invoke('beforeToolCall', payload)
  → for handler of list:
      → Promise.race([handler(payload), timeout(5s)])
      → if result.block → return { blocked: true, reason }
      → if throw → warn, continue
  → return { blocked: false }
```
