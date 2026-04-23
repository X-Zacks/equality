# Tasks: 任务暂停与重定向

## Phase 1：前端状态与逻辑

- [x] 1.1 `Chat.tsx` — 新增 `pauseIntentRef: useRef<boolean>(false)` 和 `pauseAbortRef: useRef<boolean>(false)`
- [x] 1.2 `Chat.tsx` — 新增 `paused: boolean` state
- [x] 1.3 `Chat.tsx` — `sessionKey` 变化的 useEffect 中清零 `paused` 和 `pauseIntentRef`
- [x] 1.4 `Chat.tsx` — `onToolCall` 回调中：当 `status === 'done' || status === 'error'` 且 `pauseIntentRef.current === true` 时，设置 `pauseAbortRef.current = true`，调用 `abort()`，设置 `setPaused(true)`，清零 `pauseIntentRef`
- [x] 1.5 `Chat.tsx` — `onAbort` 回调中：读取 `pauseAbortRef.current`，若为 true 走"暂停 abort"路径（**bugfix: 现在会把已产出内容保存到 messages，而非丢弃**），若为 false 走现有"停止"路径
- [x] 1.6 `Chat.tsx` — `handleSend` 支持 `paused` 状态：发送前 `setPaused(false)`

## Phase 2：UI 按钮区

- [x] 2.1 `Chat.tsx` — 输入区按钮区新增三态逻辑：
  - `streaming && !pauseIntentRef.current` → 显示「⏸ 暂停」+ 「■ 停止」
  - `streaming && pauseIntentRef.current` → 显示「⏳」(disabled) + 「■ 停止」
  - `paused` → 不显示停止，显示「↑ 发送」（输入框启用）
  - 其他 → 现有「↑ 发送」
- [x] 2.2 `Chat.tsx` — 「⏸」按钮 `onClick` 设置 `pauseIntentRef.current = true`，并触发 re-render（可用一个额外的 `setPauseIntentVis(true)` state 来驱动）
- [x] 2.3 `Chat.tsx` — 停止按钮 `onClick` 先清零 `pauseIntentRef.current`，再调用现有 `abort()`

## Phase 3：暂停横幅 + 输入框 placeholder

- [x] 3.1 `Chat.tsx` — `paused` 为 true 时在输入区上方渲染 `.pause-banner`
  - **bugfix**: 横幅文案简化为 `⏸ 已暂停 · 输入指令继续任务，或 [取消]`
- [x] 3.2 `Chat.tsx` — textarea `placeholder` 根据 `paused` 切换

## Phase 4：CSS

- [x] 4.1 `Chat.css` — 新增 `.pause-banner` 样式（橙色横幅，32px 高，左侧 2px #ff9f0a border）
- [x] 4.2 `Chat.css` — 新增 `.chat-btn-pause`（⏸，样式参考 `.chat-btn-stop`，颜色 `#ff9f0a`）
- [x] 4.3 `Chat.css` — 新增 `.chat-btn-pause-pending`（⏳，disabled 状态，opacity 0.4）

## Phase 5：验证

- [x] 5.1 场景验证：多步任务中点暂停 → 当前工具完成 → 进入 paused → 发送指令 → AI 按新方向继续
- [ ] ~~5.1 bugfix~~：暂停后已产出内容消失 → **已修复**：onAbort 暂停路径现在保存 partial text + tool calls 到 messages
- [x] 5.2 场景验证：pauseIntent 期间任务自然完成 → 不进入 paused
- [x] 5.3 场景验证：pauseIntent 期间点停止 → 普通停止，不进入 paused
- [x] 5.4 场景验证：paused 状态切换会话 → 状态清零
- [x] 5.5 typecheck 通过
