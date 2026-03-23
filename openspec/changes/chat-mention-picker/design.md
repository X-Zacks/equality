# Design: Chat Mention Picker 技术设计

## 架构概览

```
用户输入 @/# → Chat.tsx 检测触发词
                    ↓
              MentionPicker.tsx（浮层）
              ├── 数据：GET /skills 或 GET /tools/schemas
              ├── 过滤：useMemo 实时过滤
              └── 选中 → 回调 onSelect(tag)
                    ↓
              Chat.tsx 更新 input 状态
              ├── 替换触发词为 chip（视觉）
              └── 实际消息文本含 [@xxx] / [#xxx]
                    ↓
              handleSend → 消息带标记发出
                    ↓
              Core index.ts → 提取标记 → runner.ts
              ├── Skill 标记 → 高优先级注入 system-prompt
              └── Tool 标记 → allowedTools 过滤 toolRegistry
```

---

## 组件设计

### MentionPicker.tsx

```tsx
interface MentionPickerProps {
  type: 'skill' | 'tool'
  query: string                    // @ 或 # 后输入的过滤词
  onSelect: (name: string) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLTextAreaElement>
}
```

**内部状态：**
- `items: SkillItem[] | ToolItem[]`：从 API 加载，模块级缓存（避免重复 fetch）
- `filtered`：useMemo 基于 `query` 过滤
- `highlightIdx`：当前键盘高亮项

**API 缓存策略：**
- `let skillsCache: SkillItem[] | null = null` 模块级变量
- `let toolsCache: ToolItem[] | null = null` 模块级变量
- 首次 mount 时 fetch，之后复用缓存（session 内有效）

**键盘事件：**
- MentionPicker 不直接监听键盘，由父组件 Chat.tsx 在 textarea 的 `onKeyDown` 中转发 ↑↓Enter/Escape

### Chat.tsx 修改点

**新增状态：**
```ts
const [mentionState, setMentionState] = useState<{
  type: 'skill' | 'tool'
  query: string
  triggerPos: number   // @ 或 # 在 input 中的位置
} | null>(null)

// 已选的 skill/tool 标记（显示为 chip，发送时注入消息）
const [skillTag, setSkillTag] = useState<string | null>(null)   // '@skill-name'
const [toolTags, setToolTags] = useState<string[]>([])          // ['bash', 'write_file']
```

**onChange 检测逻辑：**
```ts
function detectMention(value: string, cursorPos: number) {
  // 从光标往左找最近的未结束的 @ 或 #
  const slice = value.slice(0, cursorPos)
  const atMatch = slice.match(/(?:^|\s)@(\w*)$/)
  const hashMatch = slice.match(/(?:^|\s)#(\w*)$/)
  if (atMatch) {
    setMentionState({ type: 'skill', query: atMatch[1], triggerPos: ... })
  } else if (hashMatch) {
    setMentionState({ type: 'tool', query: hashMatch[1], triggerPos: ... })
  } else {
    setMentionState(null)
  }
}
```

**onSelect 处理：**
- `type === 'skill'`：设置 `skillTag`，从 input 中删除 `@query` 部分，关闭菜单
- `type === 'tool'`：追加到 `toolTags`，从 input 中删除 `#query` 部分，关闭菜单

**消息构建（handleSend 修改）：**
```ts
// 构建前缀
const prefixParts: string[] = []
if (skillTag) prefixParts.push(`[@${skillTag}]`)
if (toolTags.length > 0) prefixParts.push(`[${toolTags.map(t => '#' + t).join(',')}]`)
const prefix = prefixParts.length > 0 ? prefixParts.join(' ') + ' ' : ''
const finalText = prefix + text
```

---

## 后端设计

### index.ts 修改

`/chat/stream` 接口接收时，在 `sessionQueue.enqueue` 之前提取标记：

```ts
const { message, sessionKey } = req.body
// 提取 skill tag
const skillMatch = message.match(/^\[@([a-zA-Z0-9_-]+)\]\s*/)
const activeSkillName = skillMatch?.[1]
// 提取 tool tags
const toolMatch = message.match(/\[#([a-zA-Z0-9_,#-]+)\]/)
const allowedTools = toolMatch
  ? toolMatch[1].split(',').map(t => t.replace(/^#/, '').trim()).filter(Boolean)
  : undefined
```

然后将 `activeSkillName` 和 `allowedTools` 传入 `runAttempt`。

### system-prompt.ts 修改

`buildSystemPrompt` 新增参数：

```ts
export interface SystemPromptOptions {
  workspaceDir?: string
  skills?: Skill[]
  modelName?: string
  activeSkill?: Skill    // 新增：用户通过 @ 指定的高优先级 Skill
}
```

若 `activeSkill` 存在，在 prompt 最前部添加：
```
## 🎯 用户指定 Skill：${activeSkill.name}
${activeSkill.body}

请优先按以上 Skill 的指导执行用户请求。
```

### runner.ts 修改

`runAttempt` 新增参数：

```ts
export async function runAttempt(options: RunAttemptOptions & {
  activeSkillName?: string
  allowedTools?: string[]
})
```

内部：
- 若 `allowedTools` 非空，从 `toolRegistry.getToolSchemas()` 中过滤，只传 allowed 工具给 LLM
- 若 `activeSkillName` 非空，从 skills 列表中找对应 Skill，传给 `buildSystemPrompt`

---

## 样式设计（MentionPicker.css）

```css
.mention-picker {
  position: absolute;
  bottom: 100%;          /* 输入框正上方 */
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.15);
  z-index: 100;
}

.mention-picker-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mention-picker-item.highlighted {
  background: var(--accent-muted);
}

.mention-picker-item-name {
  font-weight: 500;
  font-size: 13px;
}

.mention-picker-item-desc {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**chip 样式**：复用已有的 `.attachment-tag` 样式，将 `skillTag` 和 `toolTags` 渲染在 `chat-attachments` 区域（与文件附件并列显示）。

---

## 兼容性考虑

- 已有 `[附件: path]` 注入逻辑不冲突（位置在消息末尾，mention 标记在开头）
- 暂停/续行场景：chip 状态属于当前输入，暂停后 chip 不保留（续行需重新 @）
- IME 输入法（中文拼音）：`onChange` 中用 `isComposing` 检测，composing 期间不触发 mention 检测
