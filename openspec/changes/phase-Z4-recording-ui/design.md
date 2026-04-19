# Design: Phase Z4

## Z4.1 持续录音 + 音频附件

### 方案

用 `MediaRecorder` API 替代 `SpeechRecognition`。

**流程**：
```
点击 🎤 → getUserMedia → MediaRecorder.start()
                → 持续录音（UI 显示红点+时长）
点击 ⏹ → MediaRecorder.stop()
        → 收集 Blob → write_temp_file → 附件路径
        → 自动调用 sendMessage("[附件: /tmp/xxx.webm]")
```

**状态**：
```ts
const [isRecording, setIsRecording] = useState(false)
const [recordingDuration, setRecordingDuration] = useState(0)
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const audioChunksRef = useRef<Blob[]>([])
const recordingTimerRef = useRef<number | null>(null)
```

**录音按钮 UI**：
- 未录音：🎤 灰色
- 录音中：⏹ 红色 + 时长显示 "0:12"
- 录音中脉冲动画

**音频格式**：`audio/webm;codecs=opus`（WebView2 原生支持）

### 音频发送

录音结束后：
1. `new Blob(chunks, { type: 'audio/webm' })` 
2. `invoke('write_temp_file', { data: [...uint8], filename: 'voice-xxx.webm' })`
3. 构造消息 `[语音消息]\n\n[附件: <path>]`
4. 调用 `sendMessage(...)` — core 的 media pipeline 会通过 read_image/audio 类工具处理

## Z4.2 UI 深海蓝主题

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
