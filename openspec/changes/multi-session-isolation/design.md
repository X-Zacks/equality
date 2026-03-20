# 多会话隔离 — 设计文档

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│  App.tsx                                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ openedSessions: string[]   (最多 10 个，按加入顺序排列)         │   │
│  │ sessionKey: string         (当前活跃会话)                       │   │
│  │ currentStreaming: boolean  (当前会话的 streaming 状态)          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  openedSessions.map(key =>                                          │
│    <div style={{ display: key === sessionKey ? 'contents':'none'}}> │
│      <Chat sessionKey={key}                                         │
│            onStreamingChange={key===sessionKey ? setStreaming : ?}  │
│      />                                                             │
│    </div>                                                           │
│  )                                                                  │
└─────────────────────────────────────────────────────────────────────┘

每个 Chat 实例
  ├── 独立 messages state
  ├── 独立 activeToolCalls state
  ├── 独立 streamingText state
  ├── 独立 streaming state (boolean)
  └── listen('chat-delta') 注册一次，按 evt.sessionKey 过滤
```

---

## 2. Core 层变更

### 文件：`packages/core/src/index.ts`

**变更目标**：`send()` lambda 自动注入 `sessionKey` 字段。

#### 当前代码（line ~180）

```typescript
const send = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`)
```

#### 变更后

```typescript
const send = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify({ ...obj as object, sessionKey })}\n\n`)
```

**影响范围**：所有 `send({type: 'delta', ...})` / `send({type: 'tool_start', ...})` 等调用无需修改，自动携带 `sessionKey`。

**变更量**：1 行。

---

## 3. useGateway.ts 变更

### 3.1 DeltaEvent 类型增加 sessionKey 字段

```typescript
// 变更前
interface DeltaEvent {
  type: 'delta' | 'done' | 'error' | 'tool_start' | 'tool_result' | 'tool_update'
  content?: string
  // ...其余字段
}

// 变更后
interface DeltaEvent {
  type: 'delta' | 'done' | 'error' | 'tool_start' | 'tool_result' | 'tool_update'
  sessionKey?: string   // ← 新增：Core 注入的会话标识
  content?: string
  // ...其余字段不变
}
```

### 3.2 移除全局 streaming state

```typescript
// 变更前
export function useGateway() {
  const [streaming, setStreaming] = useState(false)
  // ...
  return { streaming, ... }
}

// 变更后
export function useGateway() {
  // 删除 streaming state，不再从 useGateway 暴露
  // ...
  return { /* streaming 已移除 */ coreOnline, sendMessage, abort, ... }
}
```

### 3.3 sendMessage 签名新增 onStreamingChange 回调

`sendMessage` 内部将 `setStreaming(true/false)` 替换为调用 `onStreamingChange` 回调：

```typescript
const sendMessage = useCallback(
  async (
    message: string,
    onDelta: (chunk: string) => void,
    onDone: (usage?: DeltaEvent['usage']) => void,
    onError: (msg: string) => void,
    onToolCall?: (event: ToolCallEvent) => void,
    sessionKey?: string,
    model?: string,
    onAbort?: () => void,
    onStreamingChange?: (streaming: boolean) => void,  // ← 新增
  ): Promise<void> => {
    // ...
    onStreamingChange?.(true)   // 替换原 setStreaming(true)
    // ...
    onStreamingChange?.(false)  // 替换原 setStreaming(false)
  }
)
```

**注意**：`sendMessage` 的新参数追加在末尾，不破坏现有调用方（已有调用不传该参数也能工作，`streaming` 只是不再从外部可见）。

---

## 4. Chat.tsx 变更

### 4.1 新增 Props

```typescript
// 变更前
interface ChatProps {
  sessionKey: string
}

// 变更后
interface ChatProps {
  sessionKey: string
  onStreamingChange?: (streaming: boolean) => void  // ← 新增
}
```

### 4.2 增加本地 streaming state

```typescript
// Chat 组件内新增
const [streaming, setStreaming] = useState(false)

// 变更前：从 useGateway 获取
const { streaming, sendMessage, abort, loadSession } = useGateway()

// 变更后：不再从 useGateway 解构 streaming
const { sendMessage, abort, loadSession } = useGateway()
```

### 4.3 streaming 变化时通知 App.tsx

```typescript
useEffect(() => {
  props.onStreamingChange?.(streaming)
}, [streaming, props.onStreamingChange])
```

或者在 setStreaming 调用点同步通知（两种都可，选 useEffect 更整洁）。

### 4.4 sendMessage 调用传入 onStreamingChange

```typescript
sendMessage(
  fullMessage,
  onDelta,
  onDone,
  onError,
  onToolCall,
  sessionKey,
  model,
  onAbort,
  (s) => setStreaming(s),  // ← 新增：透传给 useGateway
)
```

### 4.5 移除 sessionSnapshotCache（已被多实例方案取代）

删除以下内容：
- `SessionSnapshot` 类型定义（lines 64–77）
- `sessionSnapshotCache` Map（line 78）
- sessionKey useEffect 中的保存快照 + 恢复快照逻辑
- done/error 回调中的 `sessionSnapshotCache.delete(sessionKey)`

---

## 5. App.tsx 变更

### 5.1 新增 openedSessions 状态

```typescript
// 新增
const [openedSessions, setOpenedSessions] = useState<string[]>(() => {
  const initial = localStorage.getItem('equality-session-key') || newSessionKey()
  return [initial]
})
const [currentStreaming, setCurrentStreaming] = useState(false)
```

### 5.2 handleNewChat 同步 openedSessions

```typescript
const handleNewChat = useCallback(() => {
  const newKey = newSessionKey()
  setSessionKey(newKey)
  setOpenedSessions(prev => addToOpenedSessions(prev, newKey))  // ← 新增
  setPage('chat')
}, [])
```

### 5.3 handleSelectSession 同步 openedSessions

```typescript
const handleSelectSession = useCallback((key: string) => {
  setSessionKey(key)
  setOpenedSessions(prev => addToOpenedSessions(prev, key))  // ← 新增
  setPage('chat')
}, [])
```

### 5.4 openedSessions 管理辅助函数

```typescript
const MAX_OPENED_SESSIONS = 10

/** 将 newKey 加入列表；超出上限时移除最早加入的非当前会话。 */
function addToOpenedSessions(prev: string[], newKey: string): string[] {
  if (prev.includes(newKey)) return prev           // 已存在，不变
  const next = [...prev, newKey]
  if (next.length <= MAX_OPENED_SESSIONS) return next
  // 超出上限：找第一个非 newKey 的项移除（简化版：不考虑 streaming 状态）
  const removeIdx = next.findIndex(k => k !== newKey)
  if (removeIdx === -1) return next
  return next.filter((_, i) => i !== removeIdx)
}
```

> **简化说明**：上限溢出时不检测 streaming 状态（检测 streaming 需要跨组件通信，实现复杂度高，且 10 个上限在正常使用中不会触发）。

### 5.5 移除全局 streaming，改用 currentStreaming

```typescript
// 变更前
const { coreOnline, loadSettings, streaming } = useGateway()

// 变更后
const { coreOnline, loadSettings } = useGateway()
// streaming 通过 onStreamingChange 回调从活跃 Chat 获得
```

### 5.6 多 Chat 实例渲染

```tsx
{/* 变更前 */}
<Chat sessionKey={sessionKey} />

{/* 变更后 */}
{openedSessions.map(key => (
  <div key={key} style={{ display: key === sessionKey ? 'contents' : 'none' }}>
    <Chat
      sessionKey={key}
      onStreamingChange={key === sessionKey ? setCurrentStreaming : undefined}
    />
  </div>
))}
```

**注意**：当 sessionKey 切换时，新活跃会话的 `onStreamingChange` 会绑定到 `setCurrentStreaming`，但旧活跃会话的回调变为 `undefined`。这意味着：
- 旧会话如果正在 streaming，其 streaming 结束时不会再触发 `setCurrentStreaming`（可接受）
- 新会话当前的 streaming 状态应主动同步一次 → 用 `useEffect` 在 Chat 组件里监听 `onStreamingChange` prop 变化时主动通知当前状态：

```typescript
// Chat.tsx 新增（确保 App.tsx 切换时能正确同步当前 streaming 状态）
useEffect(() => {
  props.onStreamingChange?.(streaming)
}, [props.onStreamingChange])   // prop 变化时主动上报
```

### 5.7 SessionPanel 使用 currentStreaming

```tsx
<SessionPanel
  activeKey={sessionKey}
  onSelect={handleSelectSession}
  onNewChat={handleNewChat}
  disabled={currentStreaming}   // 从 currentStreaming 取，不再是全局 streaming
  streaming={currentStreaming}
/>
```

---

## 6. 数据流示意

```
用户在会话 A 发消息
  → App.tsx: sendMessage 通过 Chat A 调用
  → Core: send({type:'delta', sessionKey:'agent:main:...A...'})
  → Tauri proxy.rs: app.emit("chat-delta", payload)
  → 所有 Chat 实例的 listen('chat-delta') 都收到事件
      ├── Chat A: evt.sessionKey === 'A' → 处理 ✓
      └── Chat B: evt.sessionKey !== 'B' → return（忽略）✓

用户切换到会话 B
  → App.tsx: setSessionKey('B'), openedSessions 包含 B
  → Chat A: display:none（继续挂载，继续接收事件，state 完整保留）
  → Chat B: display:contents（显示 B 的独立 state）
```

---

## 7. 边界情况

### 7.1 旧 Core 不携带 sessionKey 的事件

部分事件 `sessionKey` 字段为 `undefined`（如 Core 版本不匹配时）。

过滤逻辑：

```typescript
// 仅当事件携带 sessionKey 且不匹配时才跳过；无 sessionKey 则照常处理（向后兼容）
if (evt.sessionKey && evt.sessionKey !== sessionKey) return
```

### 7.2 初始化时 openedSessions 与 sessionKey 同步

`openedSessions` 初始化时直接从 localStorage 读取同一个 key，确保始终包含当前 sessionKey。

### 7.3 sessionKey 不在 openedSessions 中

不应发生（由 handleSelectSession / handleNewChat 保证），防御性代码：

```typescript
// 渲染前确保 sessionKey 在列表中
const safeOpenedSessions = openedSessions.includes(sessionKey)
  ? openedSessions
  : [...openedSessions, sessionKey]
```

---

## 8. 多会话并行执行

### 8.1 已具备并发能力的层（零改动）

**Core（Node.js）**：`SessionQueue` 的注释已明确——「不同 SessionKey 完全并发」。不同 sessionKey 的 `runAttempt` 调用完全独立，互不阻塞。

**Rust proxy**：`chat_stream` 是 `async fn`，Tauri 通过 tokio 调度，多个并发调用各自持有独立的 HTTP 连接和 SSE 流循环。

### 8.2 需要修改的层：`useGateway.ts` abort 管理

**现有问题**：`abortRef` 和 `activeSessionRef` 是单值 ref，多个 Chat 实例并发调用 `sendMessage` 时，后调用的会覆盖前者的引用，导致「停止」按钮只能 abort 最后注册的那个会话。

```typescript
// 当前（有问题）：
const abortRef = useRef<(() => void) | null>(null)
const activeSessionRef = useRef<string | null>(null)
// 会话 A 设置 abortRef.current = fnA
// 会话 B 设置 abortRef.current = fnB  ← 覆盖了 fnA
// abort() 只触发 fnB，会话 A 无法停止
```

**修改方案**：改为 `Map<sessionKey, abortFn>`，按 key 独立存取。

```typescript
// 修改后：
const abortMapRef = useRef<Map<string, () => void>>(new Map())

// sendMessage 内部：
abortMapRef.current.set(sessionKey, () => { ... })

// 清理：
abortMapRef.current.delete(sessionKey)

// abort 函数签名改为接受 sessionKey：
const abort = useCallback((sk: string) => {
  abortMapRef.current.get(sk)?.()
}, [])
```

**Chat.tsx 影响**：所有 `abort()` 调用改为 `abort(sessionKey)`，共 2 处（handleSend 暂停逻辑、handleRegenerate 暂停逻辑）。

### 8.3 数据流示意（并行执行）

```
会话 A 执行 bash 工具（第 3 步）
会话 B 同时执行 read_file 工具（第 1 步）

Core:
  sessionQueue.chains['A'] → runAttempt A 运行中
  sessionQueue.chains['B'] → runAttempt B 运行中（完全独立）

Rust proxy:
  task A: chat_stream 持有 SSE 流 A，emit('chat-delta', {sessionKey:'A',...})
  task B: chat_stream 持有 SSE 流 B，emit('chat-delta', {sessionKey:'B',...})

前端:
  Chat A listen: evt.sessionKey === 'A' → 处理
  Chat B listen: evt.sessionKey === 'B' → 处理
  abortMapRef: { 'A': fnA, 'B': fnB }

用户点「停止」在会话 A:
  abort('A') → abortMapRef.get('A')() → invoke('abort_chat', {sessionKey:'A'})
  会话 B 不受影响
```
