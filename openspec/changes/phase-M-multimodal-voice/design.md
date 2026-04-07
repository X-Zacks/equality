# Phase M 设计文档

## M1 — Media Understanding Pipeline

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 媒体类型 | image / audio / pdf（视频 v2） | 桌面应用最常见的 3 种附件类型 |
| 音频转录 | OpenAI Whisper API（主）+ 可选本地（v2） | API 质量高、易集成、支持多语言 |
| 图片分析 | 现有 Vision provider | 已有基础，仅需路由层 |
| PDF 处理 | 现有 read-pdf 工具 | 已有基础，仅需路由层 |
| 路由 | MIME type → MediaProvider | 自动检测文件类型并路由到对应 provider |
| 缓存 | 基于文件 hash 的内存缓存 | 同一文件不重复处理 |
| 大小限制 | image:10MB, audio:25MB, pdf:20MB | 平衡处理能力与网络传输 |

### 新增文件

- `media/types.ts` — MediaType / MediaProvider / MediaResult / MediaRouter 类型
- `media/router.ts` — MediaRouter 实现（MIME 检测 + provider 调度）
- `media/providers/audio-transcribe.ts` — Whisper API 转录 provider
- `media/providers/image-vision.ts` — 封装现有 Vision 调用

### 修改文件

- `tools/builtins/read-image.ts` — 改为通过 MediaRouter 调用

### 类型定义

```typescript
type MediaType = 'image' | 'audio' | 'pdf'

interface MediaInput {
  type: MediaType
  filePath: string
  mimeType: string
  sizeBytes: number
}

interface MediaResult {
  type: MediaType
  content: string          // 转录文本 / 图片描述 / PDF 文本
  provider: string         // 使用的 provider id
  processingMs: number
  metadata?: Record<string, unknown>
}

interface MediaProvider {
  readonly id: string
  readonly supportedTypes: MediaType[]
  readonly maxSizeBytes: Record<MediaType, number>
  isAvailable(): boolean | Promise<boolean>
  process(input: MediaInput): Promise<MediaResult>
}

class MediaRouter {
  register(provider: MediaProvider): void
  unregister(providerId: string): void
  detectType(filePath: string): MediaType | null
  route(filePath: string): Promise<MediaResult | null>
  listProviders(): Array<{ id: string; types: MediaType[]; available: boolean }>
}
```

### 数据流

```
用户拖入 recording.mp3
  → MediaRouter.route('recording.mp3')
    → detectType → 'audio'（基于 MIME / 扩展名）
    → 查找支持 audio 的 MediaProvider
    → audioProvider.process({ type: 'audio', filePath, mimeType, sizeBytes })
      → Whisper API → { content: '转录文本...', processingMs: 1200 }
    → 注入到 LLM 上下文
```

---

## M2 — TTS Integration

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构 | 前后端分离 | 后端提供 TTS API 端点，前端（Tauri webview）播放音频 |
| 服务端 TTS | OpenAI TTS API（alloy/echo/shimmer 等） | 质量高、延迟低、多语言 |
| 客户端 TTS | Web Speech API (speechSynthesis) | 浏览器原生、零依赖、离线可用 |
| 默认模式 | 客户端 TTS（Web Speech） | 零成本、即用 |
| 高级模式 | 服务端 TTS（需 API key） | 音质更好，配置后启用 |
| 文本预处理 | markdown strip + 长文截断 | 去除 code block / heading markers |
| 音频格式 | mp3（API）/ 浏览器原生（Web Speech） | mp3 兼容性最好 |

### 新增文件

- `tts/types.ts` — TTSProvider / TTSRequest / TTSResult / TTSEngine 类型
- `tts/engine.ts` — TTSEngine 实现（provider 选择 + 文本预处理）
- `tts/providers/openai-tts.ts` — OpenAI TTS API provider
- `tts/text-prep.ts` — markdown 清理 + 长文截断 + 语句分割

### 类型定义

```typescript
interface TTSRequest {
  text: string
  voice?: string        // provider-specific voice id
  speed?: number        // 0.5 - 2.0, default 1.0
  language?: string     // BCP 47 语言标签
}

interface TTSResult {
  audio: Buffer | null     // 音频数据（服务端 TTS）
  format: 'mp3' | 'wav' | 'speech-api'   // speech-api = 前端播放
  text: string             // 预处理后的文本（前端 TTS 使用）
  provider: string
  durationMs?: number
}

interface TTSProvider {
  readonly id: string
  readonly name: string
  isAvailable(): boolean | Promise<boolean>
  synthesize(request: TTSRequest): Promise<TTSResult>
  listVoices(): Array<{ id: string; name: string; language: string }>
}

class TTSEngine {
  register(provider: TTSProvider): void
  getDefaultProvider(): TTSProvider | null
  speak(text: string, options?: Partial<TTSRequest>): Promise<TTSResult>
  prepareText(text: string, maxChars?: number): string
}
```

### 数据流

```
Agent 回复: "TypeScript 的泛型允许你写出类型安全的..."

前端调用 TTS：
  → TTSEngine.speak(agentReply)
    → prepareText() → strip markdown, 截断到 4096 字符
    → getDefaultProvider()
      → 有 OPENAI_TTS_KEY? → OpenAI TTS → mp3 Buffer → 前端 <audio> 播放
      → 无 API key? → 返回 { format: 'speech-api', text } → 前端 speechSynthesis.speak()
```
