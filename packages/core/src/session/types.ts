import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export type Message = ChatCompletionMessageParam

export interface Session {
  key: string
  title?: string
  messages: Message[]
  /** 每条 assistant 消息的费用行，key = 消息在 messages 数组中的索引 */
  costLines: Record<number, string>
  createdAt: number
  lastActiveAt: number
  runningAbort: AbortController | null
  /** O1: 冻结的记忆快照 — 首轮 assemble 时生成，后续轮复用 */
  frozenMemorySnapshot?: string
}

export function createSession(key: string): Session {
  const now = Date.now()
  return {
    key,
    title: undefined,
    messages: [],
    costLines: {},
    createdAt: now,
    lastActiveAt: now,
    runningAbort: null,
  }
}
