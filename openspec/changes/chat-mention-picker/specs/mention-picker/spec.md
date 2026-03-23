# Spec: MentionPicker 组件行为规范

## 1. 触发条件

### 1.1 @ 触发（Skill Picker）

| 条件 | 行为 |
|------|------|
| 用户在输入框中输入 `@` | 立即展示 Skill 菜单，显示全部 Skill |
| 继续输入字母（如 `@ops`）| 实时过滤：name 或 description 包含输入词的 Skill |
| 输入空格或 Backspace 删掉 `@` | 关闭菜单 |
| 已有选中的 `[@skill-name]` tag 时再按 `@` | 替换已有 tag（一次只能激活一个 Skill） |

### 1.2 # 触发（Tool Picker）

| 条件 | 行为 |
|------|------|
| 用户在输入框中输入 `#` | 立即展示 Tool 菜单，显示全部工具 |
| 继续输入字母（如 `#bas`）| 实时过滤：tool name 包含输入词 |
| 选中一个工具 | 插入 `#tool-name` chip，菜单继续保持，可再次 `#` 追加 |
| 输入空格或 Backspace 删掉 `#` | 关闭菜单 |

---

## 2. 菜单 UI 规范

### 2.1 位置与尺寸

- 浮层显示在**输入框正上方**，右对齐或跟随光标水平位置
- 最大高度 280px，超出滚动
- 宽度 300px（固定）

### 2.2 列表项

**Skill 列表项**：
```
[emoji或🧩] skill-name
   description 的前 60 字符（截断 + ...）
```

**Tool 列表项**：
```
[工具 emoji] tool-name
   description 前 50 字符
```

### 2.3 键盘操作

| 按键 | 行为 |
|------|------|
| `↓` / `↑` | 移动高亮选项 |
| `Enter` | 确认选中当前高亮项 |
| `Tab` | 同 Enter |
| `Escape` | 关闭菜单，不插入 |
| 任意字母 | 继续过滤，不关闭 |

### 2.4 空结果

过滤后无匹配时显示：`没有匹配的 Skill / 工具`（一行灰色提示）

---

## 3. 消息注入格式

### 3.1 @ Skill 注入

在消息**最前方**插入：
```
[@skill-name] 用户的其余消息...
```

输入框中显示为 pill chip（类似 attachment tag 的视觉效果），chip 有删除按钮，点删除移除 skill 约束。

### 3.2 # Tool 注入

在消息**最前方**插入：
```
[#tool1,#tool2] 用户的其余消息...
```

多个工具合并进同一个方括号，用逗号分隔。同样显示为可删除 chip。

---

## 4. 后端解析规范

### 4.1 Skill 标记解析（system-prompt.ts）

`buildSystemPrompt` 接收 `activeSkillHint?: string`（从 runner 传入）：

- Runner 在收到用户消息时，从消息文本开头提取 `[@xxx]` 模式
- 若匹配到，从 skillsWatcher 中找对应 Skill
- 将该 Skill 的完整 body 注入 system-prompt 的最前部（高优先级，在普通 skills 列表之上）
- 原始消息中的 `[@xxx]` 标记在传给 LLM 前**保留**（让 LLM 知道用户的显式意图）

### 4.2 Tool 标记解析（runner.ts）

- Runner 从消息开头提取 `[#tool1,#tool2,...]` 模式
- 提取工具名列表，传给 `runAttempt(allowedTools: string[])`
- `runAttempt` 内部：若 `allowedTools` 非空，从 `toolRegistry` 只取指定工具传给 LLM
- 原始消息中的 `[#...]` 标记在传给 LLM 前**保留**

### 4.3 正则模式

```
Skill 标记：/^\[@([a-zA-Z0-9_-]+)\]\s*/
Tool 标记：/^\[#([a-zA-Z0-9_,#-]+)\]\s*/  → 拆分逗号，去掉 # 前缀
```

两个标记可共存，顺序不限：`[@openspec-skill] [#bash,#write_file] 帮我做个项目`

---

## 5. 接口契约

### 5.1 GET /skills

已有，返回：
```json
[
  { "name": "string", "description": "string", "source": "string", "filePath": "string" }
]
```

MentionPicker 使用 `name` + `description`，首次打开时加载并缓存（本次 session 内）。

### 5.2 GET /tools/schemas

已有，返回带完整参数的 schema。MentionPicker 只取 `name` + `description`。

---

## 6. 验收标准

- [ ] 输入 `@` 后 100ms 内弹出 Skill 菜单
- [ ] 输入 `#` 后 100ms 内弹出 Tool 菜单
- [ ] 键盘 ↑↓Enter/Escape 正常工作
- [ ] 选中 Skill 后消息开头含 `[@skill-name]`
- [ ] 选中工具后消息开头含 `[#tool-name]`（多选合并）
- [ ] chip 可点 ✕ 删除，删除后标记从消息中移除
- [ ] 发送后 Agent 确实优先按指定 Skill 执行
- [ ] 发送后 Agent 确实只调用指定工具
