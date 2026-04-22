import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { SessionPurpose } from '../agent/purpose.js'

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
  /** 会话级目的（替代旧 SOUL/IDENTITY/USER.md） */
  purpose?: SessionPurpose
  /** 会话模式：chat（轻量聊天）| crew（任务执行） */
  mode: 'chat' | 'crew'
  /** Crew 模式时关联的 Crew Template ID */
  crewId?: string
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
    mode: 'chat',
  }
}
