# Tasks: Chat Mention Picker

## Phase 1：前端 MentionPicker 组件

- [ ] 1.1 新建 `packages/desktop/src/MentionPicker.tsx`
  - props：type / query / onSelect / onClose / anchorRef
  - 模块级 skills/tools 缓存（fetch 一次）
  - useMemo 过滤 + 键盘高亮逻辑
  - 空结果提示

- [ ] 1.2 新建 `packages/desktop/src/MentionPicker.css`
  - 浮层定位（bottom: 100%）
  - 列表项样式 + highlighted 状态
  - 滚动容器

## Phase 2：Chat.tsx 接入

- [ ] 2.1 新增状态：`mentionState`、`skillTag`、`toolTags`

- [ ] 2.2 onChange 中调用 `detectMention()` 实时检测触发词

- [ ] 2.3 onKeyDown 中：当 `mentionState` 非 null 时，转发 ↑↓Enter/Escape 给 MentionPicker

- [ ] 2.4 `onSelect` 回调：
  - skill：设置 `skillTag`，从 input 删除 `@query`
  - tool：追加 `toolTags`，从 input 删除 `#query`

- [ ] 2.5 chip UI：在 `chat-attachments` 区域渲染 skillTag chip 和 toolTag chips，支持 ✕ 删除

- [ ] 2.6 `handleSend` 修改：构建前缀并拼入 `finalText`，发送后清空 skillTag/toolTags

- [ ] 2.7 在 textarea 上方渲染 `<MentionPicker>` 浮层（条件渲染：`mentionState !== null`）

## Phase 3：后端接入

- [ ] 3.1 `runner.ts`：`runAttempt` 增加 `allowedTools?: string[]` 参数，过滤 toolRegistry

- [ ] 3.2 `system-prompt.ts`：`SystemPromptOptions` 增加 `activeSkill?: Skill`，注入高优先级块

- [ ] 3.3 `index.ts`：`/chat/stream` 处理时提取消息开头的 `[@xxx]` 和 `[#xxx]` 标记，传给 runner

## Phase 4：验收测试

- [ ] 4.1 手动测试：输入 `@` 弹出列表，选中，消息带正确前缀
- [ ] 4.2 手动测试：输入 `#` 弹出列表，选多个工具，消息带 `[#tool1,#tool2]`
- [ ] 4.3 键盘测试：↑↓Enter Escape 全部正常
- [ ] 4.4 发送后验证 Agent 确实优先使用指定 Skill
- [ ] 4.5 发送后验证 Agent 确实只调用指定工具（查看工具调用卡片）
- [ ] 4.6 IME 输入法下 mention 不误触发
- [ ] 4.7 TypeScript 无类型错误（`pnpm typecheck`）
