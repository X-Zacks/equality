/**
 * providers/failover-policy.ts — Failover 错误分类与策略矩阵
 *
 * Phase E2 (GAP-12): 将粗粒度 4 类分类细化为 9 类 FailoverReason，
 * 提供冷却管理、thinking 渐进降级和统一决策接口。
 *
 * 与现有 fallback.ts 的关系：
 *   原有 classifyError() 返回 'abort'|'fatal'|'fallback'|'skip'
 *   本模块将其扩展为精细化的 FailoverReason + FailoverDecision，
 *   FallbackProvider 改为调用本模块的 classify/decide 方法。
 */

// ─── 错误分类 ──────────────────────────────────────────────────────────────────

export type FailoverReason =
  | 'abort'           // 用户主动取消
  | 'context_overflow' // 上下文超限（交给 Compaction）
  | 'rate_limit'      // 429
  | 'overloaded'      // 5xx / 服务过载
  | 'auth'            // 401/403
  | 'billing'         // 402 / 余额不足
  | 'network'         // 网络错误 / DNS / 连接拒绝
  | 'timeout'         // 超时
  | 'model_not_found' // 模型不存在（跳过，不冷却）
  | 'fatal'           // 不可恢复的程序错误

export interface FailoverDecision {
  reason: FailoverReason
  shouldFailover: boolean
  /** 冷却时长（ms），0 = 不冷却 */
  cooldownMs: number
  /** 是否应该尝试降低 thinking 等级 */
  degradeThinking: boolean
}

// ─── 冷却常量 ──────────────────────────────────────────────────────────────────

export const COOLDOWN_RATE_LIMIT = 30_000    // 429: 30s
export const COOLDOWN_OVERLOADED = 15_000    // 5xx: 15s
export const COOLDOWN_NETWORK = 10_000       // 网络抖动: 10s
export const COOLDOWN_AUTH = 300_000         // auth 失败: 5min（provider 基本不可用）
export const COOLDOWN_BILLING = 600_000      // 余额不足: 10min

// ─── 分类函数 ──────────────────────────────────────────────────────────────────

/**
 * 将 LLM Provider 抛出的错误分类为 FailoverReason。
 */
export function classifyProviderError(err: unknown): FailoverReason {
  if (!err || typeof err !== 'object') return 'network'

  const e = err as Record<string, unknown>

  // 1. 用户取消
  if (e.name === 'AbortError') return 'abort'

  // 2. HTTP 状态码
  const status = typeof e.status === 'number' ? e.status : 0
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : ''

  // Context overflow
  if (
    code === 'context_length_exceeded' ||
    message.includes('context_length_exceeded') ||
    message.includes('maximum context length')
  ) {
    return 'context_overflow'
  }

  // Model not found (400 with specific messages)
  if (
    status === 400 && (
      message.includes('not supported') ||
      message.includes('does not exist') ||
      message.includes('model_not_found') ||
      code === 'model_not_found'
    )
  ) {
    return 'model_not_found'
  }

  // Other 400 — request malformed
  if (status === 400) return 'fatal'

  // Auth errors
  if (status === 401 || status === 403) return 'auth'

  // Billing
  if (
    status === 402 ||
    message.includes('insufficient_quota') ||
    message.includes('billing') ||
    message.includes('balance')
  ) {
    return 'billing'
  }

  // Rate limit
  if (status === 429 || message.includes('rate_limit') || message.includes('too many requests')) {
    return 'rate_limit'
  }

  // Server overloaded
  if (status >= 500) return 'overloaded'

  // Network errors
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    message.includes('fetch failed') ||
    message.includes('network')
  ) {
    return 'network'
  }

  // Timeout
  if (
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'timeout'
  }

  // 未知错误 → 当网络问题处理（保守策略：允许 failover）
  return 'network'
}

/**
 * 根据分类结果生成 failover 决策。
 */
export function decideFailover(reason: FailoverReason): FailoverDecision {
  switch (reason) {
    case 'abort':
      return { reason, shouldFailover: false, cooldownMs: 0, degradeThinking: false }

    case 'context_overflow':
      return { reason, shouldFailover: false, cooldownMs: 0, degradeThinking: false }

    case 'fatal':
      return { reason, shouldFailover: false, cooldownMs: 0, degradeThinking: false }

    case 'model_not_found':
      // 跳过该模型但不冷却 provider（可能还有其他模型可用）
      return { reason, shouldFailover: true, cooldownMs: 0, degradeThinking: false }

    case 'rate_limit':
      return { reason, shouldFailover: true, cooldownMs: COOLDOWN_RATE_LIMIT, degradeThinking: true }

    case 'overloaded':
      return { reason, shouldFailover: true, cooldownMs: COOLDOWN_OVERLOADED, degradeThinking: true }

    case 'auth':
      return { reason, shouldFailover: true, cooldownMs: COOLDOWN_AUTH, degradeThinking: false }

    case 'billing':
      return { reason, shouldFailover: true, cooldownMs: COOLDOWN_BILLING, degradeThinking: false }

    case 'network':
      return { reason, shouldFailover: true, cooldownMs: COOLDOWN_NETWORK, degradeThinking: false }

    case 'timeout':
      return { reason, shouldFailover: true, cooldownMs: COOLDOWN_NETWORK, degradeThinking: false }
  }
}

// ─── 冷却管理（实例化，非全局变量，便于测试）──────────────────────────────────

export class CooldownTracker {
  /** providerId → cooldownUntil (epoch ms) */
  private map = new Map<string, number>()

  setCooldown(providerId: string, durationMs: number): void {
    if (durationMs <= 0) return
    this.map.set(providerId, Date.now() + durationMs)
  }

  isInCooldown(providerId: string): boolean {
    const until = this.map.get(providerId)
    if (!until) return false
    if (Date.now() >= until) {
      this.map.delete(providerId)
      return false
    }
    return true
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}

// ─── Thinking 渐进降级 ─────────────────────────────────────────────────────────

export type ThinkingLevel = 'high' | 'medium' | 'low' | 'off'

const THINKING_DEGRADATION_ORDER: ThinkingLevel[] = ['high', 'medium', 'low', 'off']

/**
 * 获取下一个 thinking 降级等级。
 * 返回 null 表示已经到最低等级，无法继续降级。
 */
export function getNextThinkingLevel(current: ThinkingLevel): ThinkingLevel | null {
  const idx = THINKING_DEGRADATION_ORDER.indexOf(current)
  if (idx === -1 || idx >= THINKING_DEGRADATION_ORDER.length - 1) return null
  return THINKING_DEGRADATION_ORDER[idx + 1]
}

/**
 * 获取所有降级路径（从当前等级到 off）。
 */
export function getThinkingDegradationPath(current: ThinkingLevel): ThinkingLevel[] {
  const idx = THINKING_DEGRADATION_ORDER.indexOf(current)
  if (idx === -1) return []
  return THINKING_DEGRADATION_ORDER.slice(idx + 1)
}

// ─── 综合 Failover 策略（便于 FallbackProvider 使用）──────────────────────────

export class FailoverPolicy {
  readonly cooldown = new CooldownTracker()

  /**
   * 完整的 classify → decide 流程
   */
  evaluate(err: unknown): FailoverDecision {
    const reason = classifyProviderError(err)
    return decideFailover(reason)
  }

  /**
   * 应用冷却（在 FallbackProvider 中每次 failover 后调用）
   */
  applyCooldown(providerId: string, decision: FailoverDecision): void {
    if (decision.cooldownMs > 0) {
      this.cooldown.setCooldown(providerId, decision.cooldownMs)
    }
  }

  /**
   * 检查 provider 是否在冷却中
   */
  isAvailable(providerId: string): boolean {
    return !this.cooldown.isInCooldown(providerId)
  }
}
