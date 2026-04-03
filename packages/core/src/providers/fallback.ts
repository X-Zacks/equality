/**
 * FallbackProvider — 运行时模型降级链
 *
 * 实现 LLMProvider 接口，内部维护有序的 Provider 列表。
 * streamChat/chat 失败时，自动切到下一个可用 Provider。
 *
 * Phase E2: 接入 FailoverPolicy 进行精细化错误分类与冷却管理。
 *   abort / context_overflow / fatal → 不降级，直接抛出
 *   model_not_found → 跳过，不冷却
 *   rate_limit / overloaded / network / timeout / auth / billing → 按策略冷却 + 降级
 */

import type {
  LLMProvider,
  StreamChatParams,
  ChatDelta,
  ChatResponse,
  ProviderCapabilities,
} from './types.js'
import { FailoverPolicy } from './failover-policy.js'
import type { FailoverDecision, FailoverReason } from './failover-policy.js'

// ─── FallbackProvider ──────────────────────────────────────────────────────────

/** Callback for when a model switch occurs */
export type OnModelSwitch = (info: { fromProvider: string; toProvider: string; reason: FailoverReason }) => void

export class FallbackProvider implements LLMProvider {
  readonly providerId: string
  readonly modelId: string

  private readonly providers: LLMProvider[]
  private readonly policy: FailoverPolicy
  private readonly onModelSwitch?: OnModelSwitch

  constructor(providers: LLMProvider[], opts?: { policy?: FailoverPolicy; onModelSwitch?: OnModelSwitch }) {
    if (providers.length === 0) {
      throw new Error('No LLM provider configured. Please set an API key in Settings.')
    }
    this.providers = providers
    this.policy = opts?.policy ?? new FailoverPolicy()
    this.onModelSwitch = opts?.onModelSwitch
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
    const errors: Array<{ providerId: string; error: unknown; reason: FailoverReason }> = []
    let lastProvider: string | undefined

    for (const provider of this.providers) {
      // 跳过冷却中的 Provider
      if (!this.policy.isAvailable(provider.providerId)) {
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
        const decision = this.policy.evaluate(err)

        // 不可降级 → 直接抛出
        if (!decision.shouldFailover) {
          throw err
        }

        // 模型不支持 → 跳过，不冷却
        if (decision.reason === 'model_not_found') {
          console.warn(
            `[fallback] ${provider.providerId}/${provider.modelId} 模型不支持, 跳过`,
            err instanceof Error ? err.message : err,
          )
          errors.push({ providerId: provider.providerId, error: err, reason: decision.reason })
          continue
        }

        // 可降级：记录 + 冷却
        console.warn(
          `[fallback] ${provider.providerId}/${provider.modelId} 失败 (${decision.reason}), 冷却 ${decision.cooldownMs}ms, 切换到下一个`,
          err instanceof Error ? err.message : err,
        )
        this.policy.applyCooldown(provider.providerId, decision)
        lastProvider = provider.providerId
        errors.push({ providerId: provider.providerId, error: err, reason: decision.reason })

        // 通知模型切换
        if (this.onModelSwitch) {
          const nextProvider = this.providers.find(
            p => p.providerId !== provider.providerId && this.policy.isAvailable(p.providerId),
          )
          if (nextProvider) {
            this.onModelSwitch({
              fromProvider: `${provider.providerId}/${provider.modelId}`,
              toProvider: `${nextProvider.providerId}/${nextProvider.modelId}`,
              reason: decision.reason,
            })
          }
        }
      }
    }

    // 所有 Provider 均失败
    if (errors.length === 0) {
      // 所有 provider 均在冷却期，一个都没尝试
      const cooling = this.providers.map(p => p.providerId).join(', ')
      throw new Error(`所有模型均处于冷却期 (${cooling})，请稍候重试。`)
    }
    const detail = errors
      .map(e => `${e.providerId} [${e.reason}]: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
      .join(' | ')
    throw new Error(`所有模型均不可用。\n${detail}`)
  }

  // ─── chat：非流式，逐个尝试 ────────────────────────────────────────────────

  async chat(params: StreamChatParams): Promise<ChatResponse> {
    const errors: Array<{ providerId: string; error: unknown; reason: FailoverReason }> = []

    for (const provider of this.providers) {
      if (!this.policy.isAvailable(provider.providerId)) {
        console.log(`[fallback] 跳过冷却中的 ${provider.providerId}`)
        continue
      }

      try {
        return await provider.chat(params)
      } catch (err) {
        const decision = this.policy.evaluate(err)

        if (!decision.shouldFailover) {
          throw err
        }

        if (decision.reason === 'model_not_found') {
          console.warn(
            `[fallback] ${provider.providerId}/${provider.modelId} 模型不支持 (chat), 跳过`,
            err instanceof Error ? err.message : err,
          )
          errors.push({ providerId: provider.providerId, error: err, reason: decision.reason })
          continue
        }

        console.warn(
          `[fallback] ${provider.providerId}/${provider.modelId} chat 失败 (${decision.reason}), 冷却 ${decision.cooldownMs}ms, 切换到下一个`,
          err instanceof Error ? err.message : err,
        )
        this.policy.applyCooldown(provider.providerId, decision)
        errors.push({ providerId: provider.providerId, error: err, reason: decision.reason })
      }
    }

    if (errors.length === 0) {
      const cooling = this.providers.map(p => p.providerId).join(', ')
      throw new Error(`所有模型均处于冷却期 (${cooling})，请稍候重试。`)
    }
    const detail = errors
      .map(e => `${e.providerId} [${e.reason}]: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
      .join(' | ')
    throw new Error(`所有模型均不可用。\n${detail}`)
  }
}
