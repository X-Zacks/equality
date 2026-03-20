# 多会话隔离 — 提案

## 1. 问题

切换会话时，正在执行的任务内容（流式文本、工具卡片）会丢失。根本原因是**会话之间没有隔离**，所有资源（React state、SSE 事件、streaming 状态）都是全局共享的。

### 问题根源层次

```
层次 1：UI state 未隔离
  → Chat 是单实例，sessionKey 变化时 state 被 loadSession 覆盖
  → 前次会话的 messages、activeToolCalls、streamingText 全部丢失

层次 2：SSE 事件未携带 sessionKey
  → Core send() 不带 sessionKey 字段
  → proxy.rs 全局 app.emit("chat-delta", val)
  → useGateway listen() 不过滤 sessionKey
  → 会话 A 的 delta 事件会被会话 B 的监听器处理

层次 3：streaming 状态未隔离
  → useGateway 里 streaming 是单一全局 boolean
  → 会话 A 在跑时，会话 B 的输入框也显示"运行中"状态被禁用
```

### 典型失效场景

```
会话 A 执行 10 步任务，完成第 3 步
  → 用户切到会话 B 发一条消息
  → 会话 B 收到会话 A 的工具事件（界面显示错误内容）
  → 用户切回会话 A，内容全部丢失
```

---

## 2. 目标

每个打开过的会话拥有**独立的资源空间**：
- 独立的 React 组件实例（独立 state）
- 独立的 SSE 事件过滤（只处理自己的事件）
- 独立的 streaming 状态（互不影响）
- 切换会话不触发数据清空，隐藏的会话继续在后台接收事件

---

## 3. 方案概述

### Step 1：Core SSE 事件携带 sessionKey

每条 SSE 事件加上 `sessionKey` 字段：
```json
{ "type": "tool_start", "name": "bash", "toolCallId": "...", "sessionKey": "agent:main:..." }
```

### Step 2：前端多 Chat 实例 + CSS 显隐

`App.tsx` 维护"已打开会话列表"，为每个会话保持一个 `<Chat>` 实例挂载，当前会话显示，其余 `display:none`：

```tsx
openedSessions.map(key => (
  <div key={key} style={{ display: key === currentKey ? 'contents' : 'none' }}>
    <Chat sessionKey={key} />
  </div>
))
```

### Step 3：useGateway 按 sessionKey 过滤事件

每个 Chat 实例持有自己的 sessionKey，listen 回调里过滤：
```typescript
if (evt.sessionKey && evt.sessionKey !== sessionKey) return
```

### Step 4：streaming 状态下沉到 Chat 组件

`useGateway` 不再暴露全局 `streaming`，每个 Chat 实例自己管理 `streaming` state。`App.tsx` 通过回调或 context 获取当前会话的 streaming 状态（用于 SessionPanel 禁用控制）。

---

## 4. 不做什么

- ❌ 多会话并行执行（用户同时跑多个会话的 AI 任务）— 允许，但不主动设计
- ❌ 会话间通信
- ❌ 持久化"已打开会话列表"（重启后只恢复当前会话）

---

## 5. 与现有功能的兼容

- 暂停/重定向（task-pause-and-redirect）：每个 Chat 实例独立维护 `paused` 状态，无影响
- 会话恢复（session-stream-restore）：多实例天然解决了切换后恢复的问题，`sessionSnapshotCache` 临时方案可以移除
- SessionPanel 禁用逻辑：改为只禁用"当前活跃会话正在 streaming"，不影响切换到其他会话
