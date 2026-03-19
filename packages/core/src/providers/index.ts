import { OpenAICompatProvider } from './base.js'
import { CopilotProvider } from './copilot.js'
import { FallbackProvider } from './fallback.js'
import type { LLMProvider } from './types.js'
import { getSecret, hasSecret } from '../config/secrets.js'
import { isCopilotLoggedIn } from './copilot-auth.js'

// ─── Provider 工厂函数 ─────────────────────────────────────────────────────────

export function createDeepSeekProvider(model = 'deepseek-chat'): LLMProvider {
  const apiKey = getSecret('DEEPSEEK_API_KEY')
  return new OpenAICompatProvider({
    providerId: 'deepseek',
    modelId: model,
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
    capabilities: {
      contextWindow: 64_000,
      supportsToolCalling: model !== 'deepseek-reasoner',
      supportsThinking: model === 'deepseek-reasoner',
    },
  })
}

export function createQwenProvider(model = 'qwen-plus'): LLMProvider {
  const apiKey = getSecret('QWEN_API_KEY')
  return new OpenAICompatProvider({
    providerId: 'qwen',
    modelId: model,
    apiKey,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    capabilities: {
      contextWindow: 131_072,
      supportsToolCalling: true,
    },
  })
}

export function createVolcProvider(model = 'doubao-seed-1-6-250615'): LLMProvider {
  const apiKey = getSecret('VOLC_API_KEY')
  return new OpenAICompatProvider({
    providerId: 'volc',
    modelId: model,
    apiKey,
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    capabilities: {
      contextWindow: 128_000,
      supportsToolCalling: true,
    },
  })
}

/** GitHub Copilot Provider */
export function createCopilotProvider(): LLMProvider {
  if (!isCopilotLoggedIn()) throw new Error('Secret not configured: GITHUB_TOKEN')
  const model = hasSecret('COPILOT_MODEL') ? getSecret('COPILOT_MODEL') : 'gpt-4o'
  return new CopilotProvider(model)
}

export function createMiniMaxProvider(model = 'MiniMax-M2.5'): LLMProvider {
  const apiKey = getSecret('MINIMAX_API_KEY')
  return new OpenAICompatProvider({
    providerId: 'minimax',
    modelId: model,
    apiKey,
    baseURL: 'https://api.minimaxi.com/v1',
    capabilities: {
      contextWindow: 1_000_000,
      supportsToolCalling: true,
      supportsVision: model.includes('VL') || model.includes('M2.7'),
    },
  })
}

/** 自定义 OpenAI 兼容端点 */
export function createCustomProvider(): LLMProvider {
  const apiKey = getSecret('CUSTOM_API_KEY')
  const baseURL = getSecret('CUSTOM_BASE_URL')
  const model = hasSecret('CUSTOM_MODEL') ? getSecret('CUSTOM_MODEL') : 'gpt-4o'
  return new OpenAICompatProvider({
    providerId: 'custom',
    modelId: model,
    apiKey,
    baseURL,
  })
}

// ─── Provider Registry ─────────────────────────────────────────────────────────

export interface ProviderInfo {
  id: string
  name: string
  configured: boolean
  active: boolean
  models: string[]
}

const PROVIDER_ORDER: Array<{
  id: string
  name: string
  factory: () => LLMProvider
  isConfigured: () => boolean
  models: string[]
}> = [
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    factory: createCopilotProvider,
    isConfigured: () => isCopilotLoggedIn(),
    models: ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-5.1', 'gpt-5.2', 'gpt-5.4', 'o3-mini', 'o4-mini', 'claude-sonnet-4', 'claude-3.5-sonnet', 'gemini-2.0-flash-001'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    factory: createDeepSeekProvider,
    isConfigured: () => hasSecret('DEEPSEEK_API_KEY'),
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'qwen',
    name: '通义千问',
    factory: createQwenProvider,
    isConfigured: () => hasSecret('QWEN_API_KEY'),
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  },
  {
    id: 'volc',
    name: '火山引擎（豆包）',
    factory: createVolcProvider,
    isConfigured: () => hasSecret('VOLC_API_KEY'),
    models: ['doubao-seed-1-6-250615'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    factory: createMiniMaxProvider,
    isConfigured: () => hasSecret('MINIMAX_API_KEY'),
    models: ['MiniMax-M2.5', 'MiniMax-M2.7'],
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容',
    factory: createCustomProvider,
    isConfigured: () => hasSecret('CUSTOM_API_KEY') && hasSecret('CUSTOM_BASE_URL'),
    models: [],  // 用户自定义，仅主动选择时使用
  },
]

/** 列出所有 Provider 及其配置状态 */
export function listProviders(activeProviderId?: string): ProviderInfo[] {
  return PROVIDER_ORDER.map(p => ({
    id: p.id,
    name: p.name,
    configured: p.isConfigured(),
    active: p.id === activeProviderId,
    models: p.models,
  }))
}

/** 根据配置返回默认 Provider：Copilot > DeepSeek > Qwen > Volc > Custom */
export function getDefaultProvider(): LLMProvider {
  for (const entry of PROVIDER_ORDER) {
    try {
      return entry.factory()
    } catch {
      // API Key 未配置，跳过
    }
  }
  throw new Error('No LLM provider configured. Please set an API key in Settings.')
}

/** 按 ID 获取指定 Provider */
export function getProviderById(id: string, model?: string): LLMProvider {
  const entry = PROVIDER_ORDER.find(p => p.id === id)
  if (!entry) throw new Error(`Unknown provider: ${id}`)
  // 如果指定了模型，传入工厂函数
  if (model) {
    switch (id) {
      case 'deepseek': return createDeepSeekProvider(model)
      case 'qwen': return createQwenProvider(model)
      case 'volc': return createVolcProvider(model)
      case 'minimax': return createMiniMaxProvider(model)
      case 'copilot': return new CopilotProvider(model)
      case 'custom': return createCustomProvider()
      default: return entry.factory()
    }
  }
  return entry.factory()
}

/**
 * 获取支持视觉（Vision）的 Provider。
 *
 * 回退顺序：
 * 1. 当前 provider（若已声明 supportsVision）
 * 2. Copilot gpt-4o（已登录）
 * 3. 通义千问 qwen-vl-max（有 QWEN_API_KEY）
 * 4. 自定义 provider（有 CUSTOM_API_KEY + CUSTOM_BASE_URL，假定用户已配置视觉模型）
 *
 * 注意：MiniMax OpenAI 兼容接口官方明确不支持图像输入，不在回退列表。
 */
export function getVisionProvider(currentProvider?: LLMProvider): LLMProvider {
  // 1. 当前 provider 已支持视觉，直接复用
  if (currentProvider && currentProvider.getCapabilities().supportsVision) {
    return currentProvider
  }

  // 2. Copilot gpt-4o（免费且支持视觉）
  try {
    if (isCopilotLoggedIn()) {
      return new CopilotProvider('gpt-4o')
    }
  } catch { /* 未登录，跳过 */ }

  // 3. 通义千问 qwen-vl-max
  try {
    if (hasSecret('QWEN_API_KEY')) {
      return new OpenAICompatProvider({
        providerId: 'qwen',
        modelId: 'qwen-vl-max',
        apiKey: getSecret('QWEN_API_KEY'),
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        capabilities: {
          contextWindow: 131_072,
          supportsToolCalling: true,
          supportsVision: true,
        },
      })
    }
  } catch { /* 未配置，跳过 */ }

  // 4. 自定义 OpenAI 兼容端点（用户自行保证该端点支持视觉）
  try {
    if (hasSecret('CUSTOM_API_KEY') && hasSecret('CUSTOM_BASE_URL')) {
      return createCustomProvider()
    }
  } catch { /* 未配置，跳过 */ }

  // 所有选项均不可用，给出明确提示
  throw new Error(
    '当前模型不支持图片识别（MiniMax OpenAI 兼容接口不支持图像输入）。' +
    '请登录 GitHub Copilot，或在设置中配置通义千问（QWEN_API_KEY）以启用图片识别功能。'
  )
}

/** 带降级的 Provider 获取：主 Provider 失败时自动切换到下一个 */
export function getProviderWithFallback(): LLMProvider {
  const configured: LLMProvider[] = []
  for (const entry of PROVIDER_ORDER) {
    try {
      if (entry.isConfigured()) {
        configured.push(entry.factory())
      }
    } catch {
      // factory 可能抛出（如 Copilot 未登录），跳过
    }
  }
  return new FallbackProvider(configured) // configured 为空时 FallbackProvider 构造函数会抛错
}
