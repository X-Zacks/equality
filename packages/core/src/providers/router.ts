/**
 * 智能模型路由 — Phase 10
 *
 * 根据用户消息的复杂度自动选择合适的模型 tier，
 * 支持 @model 覆盖语法，路由结果通过 FallbackProvider 包装。
 */

import { FallbackProvider } from './fallback.js'
import type { LLMProvider } from './types.js'
import {
  createCopilotProvider,
  createDeepSeekProvider,
  createQwenProvider,
  createVolcProvider,
  getProviderWithFallback,
  getProviderById,
} from './index.js'
import { hasSecret } from '../config/secrets.js'
import { isCopilotLoggedIn } from './copilot-auth.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type Tier = 'light' | 'standard' | 'heavy'

export interface ModelPreference {
  provider: string
  model?: string  // undefined = 使用 Provider 默认模型
}

export interface RouteResult {
  provider: LLMProvider
  tier: Tier
  strippedMessage: string  // 去掉 @model 后的用户消息
  overridden: boolean       // 是否被 @model 覆盖
}

// ─── 路由表 ───────────────────────────────────────────────────────────────────

const MODEL_TIERS: Record<Tier, ModelPreference[]> = {
  light: [
    { provider: 'copilot', model: 'gpt-4o' },
    { provider: 'copilot', model: 'gpt-4.1-mini' },
    { provider: 'copilot', model: 'o4-mini' },
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-turbo' },
    { provider: 'volc' },
  ],
  standard: [
    { provider: 'copilot', model: 'gpt-5.2' },
    { provider: 'copilot', model: 'gpt-4.1' },
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-plus' },
    { provider: 'volc' },
  ],
  heavy: [
    { provider: 'copilot', model: 'gpt-5.4' },
    { provider: 'copilot', model: 'claude-sonnet-4' },
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-max' },
    { provider: 'volc' },
  ],
}

// ─── Provider 可用性检查 ─────────────────────────────────────────────────────

function isProviderConfigured(id: string): boolean {
  switch (id) {
    case 'custom': return hasSecret('CUSTOM_API_KEY') && hasSecret('CUSTOM_BASE_URL')
    case 'copilot': return isCopilotLoggedIn()
    case 'deepseek': return hasSecret('DEEPSEEK_API_KEY')
    case 'qwen': return hasSecret('QWEN_API_KEY')
    case 'volc': return hasSecret('VOLC_API_KEY')
    default: return false
  }
}

function createProviderByIdAndModel(id: string, model?: string): LLMProvider | null {
  try {
    if (!isProviderConfigured(id)) return null
    return getProviderById(id, model)
  } catch {
    return null
  }
}

// ─── 复杂度分类器 ─────────────────────────────────────────────────────────────

/**
 * Heavy 关键词（中/英）
 * 匹配时提升到 heavy tier
 */
const HEAVY_KEYWORDS = [
  // 中文
  '重构', '重写', '分析所有', '写一个完整', '写一套', '全部改成',
  '设计架构', '性能优化', '安全审计', '代码审查', '迁移方案',
  // 英文
  'refactor', 'rewrite', 'analyze all', 'write a complete', 'full implementation',
  'architecture', 'performance optimization', 'security audit', 'migration plan',
]

/**
 * Light 关键词（短对话/闲聊/简单查询）
 */
const LIGHT_PATTERNS = [
  /^(你好|hi|hello|hey|嗨|早上好|晚上好|下午好)\s*[!！。.]?\s*$/i,
  /^(几点|时间|日期|天气|谢谢|thanks|thank you)\s*[?？。!！]?\s*$/i,
  /^(是的?|对|好的?|ok|yes|no|不是?|嗯)\s*[。!！]?\s*$/i,
]

export function classifyComplexity(
  message: string,
  historyLength = 0,
): Tier {
  const text = message.trim()
  const len = text.length

  // 规则 1：超长消息 → heavy
  if (len > 2000) return 'heavy'

  // 规则 2：heavy 关键词
  const lower = text.toLowerCase()
  for (const kw of HEAVY_KEYWORDS) {
    if (lower.includes(kw)) return 'heavy'
  }

  // 规则 3：包含代码块 → standard
  if (text.includes('```') || text.includes('~~~')) return 'standard'

  // 规则 4：包含多个文件路径 → standard
  const pathMatches = text.match(/[A-Za-z]:\\[\w\\./]+|\/[\w./]+\.\w+/g)
  if (pathMatches && pathMatches.length >= 2) return 'standard'

  // 规则 5：对话超 20 轮 → standard（上下文管理需更强模型）
  if (historyLength > 20) return 'standard'

  // 规则 6：短消息 + 匹配 light 模式 → light
  if (len <= 100) {
    for (const pat of LIGHT_PATTERNS) {
      if (pat.test(text)) return 'light'
    }
  }

  // 规则 7：非常短且没有代码/路径/关键词 → light
  if (len <= 50 && !text.includes('```') && !/[A-Za-z]:\\/.test(text)) {
    return 'light'
  }

  // 默认 → standard
  return 'standard'
}

// ─── @model 覆盖解析 ─────────────────────────────────────────────────────────

/**
 * 已知模型 ID → (provider, model) 映射
 * 用于将 @gpt-4o 解析为 copilot/gpt-4o
 */
const MODEL_TO_PROVIDER: Record<string, { provider: string; model: string }> = {
  // Copilot 模型
  'gpt-4o': { provider: 'copilot', model: 'gpt-4o' },
  'gpt-4.1': { provider: 'copilot', model: 'gpt-4.1' },
  'gpt-4.1-mini': { provider: 'copilot', model: 'gpt-4.1-mini' },
  'gpt-5.1': { provider: 'copilot', model: 'gpt-5.1' },
  'gpt-5.2': { provider: 'copilot', model: 'gpt-5.2' },
  'gpt-5.4': { provider: 'copilot', model: 'gpt-5.4' },
  'o3-mini': { provider: 'copilot', model: 'o3-mini' },
  'o4-mini': { provider: 'copilot', model: 'o4-mini' },
  'claude-sonnet-4': { provider: 'copilot', model: 'claude-sonnet-4' },
  'claude-3.5-sonnet': { provider: 'copilot', model: 'claude-3.5-sonnet' },
  'gemini-2.0-flash-001': { provider: 'copilot', model: 'gemini-2.0-flash-001' },
  // DeepSeek
  'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat' },
  'deepseek-reasoner': { provider: 'deepseek', model: 'deepseek-reasoner' },
  // Qwen
  'qwen-plus': { provider: 'qwen', model: 'qwen-plus' },
  'qwen-turbo': { provider: 'qwen', model: 'qwen-turbo' },
  'qwen-max': { provider: 'qwen', model: 'qwen-max' },
  // Volc
  'doubao-seed-1-6-250615': { provider: 'volc', model: 'doubao-seed-1-6-250615' },
}

export interface ModelOverride {
  provider: string
  model: string
  strippedMessage: string
}

/**
 * 解析消息开头的 @model-name 语法。
 * 返回 null 如果没有匹配到。
 */
export function parseModelOverride(message: string): ModelOverride | null {
  const match = message.match(/^@([\w.\-]+)\s+/)
  if (!match) return null

  const modelName = match[1].toLowerCase()
  const lookup = MODEL_TO_PROVIDER[modelName]
  if (!lookup) return null

  return {
    provider: lookup.provider,
    model: lookup.model,
    strippedMessage: message.slice(match[0].length).trim(),
  }
}

// ─── 主路由函数 ───────────────────────────────────────────────────────────────

/**
 * 根据用户消息自动路由到合适的模型。
 *
 * 优先级：
 * 1. params.provider（测试注入）→ 直接使用
 * 2. @model 覆盖语法 → 强制指定
 * 3. 复杂度分类 → 查路由表 → 第一个已配置的
 * 4. 全部失败 → 回退到 getProviderWithFallback()
 */
export function routeModel(
  userMessage: string,
  explicitProvider?: LLMProvider,
  historyLength = 0,
): RouteResult {
  // 1. 测试注入 → 直接用
  if (explicitProvider) {
    return {
      provider: explicitProvider,
      tier: 'standard',
      strippedMessage: userMessage,
      overridden: false,
    }
  }

  // 2. @model 覆盖
  const override = parseModelOverride(userMessage)
  if (override) {
    const p = createProviderByIdAndModel(override.provider, override.model)
    if (p) {
      console.log(`[router] @model 覆盖: ${override.provider}/${override.model}`)
      // 用 FallbackProvider 包装单个 provider 以享受错误处理
      return {
        provider: new FallbackProvider([p]),
        tier: 'standard',
        strippedMessage: override.strippedMessage,
        overridden: true,
      }
    }
    console.warn(`[router] @${override.model} 指定的 Provider 未配置，回退到自动路由`)
  }

  // 3. 复杂度分类 + 路由表
  const msg = override?.strippedMessage ?? userMessage
  const tier = classifyComplexity(msg, historyLength)
  const preferences = MODEL_TIERS[tier]

  const providers: LLMProvider[] = []
  for (const pref of preferences) {
    const p = createProviderByIdAndModel(pref.provider, pref.model)
    if (p) providers.push(p)
  }

  if (providers.length > 0) {
    console.log(`[router] tier=${tier}, 路由到 ${providers[0].providerId}/${providers[0].modelId} (${providers.length} providers in fallback)`)
    return {
      provider: new FallbackProvider(providers),
      tier,
      strippedMessage: msg,
      overridden: false,
    }
  }

  // 4. 全部失败 → 回退
  console.warn(`[router] 路由表无可用 Provider, 回退到 getProviderWithFallback()`)
  return {
    provider: getProviderWithFallback(),
    tier: 'standard',
    strippedMessage: msg,
    overridden: false,
  }
}
