/**
 * providers/context-window.ts — Context Window 大小解析
 *
 * Phase G3 (GAP-25): 按 provider + model 组合解析正确的 context window 大小。
 * 替代硬编码值，影响 compaction 阈值、tool result 截断、image 预算。
 *
 * 解析优先级链：
 *   1. 配置覆盖（CONTEXT_WINDOW_OVERRIDE 环境变量）
 *   2. 模型查表（MODEL_CONTEXT_WINDOWS）
 *   3. Provider 报告（provider.getCapabilities().contextWindow）
 *   4. 默认兜底（128K）
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContextWindowSource = 'config' | 'model_table' | 'provider' | 'default'

export interface ContextWindowInfo {
  tokens: number
  source: ContextWindowSource
}

export interface ContextWindowGuardResult extends ContextWindowInfo {
  shouldWarn: boolean
  shouldBlock: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_CONTEXT_WINDOW = 128_000
export const CONTEXT_WINDOW_HARD_MIN = 4_000
export const CONTEXT_WINDOW_WARN_BELOW = 16_000

// ─── Model Context Window Table ─────────────────────────────────────────────

/**
 * 已知模型的 context window 大小（tokens）。
 * 键为模型 ID 前缀，匹配规则：精确 > 前缀。
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4-1': 1_047_576,
  'gpt-4.1': 1_047_576,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'o1': 200_000,
  'o1-mini': 128_000,
  'o1-pro': 200_000,
  'o3': 200_000,
  'o3-mini': 200_000,
  'o4-mini': 200_000,

  // Anthropic
  'claude-3-5-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-opus': 200_000,
  'claude-3-haiku': 200_000,
  'claude-3-sonnet': 200_000,
  'claude-4-sonnet': 200_000,
  'claude-4-opus': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-opus-4': 200_000,

  // Google
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.5-pro': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-1.5-pro': 2_097_152,
  'gemini-1.5-flash': 1_048_576,

  // DeepSeek
  'deepseek-chat': 64_000,
  'deepseek-coder': 64_000,
  'deepseek-reasoner': 64_000,

  // Qwen
  'qwen-max': 32_768,
  'qwen-plus': 131_072,
  'qwen-turbo': 131_072,
  'qwen3': 131_072,
  'qwen2.5': 131_072,

  // GitHub Copilot
  'copilot-gpt-4o': 128_000,
  'copilot-claude-3.5-sonnet': 200_000,

  // MiniMax
  'MiniMax-M2.7': 1_000_000,
  'MiniMax-M1': 1_000_000,
  'minimax': 1_000_000,
}

// ─── Resolution ─────────────────────────────────────────────────────────────

/**
 * 从模型查表中查找 context window。
 * 先尝试精确匹配，再尝试前缀匹配（最长前缀优先）。
 */
export function lookupModelContextWindow(modelId: string): number | null {
  // 精确匹配
  if (MODEL_CONTEXT_WINDOWS[modelId] !== undefined) {
    return MODEL_CONTEXT_WINDOWS[modelId]
  }

  // 前缀匹配（最长前缀优先）
  const normalized = modelId.toLowerCase()
  let bestMatch: string | null = null
  let bestLen = 0

  for (const key of Object.keys(MODEL_CONTEXT_WINDOWS)) {
    const lk = key.toLowerCase()
    if (normalized.startsWith(lk) && lk.length > bestLen) {
      bestMatch = key
      bestLen = lk.length
    }
  }

  return bestMatch ? MODEL_CONTEXT_WINDOWS[bestMatch] : null
}

/**
 * 解析 context window 大小。
 *
 * 优先级：configOverride > 模型查表 > providerReported > 默认兜底。
 */
export function resolveContextWindow(params: {
  modelId: string
  providerReported?: number
  configOverride?: number
}): ContextWindowInfo {
  // 1. 配置覆盖
  if (params.configOverride && params.configOverride > 0) {
    return { tokens: params.configOverride, source: 'config' }
  }

  // 2. 模型查表
  const fromTable = lookupModelContextWindow(params.modelId)
  if (fromTable !== null) {
    return { tokens: fromTable, source: 'model_table' }
  }

  // 3. Provider 报告
  if (params.providerReported && params.providerReported > 0) {
    return { tokens: params.providerReported, source: 'provider' }
  }

  // 4. 默认兜底
  return { tokens: DEFAULT_CONTEXT_WINDOW, source: 'default' }
}

/**
 * 评估 context window 是否过小。
 */
export function evaluateContextWindowGuard(info: ContextWindowInfo): ContextWindowGuardResult {
  return {
    ...info,
    shouldWarn: info.tokens > 0 && info.tokens < CONTEXT_WINDOW_WARN_BELOW,
    shouldBlock: info.tokens > 0 && info.tokens < CONTEXT_WINDOW_HARD_MIN,
  }
}
