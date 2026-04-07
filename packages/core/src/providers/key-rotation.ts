/**
 * providers/key-rotation.ts — API Key 轮换
 *
 * Phase H3 (GAP-20): 同一 Provider 多 API Key 依次尝试，rate limit 时自动切换。
 *
 * 参考 OpenClaw api-key-rotation.ts（73 行）的设计：
 *   - executeWithKeyRotation<T>() 泛型包装
 *   - 去重 + 空值过滤
 *   - 默认只在 rate_limit 时轮换
 *   - collectProviderKeys() 从环境变量收集
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KeyRetryParams {
  key: string
  error: unknown
  attempt: number
  message: string
}

export interface KeyRotationOptions<T> {
  /** Provider 名称（用于日志和错误信息） */
  provider: string
  /** API Key 列表（会自动去重和过滤空值） */
  keys: string[]
  /** 使用指定 key 执行请求 */
  execute: (key: string) => Promise<T>
  /** 判断是否应该换 key 重试（默认：rate limit 时重试） */
  shouldRetry?: (params: KeyRetryParams) => boolean
  /** 换 key 重试时的回调（日志/通知） */
  onRetry?: (params: KeyRetryParams) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * 去重 + 空值过滤。
 */
export function dedupeKeys(raw: string[]): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const value of raw) {
    const key = value.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

/**
 * 判断错误消息是否为 rate limit 错误。
 */
export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('429') ||
    lower.includes('rate_limit') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota exceeded')
  )
}

/**
 * 从环境变量收集指定 Provider 的所有可用 API Key。
 *
 * 命名约定：
 *   {PROVIDER}_API_KEY      — 主 key
 *   {PROVIDER}_API_KEY_1    — 额外 key
 *   {PROVIDER}_API_KEY_2    — 额外 key
 *   ...
 *
 * Provider 名称转大写 + 下划线（如 "openai" → "OPENAI"）
 */
export function collectProviderKeys(provider: string, primaryKey?: string): string[] {
  const prefix = provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  const raw: string[] = []

  // 主 key
  if (primaryKey) raw.push(primaryKey)

  // 环境变量主 key
  const envMain = process.env[`${prefix}_API_KEY`]
  if (envMain) raw.push(envMain)

  // 编号 key: _1, _2, ...
  for (let i = 1; i <= 20; i++) {
    const envKey = process.env[`${prefix}_API_KEY_${i}`]
    if (envKey) {
      raw.push(envKey)
    } else {
      break // 连续编号断开即停止
    }
  }

  return dedupeKeys(raw)
}

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * 使用多个 API Key 依次尝试执行请求。
 *
 * 默认在 rate limit (429) 错误时轮换到下一个 key。
 * 其他错误（auth/billing/fatal）不轮换。
 */
export async function executeWithKeyRotation<T>(
  opts: KeyRotationOptions<T>,
): Promise<T> {
  const keys = dedupeKeys(opts.keys)

  if (keys.length === 0) {
    throw new Error(`No API keys configured for provider "${opts.provider}".`)
  }

  let lastError: unknown

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[attempt]
    try {
      return await opts.execute(key)
    } catch (error) {
      lastError = error

      const message = error instanceof Error ? error.message : String(error)
      const retryable = opts.shouldRetry
        ? opts.shouldRetry({ key, error, attempt, message })
        : isRateLimitError(message)

      // 最后一个 key 或不可重试 → 不再尝试
      if (!retryable || attempt + 1 >= keys.length) {
        break
      }

      // 通知回调
      opts.onRetry?.({ key, error, attempt, message })
    }
  }

  if (lastError === undefined) {
    throw new Error(`Failed to run API request for ${opts.provider}.`)
  }
  throw lastError
}
