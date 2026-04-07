# Delta Spec: Hooks Framework

> Phase J3 — GAP-36

## ADDED Requirements

### Requirement: Hook 注册与触发

系统 MUST 提供可扩展的 hook 点，允许在关键操作前后注入自定义逻辑。

Hook 点定义：
- `beforeToolCall` — 工具执行前（可阻止执行）
- `afterToolCall` — 工具执行后
- `beforeLLMCall` — LLM 调用前
- `afterLLMCall` — LLM 调用后
- `beforePersist` — session 持久化前
- `afterPersist` — session 持久化后

每个 hook 点 MUST 有类型安全的 Payload 定义。

#### Scenario: 注册 beforeToolCall hook
- GIVEN `registry.register('beforeToolCall', myHandler)`
- WHEN `registry.invoke('beforeToolCall', payload)` 被调用
- THEN `myHandler` MUST 被调用
- AND 接收 `{ toolName, args, sessionKey }` payload

#### Scenario: hook 阻止工具执行
- GIVEN hook 返回 `{ block: true, reason: 'denied' }`
- WHEN `invoke()` 检查结果
- THEN MUST 返回 `{ blocked: true, reason: 'denied' }`

#### Scenario: 无 hook 时安全返回
- GIVEN 某 hook 点无任何 handler
- WHEN `invoke(point, payload)`
- THEN MUST 返回 `{ blocked: false }`（不抛异常）

### Requirement: Hook 执行顺序

- 多个 hook MUST 按注册顺序依次执行
- 执行方式 MUST 为顺序 `await`（非并行）

#### Scenario: 注册顺序
- GIVEN 依次注册 handlerA, handlerB
- WHEN `invoke()` 触发
- THEN handlerA MUST 先于 handlerB 执行

### Requirement: 取消注册

- `register()` MUST 返回一个取消函数
- 调用取消函数后，handler MUST 不再被触发

#### Scenario: 取消注册
- GIVEN `const unregister = registry.register('afterToolCall', handler)`
- WHEN `unregister()` 被调用
- THEN `registry.count('afterToolCall')` MUST 减少 1
- WHEN 再次 `invoke('afterToolCall', payload)`
- THEN `handler` MUST NOT 被调用

### Requirement: 错误隔离

- 单个 hook 抛出异常 MUST NOT 影响其他 hook 或主流程
- 异常 MUST 被 catch 并记录 warn 日志
- hook 执行超时（默认 5s）MUST 被跳过并记录警告

#### Scenario: hook 抛出异常
- GIVEN handlerA 抛出异常
- AND handlerB 正常执行
- WHEN `invoke()` 触发
- THEN handlerB MUST 被正常调用
- AND 返回 `{ blocked: false }`

### Requirement: Hook 上限

- 单个 hook 点 SHOULD NOT 超过 50 个 handler
- 超出时 MUST 输出 warn 日志

### Requirement: 清理 API

- `clear()` — 清除所有 hook 点的所有 handler
- `clearPoint(point)` — 清除指定 hook 点的所有 handler
- `count(point)` — 查询指定 hook 点的 handler 数量

#### Scenario: clear 和 clearPoint
- GIVEN 多个 hook 点各有 handler
- WHEN `clearPoint('beforeToolCall')` 被调用
- THEN 仅 `beforeToolCall` 的 handler 被清除
- WHEN `clear()` 被调用
- THEN 所有 hook 点的 handler MUST 被清除

### Requirement: 全局 Registry

- 系统 MUST 导出 `globalHookRegistry` 单例
- 系统 MUST 导出 `HOOK_POINTS` 常量（包含全部 6 个 hook 点名称）

### Requirement: Persist Hooks

- `beforePersist` 和 `afterPersist` MUST 使用 `PersistPayload` 类型
- `PersistPayload` MUST 包含 `{ sessionKey, messageCount }`
