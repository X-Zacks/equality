/**
 * session/transcript-compact.ts — 对话记录压缩
 *
 * Phase N6 (N6.2.1): 借鉴 claw-code TranscriptStore.compact(keep_last)
 * - 保留最近 N 条消息
 * - 阈值触发自动 compact
 * - system prompt 保留
 * - 与现有 context compaction 协同
 */

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface TranscriptCompactConfig {
  /** 保留最近 N 条消息（默认 10） */
  keepLast: number
  /** 消息数超过此值触发自动 compact（默认 30） */
  compactThreshold: number
  /** 是否保留 system prompt（默认 true） */
  preserveSystemPrompt: boolean
}

export interface CompactMessage {
  role: string
  content?: string
  [key: string]: unknown
}

export const DEFAULT_COMPACT_CONFIG: TranscriptCompactConfig = {
  keepLast: 10,
  compactThreshold: 30,
  preserveSystemPrompt: true,
}

// ─── 核心函数 ─────────────────────────────────────────────────────────────────

/**
 * 压缩对话记录，保留最近 keepLast 条消息。
 *
 * 行为：
 * 1. 如果消息数 <= keepLast，不做任何处理
 * 2. preserveSystemPrompt=true 时，system prompt 永远保留（不计入 keepLast）
 * 3. 保留最后 keepLast 条非-system 消息
 */
export function compactTranscript(
  messages: CompactMessage[],
  config?: Partial<TranscriptCompactConfig>,
): CompactMessage[] {
  const cfg = { ...DEFAULT_COMPACT_CONFIG, ...config }

  if (messages.length === 0) return []

  // 分离 system prompt 和其余消息
  const systemMessages: CompactMessage[] = []
  const otherMessages: CompactMessage[] = []

  for (const msg of messages) {
    if (cfg.preserveSystemPrompt && msg.role === 'system') {
      systemMessages.push(msg)
    } else {
      otherMessages.push(msg)
    }
  }

  // 如果 other 消息数不超过 keepLast，原样返回
  if (otherMessages.length <= cfg.keepLast) {
    return [...systemMessages, ...otherMessages]
  }

  // 保留最后 keepLast 条
  const kept = otherMessages.slice(-cfg.keepLast)
  return [...systemMessages, ...kept]
}

/**
 * 检查是否需要 compact（消息数超过阈值）。
 */
export function needsCompact(
  messageCount: number,
  config?: Partial<TranscriptCompactConfig>,
): boolean {
  const threshold = config?.compactThreshold ?? DEFAULT_COMPACT_CONFIG.compactThreshold
  return messageCount > threshold
}
