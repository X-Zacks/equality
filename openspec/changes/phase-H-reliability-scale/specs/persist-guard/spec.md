# Delta Spec: Session Tool Result Persist Guard

> Phase H4 (GAP-26) — 会话级 Tool Result 持久化守卫  
> 修改领域：session（持久化时截断超大 tool result）

---

## ADDED Requirements

### Requirement: 持久化截断函数

系统 MUST 提供 `truncateForPersistence(messages)` 函数，在会话消息写入磁盘前截断超大的 tool result。

```typescript
interface PersistGuardOptions {
  maxToolResultChars?: number    // 单条 tool result 上限（默认 50,000 字符）
  totalBudgetChars?: number      // 整次 persist 调用的总预算（默认 500,000 字符）
}

interface PersistGuardResult {
  messages: LLMMessage[]         // 截断后的消息列表
  truncatedCount: number         // 被截断的消息数
  savedChars: number             // 节省的字符数
}

function truncateForPersistence(
  messages: LLMMessage[],
  opts?: PersistGuardOptions,
): PersistGuardResult
```

#### Scenario: 小消息不截断
- GIVEN 所有 tool result 都小于 50,000 字符
- WHEN `truncateForPersistence(messages)` 被调用
- THEN `truncatedCount` 为 0
- AND 消息内容不变

#### Scenario: 超大 tool result 被截断
- GIVEN 一条 tool result 包含 200,000 字符
- WHEN `truncateForPersistence(messages)` 被调用
- THEN 该 tool result 被截断到 ≤ 50,000 字符
- AND 追加截断提示
- AND `truncatedCount` 为 1
- AND `savedChars` ≈ 150,000

#### Scenario: 多条超大 tool result
- GIVEN 3 条 tool result 各 100,000 字符
- WHEN `truncateForPersistence(messages)` 被调用
- THEN 3 条都被截断
- AND `truncatedCount` 为 3

---

### Requirement: 截断策略

截断 MUST 复用 `truncation.ts` 中的 head+tail 策略（有重要尾部时保留 70% head + 30% tail），追加专用的持久化截断提示：

```
⚠️ [内容在持久化时被截断 — 原始输出过大，超出存储限制。
如需完整内容，请重新执行相关工具调用。]
```

#### Scenario: 尾部有错误信息
- GIVEN tool result 尾部包含 "Error: connection refused"
- WHEN 持久化截断时
- THEN 使用 head+tail 策略（保留尾部错误信息）

---

### Requirement: 只截断 tool result 角色

系统 MUST 只截断 `role === 'tool'` 的消息。`user`、`assistant`、`system` 角色的消息 SHALL NOT 被截断。

#### Scenario: assistant 消息不受影响
- GIVEN 一条 200,000 字符的 assistant 消息
- WHEN `truncateForPersistence(messages)` 被调用
- THEN 该消息内容不变

---

### Requirement: 集成到 session persist

`session/persist.ts` 的 `persist()` 函数 MUST 在 `JSON.stringify` 之前调用 `truncateForPersistence()`。

#### Scenario: 持久化自动截断
- GIVEN 会话包含超大 tool result
- WHEN `persist(session)` 被调用
- THEN 写入磁盘的 JSON 中 tool result 已被截断
- AND 内存中的 session.messages 不受影响（只截断副本）

---

### Requirement: 总预算保护

当单次 persist 调用中所有消息的总字符数超过 `totalBudgetChars`（默认 500,000）时，系统 SHOULD 按消息大小降序依次截断 tool result，直到总量在预算内。

#### Scenario: 总量超预算
- GIVEN 10 条 tool result，每条 80,000 字符（总计 800,000）
- AND totalBudgetChars = 500,000
- WHEN `truncateForPersistence(messages)` 被调用
- THEN 最大的几条 tool result 被截断
- AND 总字符数降到 ≤ 500,000
