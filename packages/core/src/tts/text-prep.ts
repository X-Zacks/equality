/**
 * tts/text-prep.ts — TTS 文本预处理
 *
 * Phase M2 (GAP-31): markdown 清理 + 代码块移除 + 长文截断。
 */

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 为 TTS 合成准备文本。
 *
 * 1. 移除代码块（```...```）→ [代码已省略]
 * 2. 移除 inline code（`...`）→ 保留内容
 * 3. 移除 markdown 标记（#、**、~~、链接语法）
 * 4. 截断到 maxChars，保留句子完整性
 */
export function prepareText(text: string, maxChars: number = 4096): string {
  let result = text

  // 1. 移除代码块
  result = result.replace(/```[\s\S]*?```/g, '[代码已省略]')

  // 2. 移除 inline code backticks（保留内容）
  result = result.replace(/`([^`]+)`/g, '$1')

  // 3. 移除 heading markers
  result = result.replace(/^#{1,6}\s+/gm, '')

  // 4. 移除 bold / italic
  result = result.replace(/\*\*(.+?)\*\*/g, '$1')
  result = result.replace(/\*(.+?)\*/g, '$1')
  result = result.replace(/__(.+?)__/g, '$1')
  result = result.replace(/_(.+?)_/g, '$1')

  // 5. 移除 strikethrough
  result = result.replace(/~~(.+?)~~/g, '$1')

  // 6. 移除链接 — [text](url) → text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // 7. 移除图片 — ![alt](url) → [图片]
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[图片]')

  // 8. 移除 HTML 标签
  result = result.replace(/<[^>]+>/g, '')

  // 9. 合并多余空行
  result = result.replace(/\n{3,}/g, '\n\n')

  // 10. trim
  result = result.trim()

  // 11. 截断到 maxChars（句子边界）
  if (result.length > maxChars) {
    result = truncateAtSentence(result, maxChars)
  }

  return result
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * 在句子边界截断文本。
 */
function truncateAtSentence(text: string, maxChars: number): string {
  const truncated = text.slice(0, maxChars)

  // 查找最后一个句子结束符
  const sentenceEnders = /[。！？.!?]/g
  let lastEnd = -1
  let match: RegExpExecArray | null
  while ((match = sentenceEnders.exec(truncated)) !== null) {
    lastEnd = match.index + 1
  }

  // 至少保留 50% 的内容
  if (lastEnd > maxChars * 0.5) {
    return truncated.slice(0, lastEnd).trim()
  }

  // fallback: 强制截断并加省略号
  return truncated.trim() + '…'
}
