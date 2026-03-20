# Design: 会话切换后流式内容恢复

## 1. 现状分析

### runner.ts 的当前消息写入时机

```
tool loop:
  LLM → tool_calls → 执行 tool → onToolResult 回调 → messages.push(tool_result)
                                                         ↑ 只在内存，未持久化
  → 再次 LLM → ...
  → loop 结束
→ afterTurn() → persist(session)   ← 唯一的持久化时机
```

`afterTurn()` 由 `DefaultContextEngine` 实现，只写入最终的 `assistantMessage`（纯文本），工具调用的 `messages`（`tool_calls` + `tool_results`）存在 `session.messages` 内存里但**从未被单独持久化**。`persist(session)` 会把整个 `session.messages` 写磁盘，但只在 run 结束时调用一次。

### 切换后恢复的缺口

```
切换前：session.messages (内存) = [user, assistant+tool_calls, tool_results, ...]
切换后：前端调用 loadHistory → GET /history → session.json (磁盘) = [user] （只有本次 run 前的历史）
```

---

## 2. 方案：runner.ts 每次 tool_result 后调用 persist

### 核心改动：`packages/core/src/agent/runner.ts`

在 `onToolResult?.()` 回调之后、下一轮循环之前，新增一次持久化：

```typescript
// 通知：工具完成
onToolResult?.({ toolCallId: tc.id, name: tc.name, content: resultContent, isError })

// 将工具结果注入消息列表（给下一轮 LLM）
messages.push({
  role: 'tool',
  tool_call_id: tc.id,
  content: resultContent,
})

// ── 新增：每次 tool_result 后立即持久化 session ──────────────────────
// 确保用户切换会话再切回来时，loadHistory 能看到已完成的工具调用
await persist(session)   // ← 新增
```

### session.messages 的内容

runner 在执行 tool loop 时，`messages` 数组（也就是 `session.messages`）中已经包含了：
- `{ role: 'assistant', content: null, tool_calls: [...] }` — LLM 发出的工具调用
- `{ role: 'tool', tool_call_id: ..., content: ... }` — 工具执行结果

这些都是在内存中的 `session.messages`，直接 `persist(session)` 就会把它们写入磁盘，无需额外构造消息。

### 为什么 afterTurn 不需要改

`afterTurn()` 调用 `persist(session)` 时，`session.messages` 已包含所有工具调用（因为 runner 在 loop 里 push 进去了）。提前 persist 只是**提前把同样的内容写一次**，afterTurn 的最终 persist 是幂等的（文件内容相同），无重复问题。

`afterTurn()` 还会 push 最终的 `assistantMessage`（纯文本回复），这部分**不提前写**，因为流式文本尚未完成。

---

## 3. 幂等性分析

| 时机 | persist 写的内容 | 是否重复 |
|------|----------------|---------|
| tool_result 后（新增） | session.messages 当前状态（含已完成的 tool_calls+results） | 覆盖写，不追加 |
| afterTurn（现有） | session.messages + 最终 assistantMessage | 覆盖写，不追加 |

`persist()` 实现是把整个 `session` 对象序列化为 JSON 写入文件（覆盖），不是追加，所以天然幂等。

---

## 4. abort/pause 兼容性

- **abort**：abort 后 `session.runningAbort = null`，但 `session.messages` 里已有已完成的工具调用（提前 persist 了）。前端 loadHistory 能看到这些，符合预期。
- **pause**：`persist_session` Tauri 命令也调用 `persist(session)`，与新增的提前 persist 协同工作（覆盖写，幂等）。

---

## 5. 性能考量

每次 `tool_result` 后调用一次 `persist(session)`，即每个工具调用多一次磁盘写。

对于典型任务（5~20 个工具调用），每次写入 session.json 大小通常在几十 KB 以内，磁盘 I/O 可忽略不计。`persist` 是 `await`，但由于它是纯 JSON 序列化 + 文件写，延迟 < 5ms，不影响工具执行间隔。

---

## 6. 改动范围

| 文件 | 改动 |
|------|------|
| `packages/core/src/agent/runner.ts` | 新增 `import { persist }` + 每次 tool_result 后 `await persist(session)` |
| 其他文件 | 无需改动 |

`persist` 已在 `default-engine.ts` 中 import，`runner.ts` 只需新增一行 import。
