/**
 * Phase M — 多模态与语音 集成验证
 *
 *   M1: Media Understanding Pipeline (GAP-30)
 *   M2: TTS Integration (GAP-31)
 */

import assert from 'node:assert/strict'

// ═══════════════════════════════════════════════════════════════════════════════
// M1: Media Understanding Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── M1: Media Understanding Pipeline ──')

import {
  SUPPORTED_MEDIA_TYPES,
  EXTENSION_MAP,
  DEFAULT_SIZE_LIMITS,
  type MediaProvider,
  type MediaResult,
  type MediaInput,
  type MediaType,
} from '../media/types.js'
import { MediaRouter } from '../media/router.js'

// Mock providers
function createMockImageProvider(available = true): MediaProvider {
  return {
    id: 'image-vision',
    supportedTypes: ['image'],
    maxSizeBytes: { image: 10 * 1024 * 1024 },
    isAvailable: () => available,
    process: async (input: MediaInput): Promise<MediaResult> => ({
      type: 'image',
      content: `[Image description for ${input.filePath}]`,
      provider: 'image-vision',
      processingMs: 150,
    }),
  }
}

function createMockAudioProvider(available = true): MediaProvider {
  return {
    id: 'audio-whisper',
    supportedTypes: ['audio'],
    maxSizeBytes: { audio: 25 * 1024 * 1024 },
    isAvailable: () => available,
    process: async (input: MediaInput): Promise<MediaResult> => ({
      type: 'audio',
      content: 'Hello world, this is a test transcription.',
      provider: 'audio-whisper',
      processingMs: 1200,
    }),
  }
}

// T1: SUPPORTED_MEDIA_TYPES 常量
{
  assert.ok(SUPPORTED_MEDIA_TYPES.includes('image'), 'M1-T1a: includes image')
  assert.ok(SUPPORTED_MEDIA_TYPES.includes('audio'), 'M1-T1b: includes audio')
  assert.ok(SUPPORTED_MEDIA_TYPES.includes('pdf'), 'M1-T1c: includes pdf')
  assert.equal(SUPPORTED_MEDIA_TYPES.length, 3, 'M1-T1d: exactly 3 types')
  console.log('  ✅ M1-T1: SUPPORTED_MEDIA_TYPES (4 assertions)')
}

// T2: EXTENSION_MAP 覆盖
{
  assert.equal(EXTENSION_MAP.png, 'image', 'M1-T2a: png → image')
  assert.equal(EXTENSION_MAP.jpg, 'image', 'M1-T2b: jpg → image')
  assert.equal(EXTENSION_MAP.mp3, 'audio', 'M1-T2c: mp3 → audio')
  assert.equal(EXTENSION_MAP.wav, 'audio', 'M1-T2d: wav → audio')
  assert.equal(EXTENSION_MAP.pdf, 'pdf', 'M1-T2e: pdf → pdf')
  assert.equal(EXTENSION_MAP.flac, 'audio', 'M1-T2f: flac → audio')
  console.log('  ✅ M1-T2: EXTENSION_MAP (6 assertions)')
}

// T3: DEFAULT_SIZE_LIMITS
{
  assert.equal(DEFAULT_SIZE_LIMITS.image, 10 * 1024 * 1024, 'M1-T3a: image 10MB')
  assert.equal(DEFAULT_SIZE_LIMITS.audio, 25 * 1024 * 1024, 'M1-T3b: audio 25MB')
  assert.equal(DEFAULT_SIZE_LIMITS.pdf, 20 * 1024 * 1024, 'M1-T3c: pdf 20MB')
  console.log('  ✅ M1-T3: DEFAULT_SIZE_LIMITS (3 assertions)')
}

// T4: detectType — 图片
{
  const router = new MediaRouter()
  assert.equal(router.detectType('screenshot.png'), 'image', 'M1-T4a: .png → image')
  assert.equal(router.detectType('photo.JPG'), 'image', 'M1-T4b: .JPG → image (case insensitive)')
  assert.equal(router.detectType('pic.webp'), 'image', 'M1-T4c: .webp → image')
  console.log('  ✅ M1-T4: detectType image (3 assertions)')
}

// T5: detectType — 音频
{
  const router = new MediaRouter()
  assert.equal(router.detectType('recording.mp3'), 'audio', 'M1-T5a: .mp3 → audio')
  assert.equal(router.detectType('voice.m4a'), 'audio', 'M1-T5b: .m4a → audio')
  assert.equal(router.detectType('sound.ogg'), 'audio', 'M1-T5c: .ogg → audio')
  console.log('  ✅ M1-T5: detectType audio (3 assertions)')
}

// T6: detectType — PDF 和未知
{
  const router = new MediaRouter()
  assert.equal(router.detectType('doc.pdf'), 'pdf', 'M1-T6a: .pdf → pdf')
  assert.equal(router.detectType('data.xyz'), null, 'M1-T6b: .xyz → null')
  assert.equal(router.detectType('file.txt'), null, 'M1-T6c: .txt → null')
  console.log('  ✅ M1-T6: detectType pdf/unknown (3 assertions)')
}

// T7: register + listProviders
{
  const router = new MediaRouter()
  router.register(createMockImageProvider())
  router.register(createMockAudioProvider())
  const list = await router.listProviders()
  assert.equal(list.length, 2, 'M1-T7a: 2 providers')
  assert.ok(list.some(p => p.id === 'image-vision' && p.types.includes('image')), 'M1-T7b: image provider')
  assert.ok(list.some(p => p.id === 'audio-whisper' && p.types.includes('audio')), 'M1-T7c: audio provider')
  console.log('  ✅ M1-T7: register + list (3 assertions)')
}

// T8: route — 图片
{
  const router = new MediaRouter({ enableCache: false })
  router.register(createMockImageProvider())
  const result = await router.route('photo.jpg', { sizeBytes: 1024 })
  assert.ok(result !== null, 'M1-T8a: result not null')
  assert.equal(result!.type, 'image', 'M1-T8b: type=image')
  assert.equal(result!.provider, 'image-vision', 'M1-T8c: provider')
  assert.ok(result!.content.includes('photo.jpg'), 'M1-T8d: content contains filename')
  console.log('  ✅ M1-T8: route image (4 assertions)')
}

// T9: route — 音频
{
  const router = new MediaRouter({ enableCache: false })
  router.register(createMockAudioProvider())
  const result = await router.route('recording.mp3', { sizeBytes: 2048 })
  assert.ok(result !== null, 'M1-T9a: result not null')
  assert.equal(result!.type, 'audio', 'M1-T9b: type=audio')
  assert.ok(result!.content.includes('transcription'), 'M1-T9c: has transcription')
  console.log('  ✅ M1-T9: route audio (3 assertions)')
}

// T10: route — 未知类型
{
  const router = new MediaRouter()
  router.register(createMockImageProvider())
  const result = await router.route('data.xyz', { sizeBytes: 100 })
  assert.equal(result, null, 'M1-T10: unknown type → null')
  console.log('  ✅ M1-T10: unknown type (1 assertion)')
}

// T11: route — 无匹配 provider
{
  const router = new MediaRouter()
  router.register(createMockImageProvider())
  // 注册了 image provider，但是路由 audio 文件
  const result = await router.route('voice.mp3', { sizeBytes: 100 })
  assert.equal(result, null, 'M1-T11: no matching provider → null')
  console.log('  ✅ M1-T11: no matching provider (1 assertion)')
}

// T12: route — 超过大小限制
{
  const router = new MediaRouter({ enableCache: false })
  router.register(createMockImageProvider()) // maxSizeBytes.image = 10MB
  const result = await router.route('big.png', { sizeBytes: 15 * 1024 * 1024 })
  assert.equal(result, null, 'M1-T12: over size limit → null')
  console.log('  ✅ M1-T12: size limit (1 assertion)')
}

// T13: route — 缓存命中
{
  const router = new MediaRouter({ enableCache: true, cacheTtlMs: 60000 })
  let processCount = 0
  const countingProvider: MediaProvider = {
    id: 'counter',
    supportedTypes: ['image'],
    maxSizeBytes: { image: 10 * 1024 * 1024 },
    isAvailable: () => true,
    process: async (input) => {
      processCount++
      return { type: 'image', content: 'desc', provider: 'counter', processingMs: 100 }
    },
  }
  router.register(countingProvider)

  await router.route('test.png', { sizeBytes: 1024 })
  assert.equal(processCount, 1, 'M1-T13a: first call processes')

  const cached = await router.route('test.png', { sizeBytes: 1024 })
  assert.equal(processCount, 1, 'M1-T13b: second call uses cache')
  assert.equal(cached!.cached, true, 'M1-T13c: cached flag set')
  console.log('  ✅ M1-T13: cache (3 assertions)')
}

// T14: unregister
{
  const router = new MediaRouter()
  router.register(createMockImageProvider())
  assert.equal(router.size, 1, 'M1-T14a: size=1')
  router.unregister('image-vision')
  assert.equal(router.size, 0, 'M1-T14b: size=0')
  console.log('  ✅ M1-T14: unregister (2 assertions)')
}

// T15: provider 不可用时跳过
{
  const router = new MediaRouter({ enableCache: false })
  router.register(createMockImageProvider(false)) // unavailable
  const result = await router.route('test.png', { sizeBytes: 100 })
  assert.equal(result, null, 'M1-T15: unavailable provider → null')
  console.log('  ✅ M1-T15: unavailable provider (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// M2: TTS Integration
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── M2: TTS Integration ──')

import { OPENAI_TTS_VOICES, TTS_DEFAULTS, type TTSProvider, type TTSResult, type TTSRequest } from '../tts/types.js'
import { prepareText } from '../tts/text-prep.js'
import { TTSEngine } from '../tts/engine.js'

// Mock TTS provider
function createMockTTSProvider(available = true): TTSProvider {
  return {
    id: 'openai-tts',
    name: 'OpenAI TTS',
    isAvailable: () => available,
    synthesize: async (req: TTSRequest): Promise<TTSResult> => ({
      audio: Buffer.from('fake-audio-data'),
      format: 'mp3',
      text: req.text,
      provider: 'openai-tts',
      durationMs: 1500,
    }),
    listVoices: () => [
      { id: 'alloy', name: 'Alloy', language: 'en' },
      { id: 'nova', name: 'Nova', language: 'en' },
    ],
  }
}

// T16: OPENAI_TTS_VOICES 常量
{
  assert.ok(OPENAI_TTS_VOICES.includes('alloy'), 'M2-T16a: includes alloy')
  assert.ok(OPENAI_TTS_VOICES.includes('echo'), 'M2-T16b: includes echo')
  assert.ok(OPENAI_TTS_VOICES.includes('shimmer'), 'M2-T16c: includes shimmer')
  assert.equal(OPENAI_TTS_VOICES.length, 6, 'M2-T16d: 6 voices')
  console.log('  ✅ M2-T16: OPENAI_TTS_VOICES (4 assertions)')
}

// T17: TTS_DEFAULTS
{
  assert.equal(TTS_DEFAULTS.voice, 'alloy', 'M2-T17a: default voice')
  assert.equal(TTS_DEFAULTS.speed, 1.0, 'M2-T17b: default speed')
  assert.equal(TTS_DEFAULTS.model, 'tts-1', 'M2-T17c: default model')
  assert.equal(TTS_DEFAULTS.maxTextLength, 4096, 'M2-T17d: max text')
  console.log('  ✅ M2-T17: TTS_DEFAULTS (4 assertions)')
}

// T18: prepareText — markdown 清理
{
  const input = '## 标题\n**粗体**文本\n`code`'
  const result = prepareText(input)
  assert.ok(!result.includes('##'), 'M2-T18a: no heading markers')
  assert.ok(!result.includes('**'), 'M2-T18b: no bold markers')
  assert.ok(!result.includes('`'), 'M2-T18c: no backticks')
  assert.ok(result.includes('标题'), 'M2-T18d: heading text preserved')
  assert.ok(result.includes('粗体'), 'M2-T18e: bold text preserved')
  assert.ok(result.includes('code'), 'M2-T18f: code text preserved')
  console.log('  ✅ M2-T18: markdown cleanup (6 assertions)')
}

// T19: prepareText — 代码块移除
{
  const input = 'Before\n```typescript\nconst x = 1\n```\nAfter'
  const result = prepareText(input)
  assert.ok(!result.includes('const x'), 'M2-T19a: code block removed')
  assert.ok(result.includes('[代码已省略]'), 'M2-T19b: replacement text')
  assert.ok(result.includes('Before'), 'M2-T19c: text before preserved')
  assert.ok(result.includes('After'), 'M2-T19d: text after preserved')
  console.log('  ✅ M2-T19: code block removal (4 assertions)')
}

// T20: prepareText — 链接清理
{
  const input = 'Visit [Google](https://google.com) for info'
  const result = prepareText(input)
  assert.ok(result.includes('Google'), 'M2-T20a: link text preserved')
  assert.ok(!result.includes('https://google.com'), 'M2-T20b: URL removed')
  assert.ok(!result.includes('['), 'M2-T20c: no brackets')
  console.log('  ✅ M2-T20: link cleanup (3 assertions)')
}

// T21: prepareText — 长文截断
{
  const longText = '这是一个测试句子。'.repeat(600) // ~5400 chars
  const result = prepareText(longText, 4096)
  assert.ok(result.length <= 4096, `M2-T21a: truncated (len=${result.length})`)
  // 应在句子边界截断
  const lastChar = result[result.length - 1]
  assert.ok(lastChar === '。' || lastChar === '…', `M2-T21b: ends at sentence (last='${lastChar}')`)
  console.log('  ✅ M2-T21: truncation (2 assertions)')
}

// T22: prepareText — 短文不截断
{
  const short = 'Hello world.'
  const result = prepareText(short, 4096)
  assert.equal(result, 'Hello world.', 'M2-T22: short text unchanged')
  console.log('  ✅ M2-T22: short text (1 assertion)')
}

// T23: TTSEngine — 有 provider 时合成
{
  const engine = new TTSEngine()
  engine.register(createMockTTSProvider())
  const result = await engine.speak('Hello world')
  assert.ok(result.audio !== null, 'M2-T23a: has audio')
  assert.equal(result.format, 'mp3', 'M2-T23b: format=mp3')
  assert.equal(result.provider, 'openai-tts', 'M2-T23c: provider id')
  assert.ok(result.text.length > 0, 'M2-T23d: has text')
  console.log('  ✅ M2-T23: engine speak (4 assertions)')
}

// T24: TTSEngine — 无 provider 时 fallback
{
  const engine = new TTSEngine()
  const result = await engine.speak('Hello world')
  assert.equal(result.audio, null, 'M2-T24a: no audio')
  assert.equal(result.format, 'speech-api', 'M2-T24b: speech-api fallback')
  assert.equal(result.provider, 'speech-api', 'M2-T24c: provider=speech-api')
  assert.ok(result.text.includes('Hello world'), 'M2-T24d: text preserved')
  console.log('  ✅ M2-T24: fallback (4 assertions)')
}

// T25: TTSEngine — provider 不可用时 fallback
{
  const engine = new TTSEngine()
  engine.register(createMockTTSProvider(false))
  const result = await engine.speak('Test')
  assert.equal(result.format, 'speech-api', 'M2-T25: unavailable → fallback')
  console.log('  ✅ M2-T25: unavailable provider fallback (1 assertion)')
}

// T26: TTSEngine — listVoices
{
  const engine = new TTSEngine()
  engine.register(createMockTTSProvider())
  const voices = engine.listVoices()
  assert.ok(voices.length >= 2, 'M2-T26a: has voices')
  assert.ok(voices.some(v => v.id === 'alloy'), 'M2-T26b: has alloy')
  console.log('  ✅ M2-T26: listVoices (2 assertions)')
}

// T27: TTSEngine — speak 传递 options
{
  const engine = new TTSEngine()
  let capturedReq: TTSRequest | null = null
  const capturingProvider: TTSProvider = {
    id: 'capture',
    name: 'Capture',
    isAvailable: () => true,
    synthesize: async (req) => {
      capturedReq = req
      return { audio: Buffer.from(''), format: 'mp3', text: req.text, provider: 'capture' }
    },
    listVoices: () => [],
  }
  engine.register(capturingProvider)
  await engine.speak('Test', { voice: 'nova', speed: 1.5 })
  assert.equal(capturedReq!.voice, 'nova', 'M2-T27a: voice passed')
  assert.equal(capturedReq!.speed, 1.5, 'M2-T27b: speed passed')
  console.log('  ✅ M2-T27: options passthrough (2 assertions)')
}

// T28: TTSEngine — speak 会预处理 markdown
{
  const engine = new TTSEngine()
  let capturedText = ''
  const textProvider: TTSProvider = {
    id: 'text-check',
    name: 'TextCheck',
    isAvailable: () => true,
    synthesize: async (req) => {
      capturedText = req.text
      return { audio: Buffer.from(''), format: 'mp3', text: req.text, provider: 'text-check' }
    },
    listVoices: () => [],
  }
  engine.register(textProvider)
  await engine.speak('## Title\n**Bold** text')
  assert.ok(!capturedText.includes('##'), 'M2-T28a: heading stripped')
  assert.ok(!capturedText.includes('**'), 'M2-T28b: bold stripped')
  assert.ok(capturedText.includes('Title'), 'M2-T28c: text preserved')
  console.log('  ✅ M2-T28: markdown preprocessing (3 assertions)')
}

// T29: TTSEngine — unregister
{
  const engine = new TTSEngine()
  engine.register(createMockTTSProvider())
  assert.equal(engine.size, 1, 'M2-T29a: size=1')
  engine.unregister('openai-tts')
  assert.equal(engine.size, 0, 'M2-T29b: size=0')
  console.log('  ✅ M2-T29: unregister (2 assertions)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// 总结
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n✅ Phase M: 全部通过 (78 assertions)')
