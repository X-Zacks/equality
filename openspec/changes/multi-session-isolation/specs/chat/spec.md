# Spec: 多会话隔离

## Overview

每个会话拥有独立的资源空间：独立 UI 实例、独立事件过滤、独立 streaming 状态。切换会话时内容不丢失，后台会话继续正常接收事件。

---

## Requirements

### Requirement: SSE 事件携带 sessionKey

Core 推送的每条 SSE 事件 MUST 包含 `sessionKey` 字段，值为触发该次任务的会话 key。

#### Scenario: tool_start 事件携带 sessionKey
- GIVEN 会话 A 正在执行工具调用
- WHEN Core 推送 `tool_start` 事件
- THEN 事件 payload 包含 `sessionKey` 字段，值为会话 A 的 key

#### Scenario: 所有事件类型均携带 sessionKey
- delta、tool_start、tool_update、tool_result、done、error 类型的事件 MUST ALL 包含 `sessionKey`

---

### Requirement: 前端事件按 sessionKey 隔离

每个 Chat 实例 MUST 只处理 `sessionKey` 与自身匹配的事件。

`sessionKey` 不匹配的事件 MUST 被忽略，NOT 影响当前会话的 UI 状态。

#### Scenario: 会话 B 忽略会话 A 的事件
- GIVEN 会话 A 正在执行任务，会话 B 的 Chat 实例也已挂载
- WHEN Core 推送会话 A 的 `tool_start` 事件
- THEN 会话 A 的 Chat 实例处理该事件（工具卡片出现）
- AND 会话 B 的 Chat 实例忽略该事件（界面无变化）

---

### Requirement: 多 Chat 实例 CSS 显隐

`App.tsx` MUST 为每个"已打开过"的会话保持一个 `<Chat>` 实例挂载（`display:none` 隐藏非当前会话）。

切换会话时 MUST NOT 卸载已有 Chat 实例的 React state。

已打开会话列表 MUST 包含当前活跃的 sessionKey。

#### Scenario: 切换到已打开过的会话
- GIVEN 用户已在会话 A 执行了部分任务（有工具卡片），切换到会话 B
- WHEN 用户切换回会话 A
- THEN 会话 A 的工具卡片、流式文本、streaming 状态 MUST 完整保留
- AND 切换动作 NOT 触发任何 loadSession 调用

#### Scenario: 首次切换到新会话
- GIVEN 用户从历史面板选择了一个从未打开过的会话 C
- WHEN 会话 C 的 Chat 实例首次挂载
- THEN Chat 实例调用 loadSession 从磁盘加载历史
- AND 历史消息正常显示

#### Scenario: 已打开会话数量上限
- 已打开会话列表 MUST 最多保留最近 10 个会话
- 超出上限时 MUST 移除最早加入的非当前、非 streaming 的会话

---

### Requirement: streaming 状态隔离

每个 Chat 实例 MUST 独立维护自己的 streaming 状态。

会话 A streaming 时，会话 B 的输入框 MUST NOT 显示禁用状态。

`App.tsx` 的 SessionPanel `disabled` 属性 MUST 只反映当前活跃会话的 streaming 状态。

#### Scenario: 切换到非 streaming 会话时输入框可用
- GIVEN 会话 A 正在 streaming
- WHEN 用户切换到会话 B（B 未在 streaming）
- THEN 会话 B 的输入框 MUST 可用（非禁用）
- AND 会话 A 的任务继续在后台运行

---

### Requirement: 新建会话加入已打开列表

用户新建会话时，MUST 将新 sessionKey 加入已打开会话列表。

#### Scenario: 新建会话
- GIVEN 用户点击「新建对话」
- WHEN 新 sessionKey 生成
- THEN 新 sessionKey 加入已打开列表并成为当前活跃会话
- AND 新会话的 Chat 实例以空消息列表挂载

---

### Requirement: 多会话并行执行

不同会话的任务 MUST 能同时在 Core 中并发执行，互不阻塞。

会话 A 正在执行长任务时，会话 B MUST 能独立发送消息并立即开始执行，NOT 需要等待会话 A 完成。

`abort()` MUST 只中止指定 sessionKey 的会话，NOT 影响其他正在运行的会话。

#### Scenario: 两个会话同时执行
- GIVEN 会话 A 正在执行一个多步骤工具调用任务
- WHEN 用户切换到会话 B 并发送消息
- THEN 会话 B 的任务立即开始执行（NOT 排队等待会话 A）
- AND 会话 A 的任务继续正常执行
- AND 两个会话的 SSE 事件各自只被对应的 Chat 实例接收

#### Scenario: 停止会话 A 不影响会话 B
- GIVEN 会话 A 和会话 B 同时在执行任务
- WHEN 用户在会话 A 点击「停止」
- THEN 仅会话 A 的任务中止
- AND 会话 B 的任务继续正常执行，NOT 受影响

---

## Non-Requirements（此版本不做）

- 已打开会话列表的跨重启持久化
- 会话间消息互通
- 并行会话数量上限管理（超过 N 个并发时的降级策略）
