/**
 * session/persist-guard.ts — 会话 Tool Result 持久化守卫
 *
 * Phase H4 (GAP-26): 在会话消息写入磁盘前，截断超大的 tool result。
 * 与运行时截断（tools/truncation.ts）独立——那个影响 LLM 上下文，这个保护存储。
 *
 * 参考 OpenClaw session-tool-result-guard.ts（290 行）的设计：
 *   - capToolResultSize() 在持久化前截断
 *   - 只处理 role=tool 消息
 *   - 返回新数组，不修改原数据
 */

import type { Message } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PersistGuardOptions {
  /** 单条 tool result 字符上限（默认 50,000） */
  maxToolResultChars?: number
  /** 整次 persist 的总字符预算（默认 500,000） */
  totalBudgetChars?: number
}

export interface PersistGuardResult {
  messages: Message[]
  truncatedCount: number
  savedChars: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_TOOL_RESULT_CHARS = 50_000
const DEFAULT_TOTAL_BUDGET_CHARS = 500_000
const MIN_KEEP_CHARS = 2_000

const PERSIST_TRUNCATION_SUFFIX =
  '\n\n⚠️ [内容在持久化时被截断 — 原始输出过大，超出存储限制。' +
  '如需完整内容，请重新执行相关工具调用。]'

const MIDDLE_OMISSION_MARKER = '\n\n⚠️ [...中间内容已省略，显示开头和结尾...]\n\n'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** 检测尾部是否有重要内容（复用 truncation.ts 的逻辑） */
function hasImportantTail(text: string): boolean {
  const tail = text.slice(-2000).toLowerCase()
  return (
    /\b(error|exception|failed|fatal|traceback|panic|errno|exit code|错误|异常|失败)\b/.test(tail) ||
    /\}\s*$/.test(tail.trim()) ||
    /\b(total|summary|result|complete|finished|done|合计|汇总|完成)\b/.test(tail)
  )
}

/** 截断单条文本（head+tail 或 head-only） */
function truncateText(content: string, maxChars: number): { text: string; saved: number } {
  if (content.length <= maxChars) {
    return { text: content, saved: 0 }
  }

  const budget = Math.max(MIN_KEEP_CHARS, maxChars - PERSIST_TRUNCATION_SUFFIX.length)
  const saved = content.length - maxChars

  // head + tail 策略
  if (hasImportantTail(content) && budget > MIN_KEEP_CHARS * 2) {
    const tailBudget = Math.min(Math.floor(budget * 0.3), 4_000)
    const headBudget = budget - tailBudget - MIDDLE_OMISSION_MARKER.length

    if (headBudget > MIN_KEEP_CHARS) {
      let headCut = headBudget
      const headNewline = content.lastIndexOf('\n', headBudget)
      if (headNewline > headBudget * 0.8) headCut = headNewline

      let tailStart = content.length - tailBudget
      const tailNewline = content.indexOf('\n', tailStart)
      if (tailNewline !== -1 && tailNewline < tailStart + tailBudget * 0.2) tailStart = tailNewline + 1

      return {
        text: content.slice(0, headCut) + MIDDLE_OMISSION_MARKER + content.slice(tailStart) + PERSIST_TRUNCATION_SUFFIX,
        saved,
      }
    }
  }

  // head-only 策略
  let cutPoint = budget
  const lastNewline = content.lastIndexOf('\n', budget)
  if (lastNewline > budget * 0.8) cutPoint = lastNewline

  return {
    text: content.slice(0, cutPoint) + PERSIST_TRUNCATION_SUFFIX,
    saved,
  }
}

/** 获取消息的文本内容 */
function getMessageContent(msg: Message): string | undefined {
  if (typeof msg.content === 'string') return msg.content
  // tool role message content is always string in OpenAI format
  return undefined
}

/** 创建截断后的消息副本 */
function cloneWithContent(msg: Message, content: string): Message {
  return { ...msg, content } as Message
}

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * 在持久化前截断超大的 tool result 消息。
 *
 * 只截断 role === 'tool' 的消息。返回新数组，不修改原数据。
 *
 * 两层保护：
 *   1. 单条上限：maxToolResultChars（默认 50K）
 *   2. 总量上限：totalBudgetChars（默认 500K），按大小降序截断
 */
export function truncateForPersistence(
  messages: Message[],
  opts?: PersistGuardOptions,
): PersistGuardResult {
  const maxToolResult = opts?.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS
  const totalBudget = opts?.totalBudgetChars ?? DEFAULT_TOTAL_BUDGET_CHARS

  let truncatedCount = 0
  let savedChars = 0

  // 第一遍：单条截断
  const pass1: Message[] = messages.map(msg => {
    if (msg.role !== 'tool') return msg

    const content = getMessageContent(msg)
    if (!content || content.length <= maxToolResult) return msg

    const { text, saved } = truncateText(content, maxToolResult)
    truncatedCount++
    savedChars += saved
    return cloneWithContent(msg, text)
  })

  // 第二遍：总量保护
  let totalChars = 0
  for (const msg of pass1) {
    const content = getMessageContent(msg)
    if (content) totalChars += content.length
  }

  if (totalChars > totalBudget) {
    // 收集 tool 消息及其大小，按大小降序
    const toolIndices: Array<{ idx: number; length: number }> = []
    for (let i = 0; i < pass1.length; i++) {
      const msg = pass1[i]
      if (msg.role !== 'tool') continue
      const content = getMessageContent(msg)
      if (content && content.length > MIN_KEEP_CHARS) {
        toolIndices.push({ idx: i, length: content.length })
      }
    }
    toolIndices.sort((a, b) => b.length - a.length)

    // 从最大的开始截断，直到总量在预算内
    for (const { idx, length } of toolIndices) {
      if (totalChars <= totalBudget) break

      const targetLen = Math.max(MIN_KEEP_CHARS, length - (totalChars - totalBudget))
      const content = getMessageContent(pass1[idx])!
      const { text, saved } = truncateText(content, targetLen)

      if (saved > 0) {
        pass1[idx] = cloneWithContent(pass1[idx], text)
        totalChars -= saved
        savedChars += saved
        // 单条截断已在第一遍统计过的不重复计数
        if (content.length <= maxToolResult) {
          truncatedCount++
        }
      }
    }
  }

  return { messages: pass1, truncatedCount, savedChars }
}
