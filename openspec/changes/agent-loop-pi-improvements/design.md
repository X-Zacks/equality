# Design: Agent Loop 能力增强

> 关联 Proposal：[proposal.md](./proposal.md)

---

## 阶段 A：工具并行执行

### 当前结构

```typescript
// runner.ts — toolLoop 内，顺序 for 循环
for (let tci = 0; tci < toolCalls.length; tci++) {
  const tc = toolCalls[tci]
  onToolStart?.({ ... })
  const result = await tool.execute(args, toolCtx, ...)  // ← 阻塞等待
  onToolResult?.({ ... })
  messages.push({ role: 'tool', ... })
  loopDetector.check(...)
}
```

### 目标结构

```
[tc0, tc1, tc2]
   │    │    │
   ▼    ▼    ▼
 exec exec exec   ← Promise.allSettled 并发
   │    │    │
   └────┴────┘
        │
  按原始顺序汇总结果
        │
  顺序写入 messages（API 要求）
  顺序运行 LoopDetector
```

### 关键实现细节

**1. 用 `Promise.allSettled` 而非 `Promise.all`**

`Promise.all` 在任一工具抛出时整体 reject，会跳过剩余工具的结果写入，导致 messages 中 tool_call 有记录但 tool_result 缺失，引发 API 报错。`Promise.allSettled` 确保所有工具都有结果（rejected 的视为 isError=true）。

**2. onToolStart 并发发出，onToolResult 完成时立即发出**

各工具独立触发各自的 `onToolStart` / `onToolResult`，UI 侧能看到并发执行的实时反馈。

**3. messages 写入顺序严格按 toolCalls 原始顺序**

`Promise.allSettled` 返回结果数组，顺序与输入数组一致，直接按序写入即可。

**4. LoopDetector 仍在汇总后顺序运行**

```typescript
const results = await Promise.allSettled(executions)
for (const [i, settled] of results.entries()) {
  // 写入 messages
  // LoopDetector.check()
  // 断路器判断
}
```

**5. 关于"批量检测 vs 实时阻断"的权衡**

并行化后，同一轮所有工具已经同时启动。LoopDetector 的 terminate 判断只能在汇总阶段进行——这意味着触发 terminate 时，本轮其他工具已执行完（不会被中止）。
这是可接受的权衡：LoopDetector 的 terminate 极少在首轮触发，通常是在多轮重复调用后才触发。

**6. 断路器（breakerTriggered）逻辑不变**

并行时"未执行"的工具不存在（全部已并发执行），`breakerTriggered` 只影响"是否继续下一轮 toolLoop"，不需要补占位 result。

---

## 阶段 B：beforeToolCall / afterToolCall Hook

### 接口扩展（RunAttemptParams）

```typescript
beforeToolCall?: (info: {
  name: string
  args: Record<string, unknown>
  toolCallId: string
}) => Promise<{ block: true; reason: string } | undefined>

afterToolCall?: (info: {
  name: string
  args: Record<string, unknown>
  toolCallId: string
  result: string
  isError: boolean
}) => Promise<{ result?: string } | undefined>
```

### 执行顺序（在并行 exec 函数内部）

```
解析 args
  ↓
beforeToolCall?.() ← 可 block
  ↓ (若 block)     → resultContent = reason, isError = true, 跳过 execute
onToolStart
  ↓
tool.execute()
  ↓
afterToolCall?.() ← 可替换 result
  ↓
onToolResult
  ↓
logToolCall（异步，不等待）
```

### 错误处理

- `beforeToolCall` 抛出异常 → 记录 warn，视为"允许执行"（不因 hook 失败阻断主流程）
- `afterToolCall` 抛出异常 → 记录 warn，使用原始 result
- `afterToolCall` 返回 `{ result: newContent }` → 替换写入 messages 的内容（`onToolResult` 使用原始值，messages 使用替换后值）

---

## 阶段 C：transformContext 主动上下文裁剪

### 设计决策：内置规则引擎，不暴露接口

**Option A**：作为 `RunAttemptParams.transformContext` 可选参数
- 优点：调用方可自定义
- 缺点：调用方（`index.ts`）是 HTTP 服务器层，不应持有上下文裁剪逻辑

**Option B**：作为 `ContextEngine.assemble()` 之前的可选 hook（扩展接口）
- 优点：接口清晰
- 缺点：`ContextEngine` 接口每次扩展都需要修改所有实现

**Option C（已实施）**：内置到 `DefaultContextEngine`，全部参数与 OpenClaw 对齐动态计算

最终参数（讨论后确认）：
- 单条 tool result 上限：`contextWindow × 4字/token × 50%`（无固定阈值，随模型变大自动扩容）
- 全局 context 预算：`contextWindow × 4字/token × 75%`（同 OpenClaw CONTEXT_INPUT_HEADROOM_RATIO）
- 绝对硬上限：400,000 字（HARD_MAX_TOOL_RESULT_CHARS）
- 无"最近 N 轮保护"：与 OpenClaw 一致
- `trimMessages` 的预算也改为动态计算（同全局预算），退化为极端兜底

`truncateToolResult` 同步升级：
- head+tail 策略：尾部有 error/JSON/summary 时 head 70% + tail 30%
- 截断提示文案与 OpenClaw 对齐（说明可分段请求）

---

## 阶段 D：Steering 消息

### 状态存放决策：index.ts 级 Map（不进 SessionData）

**Option A**：`index.ts` 的 `Map<string, string[]>`
- 优点：简单，不污染 SessionData（steering 消息是运行时状态，不需要持久化）
- 缺点：与 runner 耦合（runner 需要能访问该 Map）

**Option B**：`SessionData` 字段 `steeringQueue: string[]`
- 优点：语义清晰，session 状态统一
- 缺点：需要修改 `SessionData` 类型 + persist 逻辑（steering 消息不应被持久化）

**Option C（选择）**：`index.ts` 级 Map，通过 `RunAttemptParams.steeringQueue` 传入引用

```typescript
// index.ts
const steeringQueues = new Map<string, string[]>()

// runAttempt 调用时
const queue = steeringQueues.get(sessionKey) ?? []
steeringQueues.set(sessionKey, queue)
runAttempt({ ..., steeringQueue: queue })
```

```typescript
// runner.ts — toolLoop 每轮工具执行完后
const steeredMsg = params.steeringQueue?.shift()
if (steeredMsg) {
  messages.push({ role: 'user', content: `[Steering] ${steeredMsg}` })
  onDelta?.(`\n\n📍 用户调整了方向：${steeredMsg}\n\n`)
}
```

### 新 HTTP 端点

```
POST /chat/steer
Body: { sessionKey?: string, message: string }
Response: { ok: boolean, queued: boolean }
```

`queued: true` 表示该 session 当前正在运行，消息已进队列；`queued: false` 表示 session 空闲，steering 消息已丢弃（应改用普通 chat）。

### 与 SessionQueue 的关系

Steering 消息写入 Map 不走 `SessionQueue`（不排队），直接在当前运行的 `runAttempt` 内部被消费。这正是 Steering 的语义：**中途注入，不排队等待**。

> ⚠️ 阶段 D 需要在阶段 A 完成后再讨论，因为并行执行后"轮次间隙"的时序更清晰。**在此之前暂不实施。**

---

## 文件变更概览

| 阶段 | 文件 | 变更类型 |
|------|------|----------|
| A | `packages/core/src/agent/runner.ts` | 修改（toolLoop 内约 40 行） |
| B | `packages/core/src/agent/runner.ts` | 修改（RunAttemptParams 扩展 + exec 函数内插入） |
| C | `packages/core/src/context/default-engine.ts` | 修改（assemble 内插入裁剪逻辑） |
| D | `packages/core/src/agent/runner.ts` | 修改（RunAttemptParams 扩展 + toolLoop 内插入） |
| D | `packages/core/src/index.ts` | 修改（steeringQueues Map + steer 端点） |
