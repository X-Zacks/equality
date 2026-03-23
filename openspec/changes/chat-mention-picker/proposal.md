# Proposal: Chat Mention Picker（@ Skill / # Tool 快速选取）

## 背景与问题

当前聊天输入框只有自由文本输入，用户如果想要 Agent 使用某个特定 Skill 或限制在某组工具中执行任务，只能通过自然语言描述来引导，无法精确控制。这带来两个痛点：

### 问题 1：Skill 路由依赖 Agent 自主判断

Agent 靠语义匹配决定调用哪个 Skill，用户没有显式入口可以指定 "就用这个 Skill"。对于新用户来说，不知道有哪些 Skill 可以用，也不知道如何触发。

### 问题 2：工具集无法用户侧快速收敛

某些任务用户只想让 Agent 用特定工具（如只允许用 `read_file` + `grep` 做代码查找，不允许 `bash` 执行）。目前没有任何 UI 支持这种临时工具集约束。

---

## 目标

1. 在聊天输入框支持 `@` 触发 **Skill 选取菜单**，选中后将 Skill 名称注入消息前缀，Agent 收到后优先按该 Skill 执行
2. 在聊天输入框支持 `#` 触发 **Tool 选取菜单**，选中后将工具约束注入消息前缀，Agent 收到后仅使用指定工具集

---

## 用户故事

**US-1 Skill 快速调用**
> 作为用户，我想在输入 `@` 后看到可用 Skill 的下拉列表，选择后在消息中标记使用该 Skill，让 Agent 优先按此 Skill 的指导执行。

**US-2 Tool 快速限制**
> 作为用户，我想在输入 `#` 后看到可用 Tool 的下拉列表，可以勾选多个工具，约束 Agent 本次只使用这些工具。

**US-3 键盘友好操作**
> 作为用户，我希望用方向键导航菜单、Enter 选中、Escape 关闭，不需要鼠标。

**US-4 消息前缀注入**
> 选择后消息应自动带上标记前缀（如 `[@openspec-skill]` 或 `[#bash,#write_file]`），Agent 在 system-prompt 中读取这些标记并做相应处理。

---

## 方案概述

### 前端（packages/desktop）

1. **MentionPicker 组件**：浮层菜单，显示在输入框正上方，支持键盘导航
2. **触发检测**：在 `onChange` 事件中检测最后一个未完成的 `@` 或 `#`，实时过滤列表
3. **数据源**：
   - `@` —— fetch `/skills` 接口（已有），返回 `{ name, description }[]`
   - `#` —— fetch `/tools/schemas` 接口（已有），返回工具 schema 列表
4. **注入方式**：选中后替换输入框中的 `@xxx` 触发词，同时在消息文本中插入前缀 tag
5. **多选支持**（`#` 工具）：可连续选多个工具，每个 `#tag` 单独注入

### 后端（packages/core）

1. **system-prompt.ts 扩展**：在 buildSystemPrompt 中解析消息开头的 `[@skill-name]` 和 `[#tool1,#tool2]` 标记，分别将指定 Skill 优先注入 context、并将工具集限制到指定列表
2. **runner.ts 工具集过滤**：支持接收一个可选的 `allowedTools` 参数，从 `ToolRegistry` 中只暴露指定工具给 LLM

---

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| MentionPicker 组件 | `packages/desktop/src/MentionPicker.tsx` | 新增 |
| MentionPicker 样式 | `packages/desktop/src/MentionPicker.css` | 新增 |
| Chat.tsx 接入 picker | `packages/desktop/src/Chat.tsx` | 中等修改 |
| system-prompt 解析标记 | `packages/core/src/agent/system-prompt.ts` | 小修改 |
| runner 工具集过滤 | `packages/core/src/agent/runner.ts` | 中等修改 |
| chat/stream 接口 | `packages/core/src/index.ts` | 小修改（透传 allowedTools） |

---

## 不在本次范围内

- Skill 的"始终激活"切换（在 Settings 里已有）
- 多个 Skill 同时 @ 指定（暂时只支持一个）
- 工具白名单持久化保存（仅本次消息有效）
- @ 用户名 / @ 其他实体（保留语义空间，不冲突）
