# Design: 任务暂停与重定向

## 1. 状态机

### 前端状态扩展（`Chat.tsx`）

新增两个状态变量：

```
pauseIntent: boolean   // 用户已点暂停，等待下一个 tool_result 后触发
paused: boolean        // 已暂停，等待用户输入重定向指令
```

完整状态转移：

```
[idle]
  ─ 发送消息 ──────────────────────────────────→ [streaming]
  ─ （paused 状态下）发送重定向消息 ──────────→ [streaming]
  
[streaming]
  ─ done/error 事件 ───────────────────────────→ [idle]
  ─ 点「停止」按钮 ────────────────────────────→ [idle]（abort 立即生效）
  ─ 点「暂停」按钮 ────────────────────────────→ [streaming + pauseIntent=true]
  
[streaming + pauseIntent=true]
  ─ tool_result 事件到达 ──────────────────────→ 触发 abort() → [paused]
  ─ done 事件（任务自然完成）─────────────────→ [idle]（清除 pauseIntent）
  ─ error 事件 ────────────────────────────────→ [idle]（清除 pauseIntent）
  
[paused]
  ─ 用户发送重定向消息 ────────────────────────→ [streaming]
  ─ 用户点「取消」────────────────────────────→ [idle]
```

### `pauseIntent` 的精确触发点

`tool_result` 事件到达时，检查 `pauseIntentRef.current`（ref 而非 state，避免闭包捕获旧值）。如为 true：
1. 调用 `abort()`（当前 tool 刚完成，runner 此时若没有 abort 信号会继续发起下一轮 LLM）

由于 `abort()` 是立即的（`invoke('abort_chat', ...)`），而 runner 的 tool loop 在工具执行完之后、下一轮 LLM 调用之前会检查 `abort.signal.aborted`，abort 会在这个检查点生效，即：
```
runner: tool execute ─→ tool result notify ─→ CHECK abort.signal ← abort 在这里生效
                                                  ↓ (aborted = true)
                                                break toolLoop
```

这意味着：**当前工具完整执行，下一轮 LLM 不启动**，符合预期的"干净暂停"。

---

## 2. 组件改动

### 2.1 `useGateway.ts`

不需要改动。`abort()` 机制已存在，直接复用。

### 2.2 `Chat.tsx`

#### 新增 state / ref

```typescript
const pauseIntentRef = useRef(false)         // 暂停意图（ref 避免闭包问题）
const [paused, setPaused] = useState(false)  // 已暂停状态
```

#### `sendMessage` 的 `onToolCall` 回调中新增暂停检测

```typescript
// 已有的 tool call 事件处理（onToolCall 回调），在 tool_result 到达时检测暂停意图
if (toolEvent.status === 'done' || toolEvent.status === 'error') {
  // tool_result 到达
  if (pauseIntentRef.current) {
    pauseIntentRef.current = false
    // abort 要在下一轮 LLM 之前触发
    // 注：abort() 调用 invoke('abort_chat')，runner 的 tool loop 会在
    // 下次检查 abort.signal 时 break，即当前工具完成后下一轮 LLM 前
    abort()
    setPaused(true)
    // 注意：abort() 内部已调用 setStreaming(false)，
    // 并会触发 onAbort 回调（清理 streamingText / activeToolCalls）
    // 但 paused 状态下我们希望保留已完成的工具调用记录，
    // 所以需要调整 onAbort 回调行为（见 2.3）
    return  // 不继续更新 state
  }
}
```

#### 调整 `handleSend` 支持 `paused` 状态下发送

```typescript
const handleSend = async () => {
  // paused 状态下也允许发送
  if ((!input.trim() && attachments.length === 0) || (streaming && !paused)) return
  
  if (paused) setPaused(false)  // 清除暂停状态，正常发送
  // ... 其余逻辑不变
}
```

#### 新增暂停按钮

当前输入区只有「停止」/「发送」两态，改为三态：

```
streaming && !pauseIntent  → 显示 [⏸ 暂停] + [■ 停止]
streaming && pauseIntent   → 显示 [⏳ 等待暂停…] + [■ 停止]
paused                     → 显示 [取消] + 输入框（placeholder 已改）
!streaming && !paused      → 显示 [↑ 发送]
```

#### 暂停横幅

当 `paused === true` 时，在输入区顶部显示：

```tsx
{paused && (
  <div className="pause-banner">
    ⏸ 已暂停 · 已完成 {completedToolCount} 个工具调用
    · 输入指令继续，或
    <button onClick={() => setPaused(false)}>取消</button>
  </div>
)}
```

`completedToolCount` 从 `activeToolCalls.filter(t => t.status === 'done').length` 获取（onAbort 时保留已完成工具调用，见 2.3）。

### 2.3 `onAbort` 回调在暂停场景下的行为差异

目前 `onAbort` 统一做清理（`setMessages` 追加「⏹ 已中止」，清空 `activeToolCalls`）。

需要区分两种 abort：
- **用户点停止**：保留现有行为（显示「已中止」，清空工具卡片）
- **暂停触发的 abort**：工具调用保留在消息气泡中（显示已完成的结果），不追加「已中止」

实现：`pauseIntentRef.current` 已经被清零，但需要一个额外标志区分是"暂停 abort"还是"停止 abort"。

方案：引入 `pauseAbortRef = useRef(false)`，在 `pauseIntentRef` 判断分支设为 true 再调用 abort，在 `onAbort` 中读取并决定行为。

```typescript
// onAbort 回调
() => {
  if (pauseAbortRef.current) {
    // 暂停触发的 abort：工具调用结果已通过 setMessages 追加（done 的 tool 有结果），不需额外操作
    pauseAbortRef.current = false
    // 不追加「已中止」消息，不清空已完成工具卡片
    streamingTextRef.current = ''
    setStreamingText('')
    // activeToolCalls 在暂停横幅中仍然显示
  } else {
    // 普通停止：现有行为
    const partial = streamingTextRef.current
    const tools = activeToolCallsRef.current.map(t =>
      t.status === 'running' ? { ...t, status: 'error', result: '⏹ 已中止' } : t,
    )
    if (partial || tools.length > 0) {
      setMessages(msgs => [...msgs, {
        role: 'assistant',
        content: partial ? partial + '\n\n⏹ *已中止*' : '⏹ *已中止*',
        toolCalls: tools.length > 0 ? tools : undefined,
      }])
    }
    streamingTextRef.current = ''
    setStreamingText('')
    activeToolCallsRef.current = []
    setActiveToolCalls([])
  }
}
```

---

## 3. UI 布局

### 输入区按钮区域

```
┌────────────────────────────────────────────────┐
│ ⏸ 已暂停 · 已完成 3 个工具调用 · 输入指令继续  │ [取消]
├────────────────────────────────────────────────┤
│ 📎 │ [输入指令继续任务，或直接发送让 AI 继续…] │ [↑]
└────────────────────────────────────────────────┘
```

运行中（无暂停意图）：

```
┌──────────────────────────────────────────────────────┐
│ 📎 │ [输入消息…（Enter 发送，Shift+Enter 换行）] │ ⏸ │ ■ │
└──────────────────────────────────────────────────────┘
```

运行中（已设暂停意图，等待生效）：

```
┌──────────────────────────────────────────────────────┐
│ 📎 │ [输入消息…]                                 │ ⏳ │ ■ │
└──────────────────────────────────────────────────────┘
      （⏳ 按钮 disabled，tooltip: "等待当前工具完成后暂停"）
```

### 暂停横幅 CSS 风格

- 背景：`rgba(255, 159, 10, 0.1)`（橙色，区别于普通状态）
- 左侧 2px 橙色实线 border
- 文字：`#ff9f0a`
- 高度：32px，compact

---

## 4. 重定向消息的语义

用户在 `paused` 状态下发送的消息，直接以 `user` 角色加入会话。Core 的 session 历史包含：

```
user: "帮我用 React 写一个登录页"
assistant: (tool_calls: [write_file(login.tsx), bash(npm install)])  ← 已完成的步骤
user: "停一下，换用 Vue 3"  ← 用户的重定向指令
assistant: ...  ← AI 重新规划
```

AI 拿到完整历史，能看到：
1. 原始任务
2. 已完成的步骤
3. 用户的新指令

自然能理解意图并从已完成的位置调整方向，无需前端做任何特殊构造。

---

## 5. 边界情况

### 5.1 纯文本回复时点暂停

AI 只输出文字（无工具调用），不会有 `tool_result` 事件触发暂停。

行为：`pauseIntent` 等待，当 `done` 事件到达时清除 `pauseIntent`，回到正常完成状态（不进入 paused）。

**不降级为立即停止**，避免意外中断文字回复。UI 上 `⏳ 等待暂停…` 按钮维持，直到 done 后变回正常。

### 5.2 暂停后什么都不说，直接发送空指令

不允许：发送按钮在输入为空时 disabled（和现有逻辑一致）。

用户必须输入内容才能继续，或点「取消」回到普通空闲。

### 5.3 暂停后切换会话

切换会话时清除 `paused` 和 `pauseIntent`（sessionKey 变化时的 useEffect 中加入清理）。

### 5.4 连续多次点暂停

`pauseIntent` 是 boolean，重复点击无效（已经在等待中）。UI 上按钮变为 disabled 状态。

### 5.5 工具执行失败时点暂停

`tool_result` 事件在 `isError=true` 时同样会到达（`status: 'error'`）。`pauseIntent` 检测包含 `error` 状态，因此工具报错时也会触发暂停，让用户看到错误并决定如何指示。

---

## 6. 不在此版本内

- **工具调用级别的审批**（每次工具调用前等待用户确认）：更细粒度，另立 spec
- **暂停后修改 AI 的工具参数**：需要专门的工具参数编辑 UI
- **Core 侧的"暂停点"API**：目前纯前端实现，无需 Core 改动
