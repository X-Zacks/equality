# Tasks: 会话切换后流式内容恢复

## Phase 1：Core 改动

- [x] 1.1 `packages/core/src/agent/runner.ts` — 在文件顶部 import 中新增 `persist` 的导入：
  ```typescript
  import { persist } from '../session/persist.js'
  ```
  （检查是否已有此 import，若已有则跳过）

- [x] 1.2 `packages/core/src/agent/runner.ts` — 在 `onToolResult?.({ ... })` 调用之后、`messages.push({ role: 'tool', ... })` 之后，新增：
  ```typescript
  // 提前持久化：确保用户切换会话再切回来时 loadHistory 能看到已完成的工具调用
  await persist(session)
  ```
  位置：`for (let tci = 0; ...)` 循环体末尾，`computeArgsHash` 之前。

- [x] 1.3 `packages/core/src/index.ts` — `GET /sessions/:key` 重构：将 `assistant+tool_calls` 消息与对应的 `tool` 结果消息合并，以 `toolCalls[]` 字段返回给前端（原来只返回 `content` 字符串，`tool_calls` 信息完全丢弃）

- [x] 1.4 `packages/desktop/src/useGateway.ts` — `SessionHistory.messages` 类型扩展 `toolCalls` 字段

- [x] 1.5 `packages/desktop/src/Chat.tsx` — `loadSession` 后映射时还原 `toolCalls` 字段，以便历史工具卡片正常渲染

## Phase 2：验证

- [ ] 2.1 场景验证：启动一个多步任务（至少 3 个工具调用），在第 2 个工具完成后切换到另一个会话，再切回来，确认前 2 个工具卡片可见
- [ ] 2.2 场景验证：abort 场景 — 执行 2 个工具后点停止，切换再切回，确认 2 个工具卡片可见
- [ ] 2.3 场景验证：pause 场景 — 执行 2 个工具后点暂停，切换再切回，确认 2 个工具卡片可见，且暂停 banner 显示
- [ ] 2.4 场景验证：任务正常完成后，loadHistory 不出现重复的工具调用消息
- [x] 2.5 typecheck 通过
