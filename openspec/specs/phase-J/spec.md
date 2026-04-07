# Phase J Specification — Observability & Hooks Foundation

> GAP-27 (Structured Logger), GAP-35 (Session Lifecycle Events), GAP-36 (Hooks Framework)

---

## J.1 Structured Logger (GAP-27)

### Requirement: 日志级别与格式

系统 MUST 提供分级结构化日志，替代散落的 `console.log`。

- 日志级别：`debug | info | warn | error`
- 输出格式：每条日志 MUST 包含 `{ ts, level, module, message, ...extra }`
- 默认级别：`info`（可通过 `EQUALITY_LOG_LEVEL` 环境变量覆盖）

#### Scenario: 创建 logger 实例
- GIVEN 调用 `createLogger('agent-runner')`
- WHEN logger.info('tool loop started', { loopCount: 1 })
- THEN 输出 MUST 包含 `ts`（ISO 8601）、`level: 'info'`、`module: 'agent-runner'`

#### Scenario: 日志级别过滤
- GIVEN EQUALITY_LOG_LEVEL=warn
- WHEN logger.info('should be filtered')
- THEN 该条日志 MUST NOT 被输出

#### Scenario: JSONL sink
- GIVEN EQUALITY_LOG_FILE 已设置
- WHEN 任意日志写入
- THEN 该条日志 MUST 异步追加到指定文件（JSONL 格式）

### Requirement: 敏感数据脱敏

- 日志内容 MUST 对 API Key、token、密码等进行自动脱敏
- 脱敏规则复用 `diagnostics/redact.ts` 的 `sanitizeDiagnosticPayload()`

---

## J.2 Session Lifecycle Events (GAP-35)

### Requirement: 生命周期事件定义

系统 MUST 在 session 关键时刻发射结构化事件。

事件类型：
- `session:created` — 新 session 首次创建
- `session:restored` — 从磁盘恢复 session
- `session:persisted` — session 写入磁盘
- `session:destroyed` — session 被删除
- `session:reaped` — session 因空闲超时被回收

#### Scenario: session 创建事件
- GIVEN 用户首次发送消息到新 sessionKey
- WHEN getOrCreate() 创建新 session
- THEN MUST 发射 `session:created` 事件，包含 `{ sessionKey, timestamp }`

#### Scenario: session 持久化事件
- GIVEN runner 调用 persist(session)
- WHEN 写入磁盘成功
- THEN MUST 发射 `session:persisted` 事件，包含 `{ sessionKey, messageCount, timestamp }`

### Requirement: 事件订阅

- `onSessionEvent(type, handler)` — 注册监听器
- `offSessionEvent(type, handler)` — 移除监听器
- 事件分发 MUST 是同步的（不丢事件）
- 单个事件类型的监听器上限：100（超出时 warn）

---

## J.3 Hooks Framework (GAP-36)

### Requirement: Hook 注册与触发

系统 MUST 提供可扩展的 hook 点，允许在关键操作前后注入自定义逻辑。

Hook 点定义：
- `beforeToolCall` — 工具执行前（可阻止执行）
- `afterToolCall` — 工具执行后（可修改结果）
- `beforeLLMCall` — LLM 调用前（可修改 messages）
- `afterLLMCall` — LLM 调用后（可读取 usage）
- `beforePersist` — session 持久化前（可修改内容）
- `afterPersist` — session 持久化后（通知）

#### Scenario: 注册 beforeToolCall hook
- GIVEN hookRegistry.register('beforeToolCall', myHandler)
- WHEN runner 执行工具调用
- THEN myHandler MUST 被调用，接收 `{ toolName, args, sessionKey }`

#### Scenario: hook 阻止工具执行
- GIVEN hook 返回 `{ block: true, reason: 'denied' }`
- WHEN runner 检查 hook 结果
- THEN 工具 MUST NOT 被执行
- AND LLM 收到 `isError=true` 的结果

#### Scenario: 多个 hook 按注册顺序执行
- GIVEN hookRegistry.register('afterToolCall', handlerA)
- AND hookRegistry.register('afterToolCall', handlerB)
- WHEN afterToolCall 触发
- THEN handlerA MUST 先于 handlerB 执行

### Requirement: Hook 错误隔离

- 单个 hook 抛出异常 MUST NOT 影响其他 hook 或主流程
- 异常 MUST 被 catch 并记录 warn 日志
- hook 执行超时（默认 5s）MUST 被跳过

---

## J.4 Gateway Integration

### Requirement: 将 J.1-J.3 接入运行时

- index.ts MUST 初始化 logger 实例
- runner.ts MUST 在 tool loop 中调用 beforeLLMCall / afterLLMCall hooks
- persist.ts MUST 在写入成功后发射 session:persisted 事件
- store.ts MUST 在创建/恢复 session 时发射相应事件
