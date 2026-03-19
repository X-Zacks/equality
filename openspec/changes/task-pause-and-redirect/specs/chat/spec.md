# Spec: 任务暂停与重定向

## Overview

在 AI 多步任务执行期间，用户可以按下「暂停」按钮，使系统在当前工具调用完成后暂停、等待用户输入新的指令，然后以调整后的方向继续执行，而不是从头重来。

---

## Requirements

### Requirement: 暂停按钮

当 AI 正在执行任务（`streaming === true`）时，系统 MUST 在输入区显示「暂停」按钮（⏸）。

系统 MUST 在非 streaming 状态下隐藏「暂停」按钮。

#### Scenario: 用户在任务执行中点击暂停
- GIVEN AI 正在 streaming（tool loop 进行中）
- WHEN 用户点击「⏸ 暂停」按钮
- THEN 系统设置 `pauseIntent = true`
- AND 「暂停」按钮变为 disabled 状态，显示 `⏳`，tooltip 为「等待当前工具完成后暂停」
- AND 「停止」按钮仍然可用

---

### Requirement: 工具边界暂停

系统 MUST 在下一个 `tool_result` 事件到达时，检测 `pauseIntent`，若为 true 则触发暂停。

系统 MUST NOT 在工具执行过程中强制中断工具（暂停只在工具完成后生效）。

#### Scenario: tool_result 到达时触发暂停
- GIVEN `pauseIntent === true`，AI 正在 tool loop 中
- WHEN 任意一个 `tool_result` 事件到达（无论 isError 为 true/false）
- THEN 系统调用 `abort()`，触发 `POST /chat/abort`
- AND Core 的 runner 在下一轮 LLM 发起前检测到 AbortSignal，退出 tool loop
- AND 系统进入 `paused` 状态（`paused = true`, `streaming = false`）
- AND 已完成的工具调用记录保留在当前消息气泡中（不追加「⏹ 已中止」标记）
- AND `pauseIntent` 清零

#### Scenario: 暂停意图等待中任务自然完成
- GIVEN `pauseIntent === true`，AI 正在 streaming
- WHEN `done` 事件到达（任务自然完成，没有更多 tool 调用）
- THEN 系统正常完成任务（写入消息列表）
- AND `pauseIntent` 清零
- AND 系统 NOT 进入 `paused` 状态

---

### Requirement: 暂停状态 UI

当 `paused === true` 时，系统 MUST 在输入区上方显示暂停横幅。

暂停横幅 MUST 包含：
- 已暂停的视觉指示（⏸ 图标）
- 已完成的工具调用数量
- 「取消」按钮

`paused` 状态下，输入框 MUST 保持可用（placeholder 改为「输入指令继续任务，或直接描述下一步…」）。

`paused` 状态下，发送按钮 MUST 正常显示（↑）。

#### Scenario: 暂停状态下输入区外观
- GIVEN `paused === true`
- THEN 输入区上方显示橙色横幅：「⏸ 已暂停 · 已完成 N 个工具调用」
- AND 横幅右侧有「取消」按钮
- AND 输入框 placeholder 为「输入指令继续任务，或直接描述下一步…」
- AND textarea NOT disabled
- AND 发送按钮（↑）可用

---

### Requirement: 重定向消息发送

在 `paused` 状态下，用户输入指令并发送，系统 MUST 将该消息作为新的 `user` 消息发送给 Core，复用同一 `sessionKey`。

系统 MUST 在发送前清除 `paused` 状态。

#### Scenario: 用户在暂停后发送重定向指令
- GIVEN `paused === true`，用户输入了「换用 Vue 3 继续」
- WHEN 用户点击发送（或按 Enter）
- THEN `paused` 设为 false
- AND 消息追加到 UI 消息列表（role: user）
- AND `POST /chat/stream` 以原 `sessionKey` 发起新请求，message 为用户的重定向指令
- AND Core 拿到完整 session 历史（含已执行工具的 call + result）按新方向继续
- AND 系统回到 `streaming = true` 状态

---

### Requirement: 取消暂停

用户点击「取消」按钮，系统 MUST 清除 `paused` 状态，回到普通空闲状态。

#### Scenario: 用户取消暂停
- GIVEN `paused === true`
- WHEN 用户点击横幅上的「取消」按钮
- THEN `paused` 设为 false
- AND 输入区恢复普通样式（placeholder 还原，横幅消失）
- AND 用户仍可继续发送新消息（完全独立的新对话轮次）

---

### Requirement: 停止按钮不受影响

「停止」按钮（■）在 streaming 时 MUST 始终可用，无论 `pauseIntent` 是否为 true。

「停止」按钮的行为 MUST 与现有一致：立即 abort，追加「⏹ 已中止」，清空工具卡片。

#### Scenario: pauseIntent 等待中用户改为停止
- GIVEN `pauseIntent === true`，AI 正在运行
- WHEN 用户点击「■ 停止」
- THEN `pauseIntent` 清零
- AND 现有 abort 流程执行（追加「⏹ 已中止」，清空工具卡片）
- AND NOT 进入 `paused` 状态

---

### Requirement: 会话切换时清理状态

切换到其他 session 时，系统 MUST 清除 `paused` 和 `pauseIntent`。

#### Scenario: 暂停状态下切换会话
- GIVEN `paused === true`
- WHEN `sessionKey` 变化（用户切换会话）
- THEN `paused` 清零
- AND `pauseIntentRef.current` 清零
- AND UI 回到普通空闲状态

---

## Non-Requirements（此版本不做）

- 每次工具调用前的审批弹窗（更细粒度的"逐步确认"模式）
- 编辑 AI 已生成的工具调用参数
- 暂停后的"回滚"（撤销某个工具的执行结果）
- Core 侧新增"暂停点"API
- 纯文本回复中的暂停（暂停只在工具边界生效）
