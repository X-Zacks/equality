/**
 * FallbackProvider — 运行时模型降级链
 *
 * 实现 LLMProvider 接口，内部维护有序的 Provider 列表。
 * streamChat/chat 失败时，自动切到下一个可用 Provider。
 *
 * 错误分类：
 *   abort   — AbortError / 用户取消 → 不降级，直接抛出
 *   fatal   — context_length_exceeded / 401 / 403 → 不降级
 *   fallback — 429 / 5xx / 网络错误 / 超时 → 冷却 + 降级
 */

import type {
  LLMProvider,
  StreamChatParams,
  ChatDelta,
  ChatResponse,
  ProviderCapabilities,
} from './types.js'

// ─── 错误分类 ──────────────────────────────────────────────────────────────────

type ErrorClass = 'abort' | 'fatal' | 'fallback' | 'skip'

function classifyError(err: unknown): ErrorClass {
  if (!err || typeof err !== 'object') return 'fallback'

  const e = err as Record<string, unknown>

  // 1. 用户取消
  if (e.name === 'AbortError') return 'abort'

  // 2. OpenAI SDK 错误
  const status = typeof e.status === 'number' ? e.status : 0
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : ''

  // 401/403 — API Key 无效
  if (status === 401 || status === 403) return 'fatal'

  // 400 模型不支持 — 跳过该模型但不冷却 provider
  if (status === 400 && (
    message.includes('not supported') ||
    message.includes('does not exist') ||
    message.includes('model_not_found') ||
    code === 'model_not_found'
  )) return 'skip'

  // 其他 400 — 请求本身有问题，直接报错
  if (status === 400) return 'fatal'

  // Context overflow
  if (code === 'context_length_exceeded' || message.includes('context_length_exceeded')) {
    return 'fatal'
  }

  // 429 限流、5xx 服务错误 → 降级
  if (status === 429 || status >= 500) return 'fallback'

  // 网络错误
  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('ECONNRESET')
  ) {
    return 'fallback'
  }

  // 未知错误 → 尝试降级（保守策略）
  return 'fallback'
}

// ─── 冷却管理 ──────────────────────────────────────────────────────────────────

const COOLDOWN_SHORT = 30_000   // 429 / 5xx / 网络: 30s
const COOLDOWN_LONG = 300_000   // 401 / 403: 5min (标记在 fatal 分支不会触发降级，但备用)

/** providerId → cooldownUntil (epoch ms) */
const cooldownMap = new Map<string, number>()

function setCooldown(providerId: string, durationMs: number): void {
  cooldownMap.set(providerId, Date.now() + durationMs)
}

function isInCooldown(providerId: string): boolean {
  const until = cooldownMap.get(providerId)
  if (!until) return false
  if (Date.now() >= until) {
    cooldownMap.delete(providerId)
    return false
  }
  return true
}

// ─── FallbackProvider ──────────────────────────────────────────────────────────

export class FallbackProvider implements LLMProvider {
  readonly providerId: string
  readonly modelId: string

  private readonly providers: LLMProvider[]

  constructor(providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error('No LLM provider configured. Please set an API key in Settings.')
    }
    this.providers = providers
    // 对外暴露第一个 provider 的 ID（逻辑主 Provider）
    this.providerId = providers[0].providerId
    this.modelId = providers[0].modelId
  }

  getCapabilities(): ProviderCapabilities {
    return this.providers[0].getCapabilities()
  }

  estimateTokens(text: string): number {
    return this.providers[0].estimateTokens(text)
  }

  // ─── streamChat：首次 yield 前失败 → 降级 ──────────────────────────────────

  async *streamChat(params: StreamChatParams): AsyncGenerator<ChatDelta> {
    const errors: Array<{ providerId: string; error: unknown }> = []

    for (const provider of this.providers) {
      // 跳过冷却中的 Provider
      if (isInCooldown(provider.providerId)) {
        console.log(`[fallback] 跳过冷却中的 ${provider.providerId}`)
        continue
      }

      try {
        let hasYielded = false
        const gen = provider.streamChat(params)

        for await (const delta of gen) {
          hasYielded = true
          yield delta
        }

        // 成功完成，直接返回
        return
      } catch (err) {
        const cls = classifyError(err)

        // 不可降级 → 直接抛出
        if (cls === 'abort' || cls === 'fatal') {
          throw err
        }

        // 模型不支持（如 400 model not supported）→ 跳过该模型，不冷却整个 provider
        if (cls === 'skip') {
          console.warn(
            `[fallback] ${provider.providerId}/${provider.modelId} 模型不支持, 跳过`,
            err instanceof Error ? err.message : err,
          )
          continue
        }

        // 可降级：记录 + 冷却
        console.warn(
          `[fallback] ${provider.providerId}/${provider.modelId} 失败 (${cls}), 切换到下一个`,
          err instanceof Error ? err.message : err,
        )
        setCooldown(provider.providerId, COOLDOWN_SHORT)
        errors.push({ providerId: provider.providerId, error: err })
        // 继续尝试下一个 Provider
      }
    }

    // 所有 Provider 均失败
    if (errors.length === 0) {
      // 所有 provider 均在冷却期，一个都没尝试
      const cooling = this.providers.map(p => p.providerId).join(', ')
      throw new Error(`所有模型均处于冷却期 (${cooling})，请稍候 30 秒后重试。`)
    }
    // 把每个 provider 的真实错误一并暴露出来，方便排查
    const detail = errors
      .map(e => `${e.providerId}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
      .join(' | ')
    throw new Error(`所有模型均不可用。\n${detail}`)
  }

  // ─── chat：非流式，逐个尝试 ────────────────────────────────────────────────

  async chat(params: StreamChatParams): Promise<ChatResponse> {
    const errors: Array<{ providerId: string; error: unknown }> = []

    for (const provider of this.providers) {
      if (isInCooldown(provider.providerId)) {
        console.log(`[fallback] 跳过冷却中的 ${provider.providerId}`)
        continue
      }

      try {
        return await provider.chat(params)
      } catch (err) {
        const cls = classifyError(err)

        if (cls === 'abort' || cls === 'fatal') {
          throw err
        }

        if (cls === 'skip') {
          console.warn(
            `[fallback] ${provider.providerId}/${provider.modelId} 模型不支持 (chat), 跳过`,
            err instanceof Error ? err.message : err,
          )
          continue
        }

        console.warn(
          `[fallback] ${provider.providerId}/${provider.modelId} chat 失败 (${cls}), 切换到下一个`,
          err instanceof Error ? err.message : err,
        )
        setCooldown(provider.providerId, COOLDOWN_SHORT)
        errors.push({ providerId: provider.providerId, error: err })
      }
    }

    if (errors.length === 0) {
      const cooling = this.providers.map(p => p.providerId).join(', ')
      throw new Error(`所有模型均处于冷却期 (${cooling})，请稍候 30 秒后重试。`)
    }
    const detail = errors
      .map(e => `${e.providerId}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
      .join(' | ')
    throw new Error(`所有模型均不可用。\n${detail}`)
  }
}
