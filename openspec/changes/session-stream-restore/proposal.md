# 会话切换后流式内容恢复 — 提案

## 1. 问题

当 AI 正在执行多步骤任务（tool loop）时，用户切换到另一个会话再切换回来，会看不到任务已经完成的工具卡片和之前的输出内容。

### 根本原因

工具卡片和流式文本都存在前端 React state（内存中）。切换会话时 state 被清空，重新订阅 SSE 后**历史事件不会重放**。同时，Core 的 `afterTurn()` 只在整个 run 结束后才将消息持久化，`GET /history` 查不到执行中的内容。

### 典型场景

```
用户发起任务（10 个工具调用预期）
  → tool_result 1 完成，切换到会话 B 处理另一件事
  → 切回会话 A
  → 只能看到最开始的用户消息，工具卡片全没了
  → 任务实际还在跑，但用户无法判断进度
```

### OpenClaw 的现状

OpenClaw 存在同样的问题，没有解决方案：
- `chat.history` 只返回 run 结束后写入磁盘的消息
- `chat` 命名空间仅 4 个方法：`history`、`send`、`abort`、`inject`，无任何回放接口
- `app-tool-stream.ts` 里工具卡片存在前端内存 Map 中，无持久化
- `onAgentRunStart` 中有"late-joining"逻辑（注册当前 WS 连接为工具事件接收者），但只针对**当前连接刚连上时后续的新事件**，不回放已有事件

---

## 2. 目标

用户切换会话再切回来后，能看到执行中任务**已完成的工具调用**（工具卡片 + 结果）。

### 不做什么

- ❌ 恢复"正在打字"的流式文本片段（代价大，价值低）
- ❌ Core 侧新增 run-events 缓冲回放接口（方案 A，成本高，留后续）
- ❌ 前端 keep-alive（不卸载 React state，内存/架构代价太大）

---

## 3. 方案：Core 每次 tool_result 后立即写消息（方案 C）

在 `runner.ts` 的工具调用循环里，**每次 `tool_result` 事件推送后，立即将当前 assistant 消息（含已完成的 tool_calls + tool_results）追加写入 session**。

这样，当用户切换回来时，`GET /history` 会返回所有已完成的工具轮次，前端直接渲染成工具卡片，完全恢复。

### 与现有流程的关系

现有 `afterTurn()` 逻辑（整个 run 结束后写入）**保持不变**，新增逻辑是"每轮工具调用完成后的提前写入"。两者协同：
- 提前写入：保证切换后可恢复
- `afterTurn()`：负责最终状态整理（compaction、token 统计等）

---

## 4. 技术约束

### 约束 1：不重复写

同一个 tool_call_id 对应的消息只能写入一次。若 `afterTurn()` 已经写过，提前写入必须幂等（通过 messageId 去重）。

### 约束 2：assistant 消息的格式一致性

提前写入的 assistant 消息必须与 `afterTurn()` 最终写入的格式完全兼容，避免 `loadHistory` 时出现重复或格式错误。

### 约束 3：abort/pause 场景不产生孤立消息

如果 run 被 abort 或 pause，提前写入的消息应作为 partial（已完成的部分），不影响现有的 abort 处理流程。
