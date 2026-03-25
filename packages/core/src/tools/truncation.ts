/**
 * tools/truncation.ts — Tool Result 截断
 *
 * 单个工具结果超长时，保留头尾，中间插入截断标记。
 * 防止巨量输出撑爆 LLM 上下文窗口。
 *
 * 设计参考 OpenClaw tool-result-truncation.ts：
 *   - 单条上限 = contextWindow × 30% × 4字/token（动态）
 *   - 绝对上限 = 400,000 字（~100K tokens）
 *   - Fallback（未知 contextWindow）= 30,000 字
 */

/** 单条 tool result 占 context window 的最大份额 */
const MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3

/** 字符/token 估算比（英文约 4，中文约 1.5；此处取保守值 4） */
const CHARS_PER_TOKEN = 4

/** 绝对上限：即使 context window 极大，单条 result 也不超过此值 */
export const HARD_MAX_TOOL_RESULT_CHARS = 400_000

/** 当无法获取 contextWindow 时的 fallback 上限 */
export const DEFAULT_MAX_TOOL_RESULT_CHARS = 30_000

/** 截断时最少保留的字符数 */
const MIN_KEEP_CHARS = 2_000

const TRUNCATION_SUFFIX =
  '\n\n⚠️ [内容已截断 — 原始输出过大，超出模型上下文限制。' +
  '以上为部分内容，如需完整内容请分段请求或使用 offset/limit 参数读取。]'

const MIDDLE_OMISSION_MARKER = '\n\n⚠️ [...中间内容已省略，显示开头和结尾...]\n\n'

export interface TruncateResult {
  content: string
  truncated: boolean
  originalLength: number
}

/**
 * 根据 contextWindow（tokens）动态计算单条 tool result 的字符上限。
 *
 * 公式（与 OpenClaw 对齐）：
 *   maxChars = min(contextWindow × 30% × 4字/token, 400_000)
 */
export function calcMaxToolResultChars(contextWindowTokens: number): number {
  const maxChars = Math.floor(contextWindowTokens * MAX_TOOL_RESULT_CONTEXT_SHARE * CHARS_PER_TOKEN)
  return Math.min(Math.max(maxChars, MIN_KEEP_CHARS), HARD_MAX_TOOL_RESULT_CHARS)
}

/**
 * 检测文本尾部是否有重要内容（错误、JSON 结构、摘要）。
 * 有则使用 head+tail 策略，否则只保留开头。
 */
function hasImportantTail(text: string): boolean {
  const tail = text.slice(-2000).toLowerCase()
  return (
    /\b(error|exception|failed|fatal|traceback|panic|errno|exit code|错误|异常|失败)\b/.test(tail) ||
    /\}\s*$/.test(tail.trim()) ||
    /\b(total|summary|result|complete|finished|done|合计|汇总|完成)\b/.test(tail)
  )
}

/**
 * 截断工具输出。
 *
 * 策略（与 OpenClaw 对齐）：
 *   - 尾部有重要内容（error/JSON/summary）→ head 70% + tail 30%
 *   - 否则 → 只保留 head，追加截断提示
 *
 * @param content            原始内容
 * @param maxChars           字符上限；未传时使用 DEFAULT_MAX_TOOL_RESULT_CHARS
 */
export function truncateToolResult(
  content: string,
  maxChars: number = DEFAULT_MAX_TOOL_RESULT_CHARS,
): TruncateResult {
  if (content.length <= maxChars) {
    return { content, truncated: false, originalLength: content.length }
  }

  const budget = Math.max(MIN_KEEP_CHARS, maxChars - TRUNCATION_SUFFIX.length)

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
        content: content.slice(0, headCut) + MIDDLE_OMISSION_MARKER + content.slice(tailStart) + TRUNCATION_SUFFIX,
        truncated: true,
        originalLength: content.length,
      }
    }
  }

  // 只保留开头
  let cutPoint = budget
  const lastNewline = content.lastIndexOf('\n', budget)
  if (lastNewline > budget * 0.8) cutPoint = lastNewline

  return {
    content: content.slice(0, cutPoint) + TRUNCATION_SUFFIX,
    truncated: true,
    originalLength: content.length,
  }
}
