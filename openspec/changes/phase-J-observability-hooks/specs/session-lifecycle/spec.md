# Delta Spec: Session Lifecycle Events

> Phase J2 — GAP-35

## ADDED Requirements

### Requirement: 生命周期事件定义

系统 MUST 在 session 关键时刻发射结构化事件。

事件类型：
- `session:created` — 新 session 首次创建
- `session:restored` — 从磁盘恢复 session
- `session:persisted` — session 写入磁盘
- `session:destroyed` — session 被删除
- `session:reaped` — session 因空闲超时被回收

每个事件 MUST 包含 `{ type, sessionKey, timestamp, data? }`。

#### Scenario: session 创建事件
- GIVEN 用户首次发送消息到新 sessionKey
- WHEN `emitSessionEvent('session:created', sessionKey)` 被调用
- THEN 所有已注册的监听器 MUST 同步收到 `SessionEvent`
- AND `event.type` MUST 为 `'session:created'`
- AND `event.timestamp` MUST 为当前时间戳

#### Scenario: session 持久化事件携带数据
- GIVEN `emitSessionEvent('session:persisted', key, { messageCount: 42 })`
- WHEN 事件分发
- THEN `event.data.messageCount` MUST 为 `42`

### Requirement: 事件订阅与移除

- `onSessionEvent(type, handler)` — 注册监听器
- `offSessionEvent(type, handler)` — 移除监听器（返回 boolean）
- `listenerCount(type)` — 查询监听器数量
- `clearAllSessionListeners()` — 清除所有监听器（测试用）

#### Scenario: 注册与移除监听器
- GIVEN `onSessionEvent('session:destroyed', handler)`
- THEN `listenerCount('session:destroyed')` MUST 为 1
- WHEN `offSessionEvent('session:destroyed', handler)` 返回 `true`
- THEN `listenerCount('session:destroyed')` MUST 为 0
- WHEN 再次 `emitSessionEvent('session:destroyed', key)`
- THEN `handler` MUST NOT 被调用

#### Scenario: 多监听器顺序
- GIVEN 按顺序注册 handler1, handler2, handler3
- WHEN 事件触发
- THEN MUST 按注册顺序执行

### Requirement: 异常隔离

- 单个 handler 抛出异常 MUST NOT 影响其他 handler 的执行
- 异常 MUST 被 catch 并输出 warn 日志
- 无监听器时 `emitSessionEvent()` MUST 安全返回（不抛异常）

#### Scenario: handler 抛出异常
- GIVEN handler1 抛出 `Error('boom')`
- AND handler2 正常执行
- WHEN 事件触发
- THEN handler2 MUST 被正常调用
- AND warn 日志 MUST 包含异常信息

### Requirement: 监听器上限

- 单个事件类型的监听器 SHOULD NOT 超过 100 个
- 超出时 MUST 输出 warn 日志

### Requirement: SESSION_EVENT_TYPES 常量

- 系统 MUST 导出 `SESSION_EVENT_TYPES` 常量
- 值 MUST 包含全部 5 种事件类型（只读数组）
