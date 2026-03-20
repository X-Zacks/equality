# Spec: 会话切换后流式内容恢复

## Overview

当 AI 任务执行中用户切换会话再切回来时，已完成的工具调用应当可以被恢复显示。

---

## Requirements

### Requirement: tool_result 后立即持久化

每次工具调用完成（`tool_result` 事件发出后），Core runner MUST 将当前轮次的 assistant 消息（含 `tool_calls` + `tool_results`）写入 session 持久化存储。

写入操作 MUST 在推送 `tool_result` SSE 事件之后、下一轮 LLM 调用之前完成。

#### Scenario: 工具调用完成后立即写入
- GIVEN AI 正在执行 tool loop，第 N 个工具刚执行完
- WHEN `tool_result` 事件被推送给前端
- THEN Core 将 `{ role: 'assistant', tool_calls: [...], tool_results: [...] }` 写入 session
- AND 写入完成后，下一轮 LLM 调用才开始

---

### Requirement: loadHistory 可返回执行中的已完成工具调用

切换回执行中的会话时，`GET /history`（或等效的 `loadChatHistory`）MUST 返回所有已写入的工具调用消息，即便 run 尚未结束。

#### Scenario: 切换回执行中会话
- GIVEN AI 任务正在执行，已完成 3 个工具调用，第 4 个正在执行
- WHEN 用户从其他会话切换回来，前端调用 `loadChatHistory`
- THEN 响应包含已完成的 3 个工具调用的消息（工具卡片可渲染）
- AND 第 4 个工具调用（进行中）NOT 出现在历史中（未完成不写入）
- AND 任务继续执行，新的 `tool_result` 事件正常推送

---

### Requirement: 写入幂等性

同一个 `tool_call_id` 对应的消息 MUST NOT 被写入两次。

`afterTurn()` 最终写入时 MUST 检测重复，若已存在相同 `tool_call_id` 的消息则跳过或更新而非追加。

#### Scenario: afterTurn 与提前写入不产生重复
- GIVEN tool_result 后提前写入已将消息写入 session
- WHEN run 结束，`afterTurn()` 执行最终写入
- THEN session 中该工具调用消息只存在一次
- AND `loadHistory` 返回的消息列表中该工具调用 NOT 重复出现

---

### Requirement: abort/pause 场景兼容

run 被 abort 或 pause 时，已提前写入的消息 MUST 保留在 session 中（作为部分完成的历史）。

abort 后调用 `loadHistory` MUST 返回 abort 之前已写入的工具调用消息。

#### Scenario: abort 后切回会话
- GIVEN AI 执行了 2 个工具调用后被 abort
- WHEN 用户切回该会话
- THEN `loadHistory` 返回已完成的 2 个工具调用
- AND abort 的 "⏹ 已中止" 标记正常显示

---

### Requirement: 流式文本不做提前写入

正在输出的 assistant 流式文本（尚未到达 `tool_call` 或 `done`）MUST NOT 提前写入 session。

流式文本的最终写入时机保持不变（`afterTurn()` 执行时）。

#### Non-Requirement（此版本不做）

- 恢复"正在打字"中的流式文本片段
- Core 侧新增 run-events 缓冲回放接口
- 前端 keep-alive（不卸载 React state）
