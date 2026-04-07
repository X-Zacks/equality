# Delta Spec: Structured Logger

> Phase J1 — GAP-27

## ADDED Requirements

### Requirement: 日志级别与格式

系统 MUST 提供分级结构化日志，替代散落的 `console.log`。

- 日志级别：`debug | info | warn | error`（严重度递增）
- 输出格式：每条日志 MUST 包含 `{ ts, level, module, message, ...extra }`
- `ts` MUST 为 ISO 8601 格式
- 默认级别：`info`（可通过 `EQUALITY_LOG_LEVEL` 环境变量覆盖）

#### Scenario: 创建 logger 实例
- GIVEN 调用 `createLogger('agent-runner')`
- WHEN `logger.info('tool loop started', { loopCount: 1 })`
- THEN 输出 MUST 包含 `ts`（ISO 8601）、`level: 'info'`、`module: 'agent-runner'`
- AND `message: 'tool loop started'`

#### Scenario: 日志级别过滤
- GIVEN `EQUALITY_LOG_LEVEL=warn`
- WHEN `logger.info('should be filtered')`
- THEN 该条日志 MUST NOT 被输出
- WHEN `logger.warn('should pass')`
- THEN 该条日志 MUST 被输出

#### Scenario: 未知级别 fallback
- GIVEN `EQUALITY_LOG_LEVEL=verbose`（无效值）
- WHEN `resolveLogLevel('verbose')`
- THEN MUST 返回默认值 `'info'`

### Requirement: JSONL 文件输出

- GIVEN `EQUALITY_LOG_FILE` 已设置
- WHEN 任意日志写入
- THEN 该条日志 MUST 以 JSONL 格式（每行一个 JSON 对象 + `\n`）追加到指定文件
- AND 文件写入 MUST 通过 `QueuedFileWriter` 异步执行

#### Scenario: 无文件路径时不写文件
- GIVEN `EQUALITY_LOG_FILE` 未设置且未传入 `writer`
- WHEN 日志写入
- THEN MUST NOT 抛出异常
- AND 仅输出到控制台

### Requirement: 敏感数据脱敏

日志 extra 字段 MUST 对 API Key、token、密码等进行自动脱敏。

- 脱敏规则 MUST 复用 `diagnostics/redact.ts` 的 `sanitizeDiagnosticPayload()`
- 脱敏行为 MAY 通过 `redact: false` 选项关闭

#### Scenario: API Key 脱敏
- GIVEN `createLogger('test', { redact: true })`
- WHEN `logger.info('req', { apiKey: 'sk-12345678901234567890' })`
- THEN JSONL 中 MUST NOT 出现原始 apiKey 值

### Requirement: VALID_LOG_LEVELS 常量

- 系统 MUST 导出 `VALID_LOG_LEVELS` 常量
- 值 MUST 为 `['debug', 'info', 'warn', 'error']`（只读数组）
