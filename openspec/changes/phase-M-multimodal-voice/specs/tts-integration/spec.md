# Delta Spec: TTS Integration

> Phase M2 — GAP-31

## ADDED Requirements

### Requirement: TTSProvider 接口

系统 MUST 定义统一的 TTS provider 接口。

```typescript
interface TTSProvider {
  readonly id: string
  readonly name: string
  isAvailable(): boolean | Promise<boolean>
  synthesize(request: TTSRequest): Promise<TTSResult>
  listVoices(): Array<{ id: string; name: string; language: string }>
}
```

#### Scenario: Provider 列出可用语音
- GIVEN OpenAI TTS provider
- WHEN `provider.listVoices()` 被调用
- THEN MUST 返回语音列表，每个包含 id、name、language

### Requirement: 文本预处理

系统 MUST 在 TTS 合成前对文本进行预处理。

预处理规则：
- 移除 markdown 标记（`#`、`**`、`\``、`[]()`）
- 移除代码块内容（\`\`\`...\`\`\`）
- 截断到 4096 字符
- 保留句子完整性（在句号/问号/感叹号处截断）

#### Scenario: 清理 markdown
- GIVEN 文本 `"## 标题\n**粗体**文本\n\`code\`"  `
- WHEN `prepareText(text)` 被调用
- THEN MUST 返回 `"标题\n粗体文本\ncode"` 或类似清理结果

#### Scenario: 移除代码块
- GIVEN 文本包含 \`\`\`typescript ... \`\`\`
- WHEN `prepareText(text)` 被调用
- THEN 代码块 MUST 被移除或替换为 "[代码已省略]"

#### Scenario: 长文截断
- GIVEN 文本长度超过 4096 字符
- WHEN `prepareText(text, 4096)` 被调用
- THEN 结果 MUST ≤ 4096 字符
- AND MUST 在句子边界截断

### Requirement: TTSEngine

系统 MUST 提供 `TTSEngine` 统一管理 TTS provider。

- `register(provider)` — 注册 TTS provider
- `getDefaultProvider()` — 自动选择可用 provider
- `speak(text, options?)` — 预处理 + 合成
- 无可用 provider 时 MUST 返回前端 fallback 格式（`format: 'speech-api'`）

#### Scenario: 有 API key 时使用服务端 TTS
- GIVEN OpenAI TTS provider 可用
- WHEN `engine.speak('hello')` 被调用
- THEN MUST 返回 `{ audio: Buffer, format: 'mp3', provider: 'openai-tts' }`

#### Scenario: 无 API key 时返回前端 fallback
- GIVEN 无可用 TTS provider
- WHEN `engine.speak('hello')` 被调用
- THEN MUST 返回 `{ audio: null, format: 'speech-api', text: 'hello' }`
- AND 前端 MAY 使用 Web Speech API 播放

### Requirement: OpenAI TTS Provider

系统 MUST 内置 OpenAI TTS provider。

- API: `/v1/audio/speech`
- 模型：`tts-1`（标准）或 `tts-1-hd`（高质量）
- 语音：alloy / echo / fable / onyx / nova / shimmer
- 响应格式：mp3
- 速度：0.25 - 4.0

#### Scenario: 合成语音
- GIVEN API key 有效，voice = 'alloy'
- WHEN `provider.synthesize({ text: 'Hello world', voice: 'alloy' })`
- THEN MUST 返回 mp3 格式的 Buffer
- AND `format` MUST 为 `'mp3'`

#### Scenario: API 不可用
- GIVEN 未设置 TTS API key
- WHEN `provider.isAvailable()` 被调用
- THEN MUST 返回 `false`

### Requirement: TTS 语音列表常量

- 系统 MUST 导出 `SUPPORTED_MEDIA_TYPES` 常量（MediaType 数组）
- 系统 MUST 导出 `OPENAI_TTS_VOICES` 常量（语音 ID 数组）
