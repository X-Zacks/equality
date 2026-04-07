/**
 * tts/types.ts — TTS 类型定义
 *
 * Phase M2 (GAP-31): 语音合成统一接口。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TTSRequest {
  text: string
  voice?: string        // provider-specific voice id
  speed?: number        // 0.25 - 4.0, default 1.0
  language?: string     // BCP 47 语言标签
  model?: string        // e.g. 'tts-1', 'tts-1-hd'
}

export interface TTSResult {
  audio: Buffer | null       // 音频数据（null = 前端 fallback）
  format: 'mp3' | 'wav' | 'speech-api'
  text: string               // 预处理后的文本
  provider: string           // provider id
  durationMs?: number
}

export interface TTSVoice {
  id: string
  name: string
  language: string
}

export interface TTSProvider {
  readonly id: string
  readonly name: string
  isAvailable(): boolean | Promise<boolean>
  synthesize(request: TTSRequest): Promise<TTSResult>
  listVoices(): TTSVoice[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * OpenAI 支持的 TTS 语音
 */
export const OPENAI_TTS_VOICES: readonly string[] = [
  'alloy',
  'echo',
  'fable',
  'onyx',
  'nova',
  'shimmer',
] as const

/**
 * 默认 TTS 配置
 */
export const TTS_DEFAULTS = {
  voice: 'alloy',
  speed: 1.0,
  model: 'tts-1',
  maxTextLength: 4096,
} as const
