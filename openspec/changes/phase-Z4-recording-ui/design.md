# Design: Phase Z4

## Z4.1 持续录音 + 语音转文字

### 方案

用 `MediaRecorder` API 录音 + `SpeechRecognition` API 实时转文字，结果填入输入框。

**流程**：
```
点击 🎤 → getUserMedia → MediaRecorder.start() + SpeechRecognition.start()
                → 持续录音（UI 显示红点+时长）
                → SpeechRecognition 实时回调，transcript 累积
点击 ⏹ → MediaRecorder.stop() + SpeechRecognition.stop()
        → 将累积的 transcript 填入输入框（setInput）
        → 用户可编辑后手动发送
```

**状态**：
```ts
const [isRecording, setIsRecording] = useState(false)
const [recordingDuration, setRecordingDuration] = useState(0)
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const recognitionRef = useRef<SpeechRecognition | null>(null)
const transcriptRef = useRef<string>('')
const recordingTimerRef = useRef<number | null>(null)
```

**录音按钮 UI**：
- 未录音：🎤 灰色
- 录音中：⏹ 红色 + 时长显示 "0:12"
- 录音中脉冲动画

**转文字**：
- 使用 `webkitSpeechRecognition`（WebView2 支持）
- `continuous = true`, `interimResults = true`
- `lang = 'zh-CN'`
- `onresult` 回调累积 transcript
- 停止后将最终 transcript 通过 `setInput()` 填入输入框

## Z4.2 工具分类展示

### 方案

参考 Skills Tab 的 `skill-category-tabs` 实现，为工具 Tab 增加分类筛选。

**工具分类映射**：
```ts
const TOOL_CATEGORIES: Record<string, { label: string; icon: string }> = {
  file: { label: '文件', icon: '📄' },
  search: { label: '搜索', icon: '🔍' },
  browser: { label: '浏览器', icon: '🌐' },
  system: { label: '系统', icon: '⚙️' },
  memory: { label: '记忆', icon: '🧠' },
  schedule: { label: '计划', icon: '⏰' },
}

function getToolCategory(name: string): string {
  if (['read_file','write_file','edit_file','apply_patch','read_pdf','read_image'].includes(name)) return 'file'
  if (['grep','glob','web_search'].includes(name)) return 'search'
  if (['browser','web_fetch'].includes(name)) return 'browser'
  if (['bash','process','list_dir'].includes(name)) return 'system'
  if (['memory_save','memory_search'].includes(name)) return 'memory'
  if (['cron'].includes(name)) return 'schedule'
  return 'other'
}
```

**UI**：与 Skills 分类 Tab 相同的 `tool-category-tabs` 横排标签，含计数徽章。

## Z4.3 UI 主题

基于 `docs/eigent-ui-analysis.md` 高优先级 1-5 项：

### 色板替换

| 变量 | 旧值 | 新值 |
|------|------|------|
| `--bg-app` | `#1c1c1e` | `#0d1424` |
| `--bg-sidebar` | `#151516` | `#0a1018` |
| `--bg-status` | `#151516` | `#0a1018` |
| `--bg-hover` | `rgba(255,255,255,0.08)` | `rgba(148,163,184,0.12)` |
| `--bg-selected` | `rgba(10,132,255,0.15)` | `rgba(122,179,255,0.15)` |
| `--border-default` | `rgba(255,255,255,0.08)` | `rgba(148,163,184,0.12)` |
| `--text-primary` | `#f0f0f0` | `#f4f6ff` |
| `--text-secondary` | `rgba(255,255,255,0.55)` | `#b0bdd8` |
| `--text-muted` | `rgba(255,255,255,0.45)` | `rgba(176,189,216,0.65)` |
| body background | `#1c1c1e` | `#0d1424` |

### 组件样式

- **font-smoothing**: `:root` 加 `-webkit-font-smoothing: antialiased`
- **按钮高光**: `.btn-primary` / `.chat-btn-send` 加 `box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.2)`
- **输入框 focus**: `box-shadow: 0 0 0 2px rgba(122,179,255,0.15)`
- **AI 消息**: 去背景色，改为 `background: transparent`
- **卡片背景**: `rgba(255,255,255,0.08)` → `rgba(148,163,184,0.06)`
- **Settings provider-card**: `#1a1a2e` 类 → `#131b2b`
- **SessionPanel**: `#161617` → `#0e1520`

### 新增黑色板主题 (`theme-black`)

纯黑 OLED 友好主题，所有背景使用纯黑/近黑色：

```css
.app-root.theme-black {
  --bg-app: #000000;
  --bg-sidebar: #0a0a0a;
  --bg-status: #0a0a0a;
  --bg-hover: rgba(255,255,255,0.08);
  --bg-selected: rgba(255,255,255,0.12);
  --border-default: rgba(255,255,255,0.1);
  --text-primary: #e0e0e0;
  --text-secondary: #999999;
  --text-muted: rgba(255,255,255,0.45);
  --text-dim: rgba(255,255,255,0.2);
  --status-online: #4ade80;
  --status-offline: #f87171;
  --accent: #60a5fa;
  --tag-neutral: rgba(255,255,255,0.4);
  --tag-faint: rgba(255,255,255,0.2);
}
```

**App.tsx 变更**：
- `ThemePreference` 和 `EffectiveTheme` 类型增加 `'black'`
- `body.background` 增加 black 分支 → `#000000`
- Settings 主题按钮增加「🖤 纯黑」选项
