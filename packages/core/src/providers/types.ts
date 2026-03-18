import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'

export interface StreamChatParams {
  messages: ChatCompletionMessageParam[]
  model?: string
  abortSignal?: AbortSignal
  /** Phase 2: 传入工具 schema 列表，启用 tool calling */
  tools?: ChatCompletionTool[]
}

/** 工具调用增量（流式累积） */
export interface ToolCallDelta {
  index: number
  id?: string
  name?: string
  arguments?: string   // JSON 片段，需累积
}

export interface ChatDelta {
  content?: string
  toolCalls?: ToolCallDelta[]
  finishReason?: 'stop' | 'tool_calls' | 'length' | null
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ChatResponse {
  content: string
  usage: TokenUsage
}

export interface ProviderCapabilities {
  contextWindow: number
  supportsToolCalling: boolean
  supportsVision: boolean
  supportsThinking: boolean
}

export interface LLMProvider {
  readonly providerId: string
  readonly modelId: string
  streamChat(params: StreamChatParams): AsyncGenerator<ChatDelta>
  chat(params: StreamChatParams): Promise<ChatResponse>
  estimateTokens(text: string): number
  getCapabilities(): ProviderCapabilities
}
