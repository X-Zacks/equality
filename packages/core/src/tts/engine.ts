/**
 * tts/engine.ts — TTS 引擎
 *
 * Phase M2 (GAP-31): 管理 TTS provider + 文本预处理 + fallback。
 */

import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from './types.js'
import { TTS_DEFAULTS } from './types.js'
import { prepareText } from './text-prep.js'

// ─── TTSEngine ──────────────────────────────────────────────────────────────

export class TTSEngine {
  private providers = new Map<string, TTSProvider>()
  private order: string[] = []

  /**
   * 注册 TTS provider。
   */
  register(provider: TTSProvider): void {
    this.providers.set(provider.id, provider)
    if (!this.order.includes(provider.id)) {
      this.order.push(provider.id)
    }
  }

  /**
   * 移除 TTS provider。
   */
  unregister(providerId: string): boolean {
    const existed = this.providers.delete(providerId)
    this.order = this.order.filter(id => id !== providerId)
    return existed
  }

  /**
   * 自动选择第一个可用 provider。
   */
  async getDefaultProvider(): Promise<TTSProvider | null> {
    for (const id of this.order) {
      const p = this.providers.get(id)
      if (p && await p.isAvailable()) return p
    }
    return null
  }

  /**
   * 合成语音。
   *
   * 1. 预处理文本（markdown 清理 + 截断）
   * 2. 选择 provider
   * 3. 如无可用 provider → 返回前端 fallback (speech-api)
   */
  async speak(text: string, options?: Partial<TTSRequest>): Promise<TTSResult> {
    const prepared = prepareText(text, TTS_DEFAULTS.maxTextLength)

    const provider = await this.getDefaultProvider()

    if (!provider) {
      // 前端 fallback
      return {
        audio: null,
        format: 'speech-api',
        text: prepared,
        provider: 'speech-api',
      }
    }

    const request: TTSRequest = {
      text: prepared,
      voice: options?.voice ?? TTS_DEFAULTS.voice,
      speed: options?.speed ?? TTS_DEFAULTS.speed,
      model: options?.model ?? TTS_DEFAULTS.model,
      language: options?.language,
    }

    return provider.synthesize(request)
  }

  /**
   * 列出所有 provider 的可用语音。
   */
  listVoices(): TTSVoice[] {
    const voices: TTSVoice[] = []
    for (const p of this.providers.values()) {
      voices.push(...p.listVoices())
    }
    return voices
  }

  /**
   * 已注册 provider 数量。
   */
  get size(): number {
    return this.providers.size
  }
}
