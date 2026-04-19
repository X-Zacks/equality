# Design: Phase Z — 配额设置 UI + 语音输入

## Z1: 配额设置 UI

### 现有架构

- `GET /quota` → `{ configs: QuotaConfig[], statuses: QuotaStatus[] }`
- `PUT /quota` → `{ provider, tier, monthlyLimit, warnPct?, criticalPct?, autoDowngrade? }`
- `deleteQuotaConfig(provider, tier)` 已导出但**无路由**

### 前端改动

在 Settings.tsx 配额区域下方，添加「添加配额」按钮和内联表单：

```
┌──────────────────────────────────────┐
│ 📊 月度请求配额                       │
│ ┌──────────────────────────────────┐ │
│ │ ✅ copilot · premium  120/500   │ │ ← 已有展示
│ │ ▓▓▓▓▓▓░░░░░░░░░░░░  24%  [✏️🗑]│ │ ← 新增：编辑/删除按钮
│ └──────────────────────────────────┘ │
│ [+ 添加配额规则]                      │ ← 新增按钮
│ ┌──────────────────────────────────┐ │
│ │ Provider [copilot ▾]             │ │ ← 展开的表单
│ │ Tier     [premium ▾]             │ │
│ │ 月度上限  [500     ]             │ │
│ │ 警告阈值  [80%     ]             │ │
│ │ 危险阈值  [95%     ]             │ │
│ │ ☑ 超限自动降级                    │ │
│ │ [保存] [取消]                     │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### 后端改动

新增 `DELETE /quota` 路由：

```typescript
app.delete('/quota', async (req, reply) => {
  const { provider, tier } = req.body
  deleteQuotaConfig(provider, tier)
  return reply.send({ ok: true })
})
```

---

## Z2: 语音输入

### 技术选型

使用浏览器原生 **Web Speech API**（`SpeechRecognition` / `webkitSpeechRecognition`）。

- WebView2 (Tauri) 支持此 API
- 无需第三方依赖
- 支持中英文混合识别

### UI 设计

在 Chat 输入区的附件按钮和 textarea 之间添加麦克风按钮：

```
[📎] [🎤] [textarea...                    ] [↑]
      ↑
   点击开始录音，按钮变红🔴，松手/再点结束
   识别结果追加到 textarea
```

### 状态机

```
idle → (click) → listening → (result) → idle
                           → (error)  → idle
                           → (click)  → idle (手动停止)
```

### 实现

```typescript
// 使用 useRef 持有 SpeechRecognition 实例
const recognitionRef = useRef<SpeechRecognition | null>(null)
const [isListening, setIsListening] = useState(false)

const toggleVoice = () => {
  if (isListening) {
    recognitionRef.current?.stop()
    return
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { alert('当前环境不支持语音识别'); return }
  const recognition = new SR()
  recognition.lang = 'zh-CN'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
    setInput(prev => prev + transcript)
  }
  recognition.onend = () => setIsListening(false)
  recognition.onerror = () => setIsListening(false)
  recognitionRef.current = recognition
  recognition.start()
  setIsListening(true)
}
```

### 样式

```css
.voice-btn { /* 与 attach-btn 相同基础样式 */ }
.voice-btn.listening { color: #ff453a; animation: pulse 1s infinite; }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
```
