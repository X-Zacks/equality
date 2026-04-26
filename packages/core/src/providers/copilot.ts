/**
 * copilot.ts — GitHub Copilot Provider
 *
 * 通过 GitHub Copilot 订阅调用 Claude / GPT / Gemini 等模型
 * 使用 OpenAI SDK（旧模型走 /chat/completions，GPT-5.x 走 /responses 端点）
 * 真正的 SSE 流式 + 原生 tool_calls 支持
 */

import https from 'node:https'
import OpenAI from 'openai'
import type { LLMProvider, StreamChatParams, ChatDelta, ChatResponse } from './types.js'
import { getValidBearerToken, forceRefreshBearerToken, getApiHostname } from './copilot-auth.js'
import { getProxyAgent, getTlsOptions, getProxyUrl } from '../config/proxy.js'

// ─── Copilot 可用模型 ─────────────────────────────────────────────────────────

export interface CopilotModelInfo {
  id: string           // API model ID
  name: string         // 显示名
  contextWindow: number
  canReason: boolean
  multiplier?: number  // 费用倍率（相对于标准模型 1x）
  category?: string    // model_picker_category: powerful / versatile / fast
  preview?: boolean    // 是否预览版
}

/** 已知可用的模型（静态 fallback，动态获取失败时使用） */
export let COPILOT_MODELS: CopilotModelInfo[] = [
  // ── GPT 4.x（/chat/completions）──
  { id: 'gpt-4o',                    name: 'GPT-4o',                      contextWindow: 128_000,   canReason: false, multiplier: 1,    category: 'versatile' },
  { id: 'gpt-4.1',                   name: 'GPT-4.1',                     contextWindow: 1_047_576, canReason: false, multiplier: 1,    category: 'versatile' },
  { id: 'gpt-4.1-mini',              name: 'GPT-4.1 Mini',                contextWindow: 1_047_576, canReason: false, multiplier: 0.33, category: 'fast' },
  // ── GPT 5.x（/responses 端点）──
  { id: 'gpt-5.1',                   name: 'GPT-5.1',                     contextWindow: 1_047_576, canReason: false, multiplier: 1,    category: 'versatile' },
  { id: 'gpt-5.2',                   name: 'GPT-5.2',                     contextWindow: 1_047_576, canReason: false, multiplier: 1,    category: 'versatile' },
  { id: 'gpt-5.4',                   name: 'GPT-5.4',                     contextWindow: 1_047_576, canReason: false, multiplier: 1,    category: 'powerful' },
  // ── o-系列（/chat/completions + max_completion_tokens）──
  { id: 'o3-mini',                   name: 'o3-mini',                     contextWindow: 200_000,   canReason: true,  multiplier: 0.33, category: 'fast' },
  { id: 'o4-mini',                   name: 'o4-mini',                     contextWindow: 200_000,   canReason: true,  multiplier: 0.33, category: 'fast' },
  // ── Claude（/chat/completions）──
  { id: 'claude-sonnet-4',           name: 'Claude Sonnet 4',             contextWindow: 200_000,   canReason: false, multiplier: 1,    category: 'versatile' },
  { id: 'claude-3.5-sonnet',         name: 'Claude 3.5 Sonnet',           contextWindow: 200_000,   canReason: false, multiplier: 1,    category: 'versatile' },
  // ── Gemini（/chat/completions）──
  { id: 'gemini-2.0-flash-001',      name: 'Gemini 2.0 Flash',            contextWindow: 1_000_000, canReason: false, multiplier: 0.33, category: 'fast' },
]

const DEFAULT_MODEL = 'gpt-4o'

/**
 * 判断模型是否需要使用 Responses API（/responses 端点）
 * GPT-5.x 不可通过 /chat/completions 访问
 */
function needsResponsesAPI(modelId: string): boolean {
  return modelId.toLowerCase().startsWith('gpt-5')
}

/**
 * 判断模型是否需要使用 max_completion_tokens 而非 max_tokens
 * o1/o3/o4 等 reasoning 模型不接受 max_tokens 参数
 */
function needsMaxCompletionTokens(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')
}

// ─── Responses API 格式转换 ──────────────────────────────────────────────────

/**
 * 将 chat completions 的 messages 转为 Responses API 的 input 格式
 * 提取 system message 作为 instructions，其余转为 input items
 *
 * 转换映射：
 * - system/developer → instructions 参数
 * - user → { role: 'user', content, type: 'message' }
 * - assistant（纯文本）→ { role: 'assistant', content, type: 'message' }
 * - assistant（带 tool_calls）→ function_call items
 * - tool → function_call_output items
 */
/**
 * Responses API 要求 function_call 的 id/call_id 以 'fc_' 开头
 * Chat Completions 返回的是 'call_' 前缀，需要转换
 */
function toFcId(id: string): string {
  if (!id) return id
  if (id.startsWith('fc_') || id.startsWith('fc-')) return id
  if (id.startsWith('call_')) return 'fc_' + id.slice(5)
  return 'fc_' + id
}

function convertToResponsesInput(messages: OpenAI.ChatCompletionMessageParam[]): {
  instructions: string | undefined
  input: Array<Record<string, unknown>>
} {
  let instructions: string | undefined
  const input: Array<Record<string, unknown>> = []

  for (const msg of messages) {
    const role = msg.role as string

    if (role === 'system' || role === 'developer') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? (msg.content as any[]).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
          : ''
      if (!instructions) {
        instructions = content
      } else {
        instructions += '\n\n' + content
      }
    } else if (role === 'user') {
      // user 消息可能包含多模态内容（文本 + 图片）
      if (Array.isArray(msg.content)) {
        const parts = msg.content as any[]
        // 检查是否有图片内容
        const hasImage = parts.some((p: any) => p.type === 'image_url')
        if (hasImage) {
          // Responses API 支持多模态 input_image
          const responseParts: Array<Record<string, unknown>> = []
          for (const p of parts) {
            if (p.type === 'text') {
              responseParts.push({ type: 'input_text', text: p.text })
            } else if (p.type === 'image_url') {
              const url: string = p.image_url?.url ?? ''
              if (url.startsWith('data:')) {
                // base64 data URL → input_image with base64
                const match = url.match(/^data:([^;]+);base64,(.+)$/)
                if (match) {
                  responseParts.push({
                    type: 'input_image',
                    image_url: url,
                  })
                }
              } else {
                responseParts.push({ type: 'input_image', image_url: url })
              }
            }
          }
          input.push({ role: 'user', content: responseParts, type: 'message' })
        } else {
          // 纯文本多部分
          const content = parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
          input.push({ role: 'user', content, type: 'message' })
        }
      } else {
        const content = typeof msg.content === 'string' ? msg.content : ''
        input.push({ role: 'user', content, type: 'message' })
      }
    } else if (role === 'assistant') {
      const assistantMsg = msg as any
      // assistant 消息可能带 tool_calls
      if (assistantMsg.tool_calls?.length) {
        // 先添加文本部分（如果有）
        if (assistantMsg.content) {
          input.push({ role: 'assistant', content: String(assistantMsg.content), type: 'message' })
        }
        // 将每个 tool_call 转为 function_call item
        for (const tc of assistantMsg.tool_calls) {
          const fcId = toFcId(tc.id ?? '')
          input.push({
            type: 'function_call',
            id: fcId,
            call_id: fcId,
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '{}',
          })
        }
      } else {
        const content = typeof assistantMsg.content === 'string'
          ? assistantMsg.content
          : ''
        if (content) {
          input.push({ role: 'assistant', content, type: 'message' })
        }
      }
    } else if (role === 'tool') {
      // tool result → function_call_output
      const toolMsg = msg as any
      input.push({
        type: 'function_call_output',
        call_id: toFcId(toolMsg.tool_call_id ?? ''),
        output: typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content),
      })
    }
  }

  return { instructions, input }
}

/**
 * 将 chat completions 的 tools 格式转为 Responses API 的 FunctionTool 格式
 * chat: { type: 'function', function: { name, description, parameters } }
 * responses: { type: 'function', name, description, parameters, strict: false }
 */
function convertToResponsesTools(tools?: OpenAI.ChatCompletionTool[]): Array<{
  type: 'function'
  name: string
  description?: string
  parameters: Record<string, unknown>
  strict: boolean
}> | undefined {
  if (!tools?.length) return undefined
  return tools.map(t => ({
    type: 'function' as const,
    name: t.function.name,
    description: t.function.description ?? undefined,
    parameters: (t.function.parameters ?? {}) as Record<string, unknown>,
    strict: false,
  }))
}

/** 从 Copilot API 动态获取可用模型列表 */
export async function fetchCopilotModels(): Promise<CopilotModelInfo[]> {
  try {
    const token = await getValidBearerToken()
    const hostname = getApiHostname()

    const raw = await new Promise<string>((resolve, reject) => {
      const req = https.request({
        hostname,
        port: 443,
        path: '/models',
        method: 'GET',
        agent: getProxyAgent(),
        ...getTlsOptions(),
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Equality/1.0',
          'Editor-Version': 'Equality/1.0',
          'Editor-Plugin-Version': 'Equality/1.0',
          'Copilot-Integration-Id': 'vscode-chat',
          Accept: 'application/json',
        },
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Copilot /models HTTP ${res.statusCode}: ${text.slice(0, 300)}`))
          } else {
            resolve(text)
          }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })

    const json = JSON.parse(raw)
    const models: CopilotModelInfo[] = []

    const list = Array.isArray(json) ? json : json.data ?? json.models ?? []
    for (const m of list) {
      const id = m.id ?? m.name ?? ''
      if (!id) continue
      const caps = m.capabilities ?? {}
      // 过滤掉非 chat 模型（embeddings、code-completion 等）
      if (caps.type === 'embeddings' || caps.family === 'text-embedding') continue
      // 过滤掉 model_picker_enabled=false 的模型（如旧版本）
      if (m.model_picker_enabled === false) continue

      const canReason = id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4') || id.includes('opus')
      const category: string | undefined = m.model_picker_category
      const preview: boolean = m.preview === true

      models.push({
        id,
        name: m.name ?? id,
        contextWindow: caps.limits?.max_context_window_tokens
          ?? caps.limits?.max_prompt_tokens
          ?? m.context_window ?? 128_000,
        canReason,
        category,
        preview,
      })
    }

    if (models.length > 0) {
      console.log(`[copilot] 动态获取到 ${models.length} 个模型: ${models.map(m => m.id).join(', ')}`)
      COPILOT_MODELS = models
      return models
    }
  } catch (e) {
    console.warn('[copilot] 动态获取模型列表失败，使用静态列表:', e)
  }
  return COPILOT_MODELS
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/** 创建一个指向 Copilot API 的 OpenAI client（每次调用，因为 bearer token ~30min 过期） */
async function createCopilotClient(options?: { initiator?: 'user' | 'agent' }): Promise<OpenAI> {
  const token = await getValidBearerToken()
  const hostname = getApiHostname()
  const proxyAgent = getProxyAgent()

  return new OpenAI({
    apiKey: token,
    baseURL: `https://${hostname}`,
    defaultHeaders: {
      'User-Agent': 'GitHubCopilotChat/0.26.7',
      'Editor-Version': 'vscode/1.96.2',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'Copilot-Integration-Id': 'vscode-chat',
      'Openai-Intent': 'conversation-edits',
      'X-Initiator': options?.initiator ?? 'user',
    },
    // 企业代理：通过 httpAgent 注入
    httpAgent: proxyAgent,
    // 代理场景下放宽 TLS 验证
    ...(getProxyUrl() ? { dangerouslyAllowBrowser: false } : {}),
  })
}

export class CopilotProvider implements LLMProvider {
  readonly providerId = 'copilot'
  readonly modelId: string

  constructor(model?: string) {
    this.modelId = model ?? DEFAULT_MODEL
  }

  async *streamChat(params: StreamChatParams): AsyncGenerator<ChatDelta> {
    const model = params.model ?? this.modelId
    console.log(`[copilot] streamChat 模型: ${model}, API hostname: ${getApiHostname()}`)

    // 判断 initiator：最后一条消息是 user → user，否则 → agent（tool loop 后续轮次）
    const lastMsg = params.messages[params.messages.length - 1]
    const initiator = (lastMsg && 'role' in lastMsg && lastMsg.role !== 'user') ? 'agent' as const : 'user' as const

    let client = await createCopilotClient({ initiator })

    // GPT-5.x → Responses API
    if (needsResponsesAPI(model)) {
      yield* this._streamViaResponses(client, model, params)
      return
    }

    // 其他模型 → Chat Completions API
    const tokenParam = needsMaxCompletionTokens(model)
      ? { max_completion_tokens: 120000 }
      : { max_tokens: 120000 }

    const createStreamParams: OpenAI.ChatCompletionCreateParamsStreaming = {
      model,
      messages: params.messages,
      stream: true,
      ...tokenParam,
      ...(params.tools?.length ? { tools: params.tools } : {}),
    }

    let stream: ReturnType<typeof client.chat.completions.create> extends Promise<infer T> ? AsyncIterable<OpenAI.ChatCompletionChunk> : never

    try {
      stream = await client.chat.completions.create(createStreamParams, {
        signal: params.abortSignal,
      })
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIError && err.status === 401) {
        console.log('[copilot] 401, 刷新 bearer token 后重试...')
        await forceRefreshBearerToken()
        client = await createCopilotClient({ initiator })
        stream = await client.chat.completions.create(createStreamParams, {
          signal: params.abortSignal,
        })
      } else {
        throw err
      }
    }

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue

      const delta: ChatDelta = {}

      if (choice.delta?.content) {
        delta.content = choice.delta.content
      }

      if (choice.delta?.tool_calls?.length) {
        delta.toolCalls = choice.delta.tool_calls.map(tc => ({
          index: tc.index,
          id: tc.id ?? undefined,
          name: tc.function?.name ?? undefined,
          arguments: tc.function?.arguments ?? undefined,
        }))
      }

      if (choice.finish_reason) {
        delta.finishReason = choice.finish_reason as ChatDelta['finishReason']
      }

      if (delta.content || delta.toolCalls || delta.finishReason) {
        yield delta
      }
    }
  }

  /**
   * 通过 Responses API 流式调用（GPT-5.x）
   * 事件格式完全不同于 Chat Completions
   */
  private async *_streamViaResponses(
    client: OpenAI,
    model: string,
    params: StreamChatParams,
  ): AsyncGenerator<ChatDelta> {
    const { instructions, input } = convertToResponsesInput(params.messages)
    const tools = convertToResponsesTools(params.tools)

    console.log(`[copilot] 使用 Responses API 流式 (model=${model}, tools=${tools?.length ?? 0}, inputItems=${input.length})`)
    if (tools?.length) {
      console.log(`[copilot] tools: ${tools.map(t => t.name).join(', ')}`)
    }

    // 跟踪活跃的 function_call items，用于将 delta 映射到 tool_calls index
    // 用多种 key 注册（item.id / output_index），确保能匹配 event.item_id
    const functionCallItems = new Map<string, { index: number; name: string; callId: string }>()
    // 额外：按 output_index 索引（fallback）
    const fcByOutputIndex = new Map<number, { index: number; name: string; callId: string }>()
    // 最后一个注册的 function_call（终极 fallback，模仿 OpenClaw 的 currentItem 状态机）
    let lastFc: { index: number; name: string; callId: string } | null = null
    let nextToolIndex = 0

    const stream = await client.responses.create({
      model,
      input: input as any,
      stream: true,
      ...(instructions ? { instructions } : {}),
      ...(tools ? { tools: tools as any } : {}),
      max_output_tokens: 16000,
    }, {
      signal: params.abortSignal,
    })

    for await (const event of stream as AsyncIterable<any>) {
      const type: string = event.type ?? ''

      // 文本增量
      if (type === 'response.output_text.delta') {
        yield { content: event.delta }
        continue
      }

      // 新的 output item 出现 —— 检查是否是 function_call
      if (type === 'response.output_item.added') {
        const item = event.item
        const outputIndex: number = event.output_index ?? -1
        console.log(`[copilot] output_item.added: type=${item?.type}, id=${item?.id}, call_id=${item?.call_id}, name=${item?.name}, output_index=${outputIndex}`)
        if (item?.type === 'function_call') {
          const idx = nextToolIndex++
          const fcInfo = {
            index: idx,
            name: item.name ?? '',
            callId: item.call_id ?? item.id ?? `fc_auto_${idx}`,
          }
          // 用所有可能的 key 注册，确保后续 delta 能匹配
          if (item.id) functionCallItems.set(item.id, fcInfo)
          if (item.call_id && item.call_id !== item.id) functionCallItems.set(item.call_id, fcInfo)
          fcByOutputIndex.set(outputIndex, fcInfo)
          lastFc = fcInfo

          // 发送 tool call 开始事件（带 id 和 name）
          yield {
            toolCalls: [{
              index: idx,
              id: fcInfo.callId,
              name: item.name ?? '',
              arguments: '',
            }],
          }
        }
        continue
      }

      // function_call 参数增量
      if (type === 'response.function_call_arguments.delta') {
        const itemId: string = event.item_id ?? ''
        const outputIndex: number = event.output_index ?? -1
        // 多种方式查找对应的 function_call
        const fc = functionCallItems.get(itemId) ?? fcByOutputIndex.get(outputIndex) ?? lastFc
        console.log(`[copilot] fc_args.delta: item_id=${itemId}, output_index=${outputIndex}, matched=${!!fc}, usedFallback=${!functionCallItems.has(itemId) && !fcByOutputIndex.has(outputIndex)}, delta=${(event.delta ?? '').slice(0, 80)}`)
        if (fc) {
          yield {
            toolCalls: [{
              index: fc.index,
              arguments: event.delta ?? '',
            }],
          }
        }
        continue
      }

      // function_call 参数完成
      if (type === 'response.function_call_arguments.done') {
        // 不需要额外处理，runner 会根据累积的 arguments 解析
        continue
      }

      // 响应完成
      if (type === 'response.completed') {
        // 如果本次响应包含 function_call，finishReason 应为 tool_calls
        const hasFunctionCalls = nextToolIndex > 0
        console.log(`[copilot] response.completed: hasFunctionCalls=${hasFunctionCalls}, count=${nextToolIndex}`)
        yield { finishReason: hasFunctionCalls ? 'tool_calls' : 'stop' }
        continue
      }

      // 响应失败
      if (type === 'response.failed' || type === 'response.error') {
        const errMsg = event.error?.message ?? event.message ?? 'Unknown error'
        throw new Error(`Responses API error: ${errMsg}`)
      }

      // 记录未知事件类型（帮助调试）
      if (type) {
        console.log(`[copilot] Responses API 未处理事件: ${type}`, JSON.stringify(event).slice(0, 200))
      }
    }
  }

  async chat(params: StreamChatParams): Promise<ChatResponse> {
    const model = params.model ?? this.modelId
    console.log(`[copilot] chat 模型: ${model}, API hostname: ${getApiHostname()}`)

    let client = await createCopilotClient({ initiator: 'user' })

    // GPT-5.x → Responses API
    if (needsResponsesAPI(model)) {
      return this._chatViaResponses(client, model, params)
    }

    // 其他模型 → Chat Completions API
    const tokenParam = needsMaxCompletionTokens(model)
      ? { max_completion_tokens: 120000 }
      : { max_tokens: 120000 }

    const createParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: params.messages,
      stream: false,
      ...tokenParam,
    }

    let response: OpenAI.ChatCompletion
    try {
      const result = await client.chat.completions.create(createParams, {
        signal: params.abortSignal,
      }).withResponse()
      response = result.data
      // Phase U: 尝试捕获 Copilot 配额相关的响应头
      const headers = result.response.headers
      const rlRemaining = headers.get('x-ratelimit-remaining')
      const rlLimit = headers.get('x-ratelimit-limit')
      if (rlRemaining != null || rlLimit != null) {
        console.log(`[copilot] ratelimit headers: remaining=${rlRemaining}, limit=${rlLimit}`)
      }
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIError && err.status === 401) {
        await forceRefreshBearerToken()
        client = await createCopilotClient({ initiator: 'user' })
        response = await client.chat.completions.create(createParams, {
          signal: params.abortSignal,
        })
      } else {
        throw err
      }
    }

    const content = response.choices[0]?.message?.content ?? ''

    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    }
  }

  /**
   * 通过 Responses API 非流式调用（GPT-5.x）
   */
  private async _chatViaResponses(
    client: OpenAI,
    model: string,
    params: StreamChatParams,
  ): Promise<ChatResponse> {
    const { instructions, input } = convertToResponsesInput(params.messages)

    console.log(`[copilot] 使用 Responses API 非流式 (model=${model})`)

    const resp = await client.responses.create({
      model,
      input: input as any,
      stream: false,
      ...(instructions ? { instructions } : {}),
      max_output_tokens: 16000,
    }, {
      signal: params.abortSignal,
    }) as any

    // 从 output 中提取文本内容
    let content = ''
    if (resp.output) {
      for (const item of resp.output) {
        if (item.type === 'message' && item.content) {
          for (const part of item.content) {
            if (part.type === 'output_text') {
              content += part.text ?? ''
            }
          }
        }
      }
    }
    // fallback: output_text 字段
    if (!content && resp.output_text) {
      content = resp.output_text
    }

    return {
      content,
      usage: {
        inputTokens: resp.usage?.input_tokens ?? 0,
        outputTokens: resp.usage?.output_tokens ?? 0,
        totalTokens: (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0),
      },
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 2)
  }

  getCapabilities() {
    const modelInfo = COPILOT_MODELS.find(m => m.id === this.modelId)
    return {
      contextWindow: modelInfo?.contextWindow ?? 128_000,
      supportsToolCalling: true,
      supportsVision: false,
      supportsThinking: modelInfo?.canReason ?? false,
    }
  }
}
