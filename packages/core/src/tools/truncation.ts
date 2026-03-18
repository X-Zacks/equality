/**
 * tools/truncation.ts — Tool Result 截断
 *
 * 单个工具结果超长时，保留头尾各一半，中间插入截断标记。
 * 防止巨量输出撑爆 LLM 上下文窗口。
 */

/** 单条工具结果字符上限（约 8K tokens，保证多轮不爆窗口） */
export const MAX_TOOL_RESULT_CHARS = 30_000

export interface TruncateResult {
  content: string
  truncated: boolean
  originalLength: number
}

/**
 * 截断工具输出
 *
 * 策略：head + tail 各取一半，中间插入截断标记
 *
 * @param content   原始内容
 * @param maxChars  字符上限（默认 400,000）
 */
export function truncateToolResult(
  content: string,
  maxChars: number = MAX_TOOL_RESULT_CHARS,
): TruncateResult {
  if (content.length <= maxChars) {
    return { content, truncated: false, originalLength: content.length }
  }

  const halfLimit = Math.floor(maxChars / 2)
  const head = content.slice(0, halfLimit)
  const tail = content.slice(-halfLimit)
  const marker = `\n\n[...内容已截断，原始输出 ${content.length} 字符，显示前 ${halfLimit} 和后 ${halfLimit} 字符...]\n\n`

  return {
    content: head + marker + tail,
    truncated: true,
    originalLength: content.length,
  }
}
