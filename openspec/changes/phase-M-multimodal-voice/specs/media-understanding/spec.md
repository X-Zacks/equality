# Delta Spec: Media Understanding Pipeline

> Phase M1 — GAP-30

## ADDED Requirements

### Requirement: 媒体类型检测

系统 MUST 能根据文件路径自动检测媒体类型。

支持的类型映射：
- `image` — png, jpg, jpeg, gif, webp, bmp
- `audio` — mp3, wav, m4a, ogg, flac, webm
- `pdf` — pdf

#### Scenario: 检测图片文件
- GIVEN 文件路径 `screenshot.png`
- WHEN `router.detectType('screenshot.png')` 被调用
- THEN MUST 返回 `'image'`

#### Scenario: 检测音频文件
- GIVEN 文件路径 `recording.mp3`
- WHEN `router.detectType('recording.mp3')` 被调用
- THEN MUST 返回 `'audio'`

#### Scenario: 未知类型
- GIVEN 文件路径 `data.xyz`
- WHEN `router.detectType('data.xyz')` 被调用
- THEN MUST 返回 `null`

### Requirement: MediaProvider 接口

系统 MUST 定义统一的 `MediaProvider` 接口，每个 provider 声明支持的媒体类型和大小限制。

#### Scenario: Provider 声明能力
- GIVEN 一个 audio provider
- WHEN 检查 `provider.supportedTypes`
- THEN MUST 包含 `'audio'`
- AND `provider.maxSizeBytes.audio` MUST 有值（如 25MB）

### Requirement: MediaRouter 路由

系统 MUST 通过 `MediaRouter` 将媒体文件路由到合适的 provider。

- `register(provider)` — 注册 media provider
- `route(filePath)` — 检测类型 + 查找 provider + 处理
- 无匹配 provider 时 MUST 返回 `null`（不抛异常）

#### Scenario: 路由图片到 Vision provider
- GIVEN 注册了 image-vision provider
- WHEN `router.route('photo.jpg')` 被调用
- THEN MUST 调用 image-vision provider 处理
- AND 返回 `MediaResult` 包含 `content`（图片描述）

#### Scenario: 文件超过大小限制
- GIVEN 音频文件 30MB，provider 限制 25MB
- WHEN `router.route('large.mp3')` 被调用
- THEN MUST 返回 `null`
- AND MUST 记录 warn 日志

### Requirement: 音频转录

系统 MUST 支持通过 Whisper API 将音频转录为文本。

- API: OpenAI `/v1/audio/transcriptions`
- 支持多语言（自动检测或指定）
- 响应格式：text

#### Scenario: 音频转录
- GIVEN 一段 30 秒的 mp3 音频
- WHEN audio provider 处理
- THEN MUST 返回 `MediaResult` 包含 `content`（转录文本）
- AND `type` MUST 为 `'audio'`
- AND `processingMs` MUST 有值

#### Scenario: Whisper API 不可用
- GIVEN 未设置相关 API key
- WHEN `audioProvider.isAvailable()` 被调用
- THEN MUST 返回 `false`

### Requirement: 处理结果缓存

- 同一文件（基于内容 hash）的处理结果 SHOULD 被缓存
- 缓存 TTL：10 分钟
- 缓存 MUST 为内存级（不持久化）

#### Scenario: 缓存命中
- GIVEN 同一文件已被处理过
- WHEN 再次 `router.route(samePath)`
- THEN MUST 返回缓存结果
- AND MUST NOT 重新调用 provider
