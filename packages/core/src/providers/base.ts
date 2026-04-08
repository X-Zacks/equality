import OpenAI from 'openai'
import type { LLMProvider, StreamChatParams, ChatDelta, ChatResponse, ProviderCapabilities } from './types.js'
import { getProxyAgent, getProxyUrl } from '../config/proxy.js'

/** 默认 capabilities（子类可覆盖） */
const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  contextWindow: 128_000,
  supportsToolCalling: true,
  supportsVision: false,
  supportsThinking: false,
}

export class OpenAICompatProvider implements LLMProvider {
  readonly providerId: string
  readonly modelId: string
  private apiKey: string
  private baseURL: string
  private capabilities: ProviderCapabilities
  private extraBody: Record<string, unknown>

  constructor(opts: {
    providerId: string
    modelId: string
    apiKey: string
    baseURL: string
    capabilities?: Partial<ProviderCapabilities>
    extraBody?: Record<string, unknown>
  }) {
    this.providerId = opts.providerId
    this.modelId = opts.modelId
    this.apiKey = opts.apiKey
    this.baseURL = opts.baseURL.replace(/\/$/, '')
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...opts.capabilities }
    this.extraBody = opts.extraBody ?? {}
  }

  getCapabilities(): ProviderCapabilities {
    return this.capabilities
  }

  private createClient(): OpenAI {
    const proxyAgent = getProxyAgent()
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      ...(proxyAgent ? { httpAgent: proxyAgent } : {}),
    })
  }

  async *streamChat(params: StreamChatParams): AsyncGenerator<ChatDelta> {
    const model = params.model ?? this.modelId
    console.log(`[${this.providerId}] streamChat 模型: ${model}, baseURL: ${this.baseURL}, tools: ${params.tools?.length ?? 0}`)
    if (params.tools?.length) {
      console.log(`[${this.providerId}] tool names: ${params.tools.map(t => t.function.name).join(', ')}`)
    }

    const client = this.createClient()

    const requestBody = {
      model,
      messages: params.messages,
      stream: true as const,
      ...(params.tools?.length ? { tools: params.tools } : {}),
      ...this.extraBody,
    }

    const stream = await client.chat.completions.create(requestBody, {
      signal: params.abortSignal,
    })

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

  async chat(params: StreamChatParams): Promise<ChatResponse> {
    const model = params.model ?? this.modelId
    console.log(`[${this.providerId}] chat 模型: ${model}, baseURL: ${this.baseURL}`)

    const client = this.createClient()

    const response = await client.chat.completions.create({
      model,
      messages: params.messages,
      stream: false,
      ...this.extraBody,
    }, {
      signal: params.abortSignal,
    })

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

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 2)
  }
}
