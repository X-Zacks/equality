# Design: Phase Z2

## Z2.1 配额设置移入 ProviderDrawer

### 方案

将 `ProviderDrawer` 增加配额相关 props，在抽屉底部显示当前 provider 的配额状态和编辑表单。

**数据流**：
```
Settings (state owner)
  └─ ProviderDrawer
       ├─ 模型配置（已有）
       └─ 配额区（新增）
            ├─ 当前配额状态条
            ├─ 编辑按钮 → 展开表单
            └─ 删除按钮
```

**ProviderDrawer 新增 props**：
```ts
quotaStatus?: { used: number; limit: number; pct: number; level: string }
quotaConfig?: { monthlyLimit: number; warnPct: number; criticalPct: number; autoDowngrade: boolean }
onQuotaSave: (cfg: QuotaDraft) => Promise<void>
onQuotaDelete: () => Promise<void>
```

**抽屉内配额区 UI**：
```
┌────────────────────────────────┐
│  ⚡ DeepSeek          ✔ 当前激活 │
│  API Key: ********             │
│  [清除] [保存]                  │
│ ─────────────────────────────── │
│  📊 配额 · premium              │
│  ████████░░ 80/500 (16%)       │
│  [✏️ 编辑] [🗑️ 删除]           │
│  ┌─ 编辑表单（展开时）─────────┐ │
│  │ Tier: [premium ▾]         │ │
│  │ 月度上限: [500]            │ │
│  │ 警告阈值: [80]%           │ │
│  │ 危险阈值: [95]%           │ │
│  │ ☑ 超限自动降级             │ │
│  │ [保存] [取消]              │ │
│  └────────────────────────────┘ │
└────────────────────────────────┘
```

**Settings 底部配额区**：保留只读的总览汇总，删除编辑/添加功能。改为简洁的状态列表 + "在各模型抽屉中管理" 提示。

### 实现要点

- Tier 下拉限定 `premium / standard / economy`
- Provider 不需要下拉，因为已经在对应抽屉里
- 每个抽屉只管自己 provider 的配额，tier 可以有多条

## Z2.2 语音播报 (TTS)

### 方案

使用浏览器原生 `SpeechSynthesis` API（WebView2 支持）。

**触发时机**：
- 助手消息完成后，消息气泡右下角显示 🔊 播报按钮
- 点击后用 `speechSynthesis.speak()` 朗读
- 再次点击或新消息到来时停止

**防机械感策略**：
- 将回复文本按句子分割（句号/问号/感叹号/换行），逐句 `SpeechSynthesisUtterance`
- 设 `rate=1.0`、`pitch=1.0`，选中文 voice
- 句间自然停顿由 API 自动处理

**状态**：
```ts
const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null)
```

**代码关键**：
```ts
function speakMessage(text: string, idx: number) {
  speechSynthesis.cancel() // 停止之前的
  // 清理 markdown 标记
  const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`_~\[\]()]/g, '').trim()
  if (!clean) return
  // 按句分割
  const sentences = clean.split(/(?<=[。！？\n.!?])\s*/).filter(Boolean)
  sentences.forEach((s, i) => {
    const utt = new SpeechSynthesisUtterance(s)
    utt.lang = 'zh-CN'
    utt.rate = 1.0
    if (i === sentences.length - 1) utt.onend = () => setSpeakingMsgIdx(null)
    speechSynthesis.speak(utt)
  })
  setSpeakingMsgIdx(idx)
}
```

**UI**：
- 每条 assistant 消息气泡底部右侧加 🔊 按钮
- 正在播报时显示 🔇（点击停止）
- CSS: `.tts-btn` 小按钮样式
