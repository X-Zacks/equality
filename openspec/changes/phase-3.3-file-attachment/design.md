# Design: Phase 3.3 — 对话附件（文件选择 & 拖拽）

---

## 1. 交互设计

### 1.1 输入区布局

```
┌─────────────────────────────────────────────┐
│ ┌─────────┐ ┌──────────┐                    │  ← 附件标签栏（有附件时显示）
│ │📄 foo.ts ✕│ │🖼 img.png ✕│                  │
│ └─────────┘ └──────────┘                    │
├─────────────────────────────────────────────┤
│ 📎 │  输入消息…                         │ ↑ │  ← 输入行
└─────────────────────────────────────────────┘
```

- 📎 按钮：位于 textarea 左侧，点击弹出系统文件选择对话框
- 附件标签栏：在 textarea 上方，仅当有附件时显示
- 每个标签显示：文件类型图标 + 文件名 + ✕ 删除按钮
- 拖拽区域：整个 `.chat-input-area` 作为 drop zone

### 1.2 文件类型图标

| 扩展名 | 图标 |
|--------|------|
| .png .jpg .jpeg .gif .webp .bmp .svg | 🖼️ |
| .pdf | 📑 |
| 其他（代码/文本） | 📄 |

### 1.3 拖拽视觉反馈

- 拖入时：输入区边框变为蓝色高亮 + 半透明遮罩 "📎 拖放文件到此处"
- 拖出后：恢复正常样式

---

## 2. 文件选择 — Tauri dialog API

```typescript
import { open } from '@tauri-apps/plugin-dialog'

const selected = await open({
  multiple: true,
  title: '选择文件',
  filters: [
    { name: '所有支持的文件', extensions: ['*'] },
    { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
    { name: 'PDF', extensions: ['pdf'] },
    { name: '文本/代码', extensions: ['txt', 'md', 'ts', 'js', 'py', 'json', 'yaml', 'toml', 'html', 'css'] },
  ],
})
// selected: string | string[] | null
```

---

## 3. 拖拽放置 — Tauri drag-drop event

Tauri v2 提供原生拖拽事件，可以获取文件路径：

```typescript
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

const unlisten = await getCurrentWebviewWindow().onDragDropEvent((event) => {
  if (event.payload.type === 'drop') {
    const paths: string[] = event.payload.paths
    // 添加到附件列表
  } else if (event.payload.type === 'over') {
    // 显示拖拽视觉反馈
  } else if (event.payload.type === 'leave') {
    // 隐藏拖拽视觉反馈
  }
})
```

同时用 HTML5 的 drag-drop 事件做视觉反馈：
- `onDragEnter` → 显示高亮
- `onDragLeave` → 隐藏高亮
- `onDrop` → `e.preventDefault()`（Tauri 事件处理实际文件）

---

## 4. 附件状态管理

```typescript
interface Attachment {
  path: string       // 本地绝对路径
  name: string       // 文件名（basename）
  type: 'image' | 'pdf' | 'text'  // 类型分类
  size?: number      // 文件大小（字节）
}

// Chat 组件中
const [attachments, setAttachments] = useState<Attachment[]>([])
const MAX_ATTACHMENTS = 5
```

---

## 5. 消息注入格式

发送时，附件路径追加到用户消息末尾：

```
用户原始输入: "帮我分析一下"
附件: [C:\docs\report.pdf, C:\pics\chart.png]

实际发送的消息:
"帮我分析一下

[附件: C:\docs\report.pdf]
[附件: C:\pics\chart.png]"
```

这种格式让 LLM 自然地识别文件路径，并决定用哪个工具读取：
- `.pdf` → `read_pdf`
- `.png/.jpg/...` → `read_image`
- 其他 → `read_file`

---

## 6. CSS 样式

### 6.1 附件标签栏
```css
.chat-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 24px 0;
}

.attachment-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  font-size: 12px;
  color: #ccc;
  max-width: 200px;
}

.attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-remove {
  cursor: pointer;
  opacity: 0.5;
  font-size: 14px;
}
.attachment-remove:hover { opacity: 1; }
```

### 6.2 拖拽高亮
```css
.chat-input-area.drag-over {
  border-color: rgba(10,132,255,0.7);
  background: rgba(10,132,255,0.05);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10,132,255,0.08);
  border-radius: 12px;
  font-size: 14px;
  color: rgba(10,132,255,0.8);
  pointer-events: none;
}
```

---

## 7. 需要安装的 Tauri 插件

检查是否已有 `@tauri-apps/plugin-dialog`。如果没有，需要：
- 前端: `pnpm add @tauri-apps/plugin-dialog`
- Rust: `cargo add tauri-plugin-dialog` (在 src-tauri/)
- tauri.conf.json: 添加 plugin 注册
