# Tasks: Chat Mention Picker

## Phase 1：前端 MentionPicker 组件

- [x] 1.1 新建 `packages/desktop/src/MentionPicker.tsx`
  - props：type / query / onSelect / onClose
  - 模块级 skills/tools 缓存（fetch 一次）
  - useMemo 过滤 + 键盘高亮逻辑（window keydown capture）
  - 空结果提示

- [x] 1.2 新建 `packages/desktop/src/MentionPicker.css`
  - 浮层定位（bottom: 100%）
  - 列表项样式 + highlighted 状态
  - mention chip 样式（skill=绿色，tool=橙色）

## Phase 2：Chat.tsx 接入

- [x] 2.1 新增状态：`mentionState`、`skillTag`、`toolTags`

- [x] 2.2 `handleInputChange` 中调用 `detectMention()` 实时检测触发词

- [x] 2.3 onKeyDown 中：当 `mentionState` 非 null 时，拦截 ↑↓Enter/Escape（MentionPicker 通过 window capture 处理）

- [x] 2.4 `handleMentionSelect` 回调：
  - skill：设置 `skillTag`，从 input 删除 `@query`
  - tool：追加 `toolTags`，从 input 删除 `#query`

- [x] 2.5 chip UI：在 `chat-attachments` 区域渲染 skillTag chip（绿色）和 toolTag chips（橙色），支持 ✕ 删除

- [x] 2.6 `handleSend` 修改：构建前缀 `[@skill] [#tool1,#tool2]` 并拼入 `finalText`，发送后清空标签

- [x] 2.7 在 chat-input-area 中渲染 `<MentionPicker>` 浮层（条件渲染：`mentionState !== null`）

## Phase 3：后端接入

- [x] 3.1 `runner.ts`：`RunAttemptParams` 增加 `allowedTools?: string[]`，过滤 toolRegistry（Set 白名单）

- [x] 3.2 `system-prompt.ts`：`SystemPromptOptions` 增加 `activeSkill?: Skill`，注入"🎯 用户指定 Skill"高优先级块

- [x] 3.3 `context/types.ts`：`AssembleParams` 增加 `activeSkill?: Skill`

- [x] 3.4 `context/default-engine.ts`：将 `activeSkill` 传给 `buildSystemPrompt`

- [x] 3.5 `index.ts`：`/chat/stream` 处理时用正则提取 `[@xxx]` 和 `[#xxx]` 标记，传给 `runAttempt`

- [x] 3.6 `runner.ts`：从 `AssembleParams` 透传 `activeSkill`（通过 find skills）

## Phase 4：验收测试

- [ ] 4.1 手动测试：输入 `@` 弹出列表，选中，消息带正确前缀
- [ ] 4.2 手动测试：输入 `#` 弹出列表，选多个工具，消息带 `[#tool1,#tool2]`
- [ ] 4.3 键盘测试：↑↓Enter Escape 全部正常
- [ ] 4.4 发送后验证 Agent 确实优先使用指定 Skill
- [ ] 4.5 发送后验证 Agent 确实只调用指定工具（查看工具调用卡片）
- [ ] 4.6 IME 输入法下 mention 不误触发
- [ ] 4.7 TypeScript 无类型错误（core 包零错误，desktop 仅存在原有 Settings.tsx 问题）
