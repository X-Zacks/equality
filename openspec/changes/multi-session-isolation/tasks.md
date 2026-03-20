# 多会话隔离 — 实施任务清单

## 阶段划分

```
Phase 1: Core  — 1 任务  — 改 send() lambda，1 行
Phase 2: useGateway  — 3 任务  — 类型、回调、移除全局 streaming
Phase 3: Chat.tsx    — 4 任务  — props、本地 streaming、过滤、移除 snapshot
Phase 4: App.tsx     — 4 任务  — openedSessions、多实例渲染、streaming 回调
Phase 5: 并行执行 — 2 任务  — abortMapRef、abort(sessionKey) 签名
Phase 6: 验证        — 手动场景测试
```

---

## Phase 1：Core 注入 sessionKey

### Task 1.1：`send()` 自动注入 sessionKey

**文件**：`packages/core/src/index.ts`  
**位置**：`/chat/stream` 路由内，`const send = ...` 这一行（line ~180）

**变更**：

```typescript
// 变更前
const send = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`)

// 变更后
const send = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify({ ...obj as object, sessionKey })}\n\n`)
```

**验收**：发送消息后，浏览器开发工具或 Tauri 日志中，`chat-delta` 事件的 payload 均包含 `sessionKey` 字段。

- [ ] 1.1 修改 `packages/core/src/index.ts` 中 `send()` lambda

---

## Phase 2：useGateway 适配

### Task 2.1：DeltaEvent 类型增加 sessionKey

**文件**：`packages/desktop/src/useGateway.ts`  
**位置**：`interface DeltaEvent {}` 块（line ~27）

**变更**：在 `type` 字段后增加 `sessionKey?: string` 字段。

- [ ] 2.1 `DeltaEvent` 增加 `sessionKey?: string` 字段

---

### Task 2.2：sendMessage 新增 onStreamingChange 参数

**文件**：`packages/desktop/src/useGateway.ts`

**变更**：
1. `sendMessage` 参数列表末尾追加 `onStreamingChange?: (streaming: boolean) => void`
2. 函数体内所有 `setStreaming(true)` → `onStreamingChange?.(true)`
3. 函数体内所有 `setStreaming(false)` → `onStreamingChange?.(false)`

共 4 处 `setStreaming` 调用（lines 79、89、135、140、153）全部替换。

**注意**：参数追加在末尾，现有调用方不需要修改（向后兼容）。

- [ ] 2.2 `sendMessage` 新增 `onStreamingChange` 参数，替换所有 `setStreaming` 调用

---

### Task 2.3：移除全局 streaming state 及其导出

**文件**：`packages/desktop/src/useGateway.ts`

**变更**：
1. 删除 `const [streaming, setStreaming] = useState(false)`（line ~51）
2. 从 `return { ... }` 中删除 `streaming` 字段（line ~244）

**验收**：TypeScript 不报错（`setStreaming` 已在 2.2 中全部替换）。

- [ ] 2.3 删除 `useGateway` 中 `streaming` state 及其 return

---

## Phase 3：Chat.tsx 适配

### Task 3.1：新增本地 streaming state + onStreamingChange prop

**文件**：`packages/desktop/src/Chat.tsx`

**变更**：
1. `ChatProps` 增加 `onStreamingChange?: (streaming: boolean) => void`
2. 组件内新增 `const [streaming, setStreaming] = useState(false)`
3. 从 `useGateway()` 解构中移除 `streaming`（仅移除，不影响其他解构项）

- [ ] 3.1 `Chat.tsx` 新增本地 streaming state 和 prop

---

### Task 3.2：将 streaming 变化同步给 App.tsx

**文件**：`packages/desktop/src/Chat.tsx`

**变更**：新增 useEffect，当 `streaming` 或 `onStreamingChange` 变化时通知外层。

```typescript
// 变化时主动上报（prop 重新绑定时也立即同步当前值）
useEffect(() => {
  onStreamingChange?.(streaming)
}, [streaming, onStreamingChange])
```

- [ ] 3.2 新增 useEffect 上报 streaming 状态

---

### Task 3.3：sendMessage 调用传入 onStreamingChange

**文件**：`packages/desktop/src/Chat.tsx`

**变更**：找到 `sendMessage(...)` 的调用点，在参数末尾追加：

```typescript
(s) => setStreaming(s),
```

- [ ] 3.3 `sendMessage` 调用传入 streaming 回调

---

### Task 3.4：移除 sessionSnapshotCache

**文件**：`packages/desktop/src/Chat.tsx`

**需删除的内容**：

1. `SessionSnapshot` 类型定义（约 lines 64–77）
2. `const sessionSnapshotCache = new Map<string, SessionSnapshot>()`（line ~78）
3. sessionKey `useEffect` 内"保存快照"代码段（约 lines 101–112）
4. sessionKey `useEffect` 内"恢复快照"代码段（约 lines 113–122）
5. done 回调中的 `sessionSnapshotCache.delete(sessionKey)`
6. error 回调中的 `sessionSnapshotCache.delete(sessionKey)`

**验收**：`sessionSnapshotCache` 符号全部消除，TypeScript 无报错。

- [ ] 3.4 删除 `sessionSnapshotCache` 相关代码

---

## Phase 4：App.tsx 多实例渲染

### Task 4.1：新增 openedSessions state 及辅助函数

**文件**：`packages/desktop/src/App.tsx`

**变更**：

```typescript
const MAX_OPENED_SESSIONS = 10

function addToOpenedSessions(prev: string[], newKey: string): string[] {
  if (prev.includes(newKey)) return prev
  const next = [...prev, newKey]
  if (next.length <= MAX_OPENED_SESSIONS) return next
  const removeIdx = next.findIndex(k => k !== newKey)
  return removeIdx === -1 ? next : next.filter((_, i) => i !== removeIdx)
}

// App() 组件内：
const [openedSessions, setOpenedSessions] = useState<string[]>(() => {
  const initial = localStorage.getItem('equality-session-key') || newSessionKey()
  return [initial]
})
const [currentStreaming, setCurrentStreaming] = useState(false)
```

- [ ] 4.1 新增 `openedSessions` state、`currentStreaming` state、`addToOpenedSessions` 函数

---

### Task 4.2：handleNewChat / handleSelectSession 同步 openedSessions

**文件**：`packages/desktop/src/App.tsx`

**变更**：

```typescript
const handleNewChat = useCallback(() => {
  const newKey = newSessionKey()
  setSessionKey(newKey)
  setOpenedSessions(prev => addToOpenedSessions(prev, newKey))  // ← 新增
  setPage('chat')
}, [])

const handleSelectSession = useCallback((key: string) => {
  setSessionKey(key)
  setOpenedSessions(prev => addToOpenedSessions(prev, key))     // ← 新增
  setPage('chat')
}, [])
```

- [ ] 4.2 `handleNewChat` / `handleSelectSession` 调用 `addToOpenedSessions`

---

### Task 4.3：移除全局 streaming，改用 currentStreaming

**文件**：`packages/desktop/src/App.tsx`

**变更**：

```typescript
// 变更前
const { coreOnline, loadSettings, streaming } = useGateway()

// 变更后
const { coreOnline, loadSettings } = useGateway()
```

SessionPanel 的 `disabled` 和 `streaming` 属性改用 `currentStreaming`（4.4 一并处理）。

- [ ] 4.3 `useGateway()` 解构移除 `streaming`

---

### Task 4.4：多 Chat 实例渲染

**文件**：`packages/desktop/src/App.tsx`

**变更**：将 `<Chat sessionKey={sessionKey} />` 替换为多实例渲染：

```tsx
{openedSessions.map(key => (
  <div key={key} style={{ display: key === sessionKey ? 'contents' : 'none' }}>
    <Chat
      sessionKey={key}
      onStreamingChange={key === sessionKey ? setCurrentStreaming : undefined}
    />
  </div>
))}
```

同时更新 SessionPanel：

```tsx
<SessionPanel
  activeKey={sessionKey}
  onSelect={handleSelectSession}
  onNewChat={handleNewChat}
  disabled={currentStreaming}
  streaming={currentStreaming}
/>
```

- [ ] 4.4 替换为多 Chat 实例渲染，更新 SessionPanel 使用 `currentStreaming`

---

## Phase 5：并行执行——abort 管理改造

> Core 和 Rust 层已具备并发能力，仅需修改前端 abort 管理。

### Task 5.1：`useGateway` 的 abortRef 改为 Map

**文件**：`packages/desktop/src/useGateway.ts`

**变更**：

```typescript
// 变更前
const abortRef = useRef<(() => void) | null>(null)
const activeSessionRef = useRef<string | null>(null)

// 变更后
const abortMapRef = useRef<Map<string, () => void>>(new Map())
```

`sendMessage` 内部：
- `abortRef.current = () => {...}` → `abortMapRef.current.set(sessionKey ?? '', () => {...})`
- `abortRef.current = null` → `abortMapRef.current.delete(sessionKey ?? '')`
- `activeSessionRef.current` 的读取内联到 abort fn 内部（直接闭包 `sessionKey` 变量，不再需要 activeSessionRef）

- [ ] 5.1 `abortRef` / `activeSessionRef` 改为 `abortMapRef`

---

### Task 5.2：`abort` 函数签名改为接受 sessionKey

**文件**：`packages/desktop/src/useGateway.ts` + `packages/desktop/src/Chat.tsx`

**useGateway.ts 变更**：

```typescript
// 变更前
const abort = useCallback(() => {
  abortRef.current?.()
}, [])

// 变更后
const abort = useCallback((sk: string) => {
  abortMapRef.current.get(sk)?.()
}, [])
```

**Chat.tsx 变更**：所有 `abort()` 调用改为 `abort(sessionKey)`，共 2 处：
1. `handleSend` 中的暂停逻辑：`abort()` → `abort(sessionKey)`
2. `handleRegenerate` 中的暂停逻辑：`abort()` → `abort(sessionKey)`

- [ ] 5.2 `abort` 函数签名改为接受 `sessionKey`，Chat.tsx 调用处同步更新

---

## Phase 6：验证场景

> 手动测试，按场景逐一确认。

### 场景 6.1：单会话正常流程不退化
- [ ] 发送消息 → 流式文本正常显示 → 工具卡片正常显示 → 完成后状态正确

### 场景 6.2：会话 A 执行中切换到会话 B
- [ ] 会话 A 执行长任务（如 bash 工具），任务进行中切换到会话 B
- [ ] 会话 B 输入框可用（不显示禁用状态）
- [ ] 会话 B 不显示会话 A 的工具卡片
- [ ] 会话 A 的任务在后台继续执行（Core 未中断）

### 场景 6.3：切回会话 A 后内容完整
- [ ] 从会话 B 切回会话 A
- [ ] 会话 A 的流式文本/工具卡片完整保留（如任务仍在进行，继续显示）
- [ ] 未触发多余的 loadSession 调用

### 场景 6.4：会话 A 完成后切换再切回
- [ ] 会话 A 任务完成（done 事件），切换到 B 再切回 A
- [ ] 会话 A 的历史消息完整显示
- [ ] streaming = false，输入框可用

### 场景 6.5：新建会话加入列表
- [ ] 点击「新建对话」，新 sessionKey 成为当前活跃会话
- [ ] 新会话 Chat 实例以空消息列表挂载

### 场景 6.6：停止会话 A 不影响会话 B（并行执行）
- [ ] 会话 A 和会话 B 同时执行任务
- [ ] 在会话 A 点击「停止」
- [ ] 仅会话 A 的任务中止，会话 B 继续正常执行

### 场景 6.7：两个会话同时执行互不干扰（并行执行）
- [ ] 会话 A 执行长任务，切到会话 B 发送新消息
- [ ] 会话 B 立即开始执行（不排队等待 A）
- [ ] 展开两个会话的工具卡片各自正确无混淆

---

## 变更文件汇总

| 文件 | 变更性质 | 任务 |
|------|---------|------|
| `packages/core/src/index.ts` | 1 行修改 | 1.1 |
| `packages/desktop/src/useGateway.ts` | 类型 + 回调 + 移除 state + abortMapRef | 2.1–2.3, 5.1–5.2 |
| `packages/desktop/src/Chat.tsx` | 新增 prop + state + 删除 snapshot + abort(key) | 3.1–3.4, 5.2 |
| `packages/desktop/src/App.tsx` | 多实例渲染 + openedSessions | 4.1–4.4 |
