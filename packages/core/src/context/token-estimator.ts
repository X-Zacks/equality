/**
 * token-estimator.ts — 轻量级 token 估算器
 *
 * 不依赖外部 API，用于判断是否触发 Compaction。
 * 精度足够做阈值判断，不需要 tiktoken 级别的准确。
 */

/** 估算单段文本的 token 数 */
export function estimateTokens(text: string): number {
  let tokens = 0
  for (const char of text) {
    // CJK 统一表意文字 + 全角标点
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
      tokens += 1.5
    } else {
      tokens += 0.25  // ASCII ≈ 4 chars/token
    }
  }
  return Math.ceil(tokens)
}

/** 估算消息列表的总 token 数 */
export function estimateMessagesTokens(messages: Array<{ role?: string; content?: unknown; tool_calls?: unknown }>): number {
  let total = 0
  for (const msg of messages) {
    total += 4  // message overhead (role, separators)
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content)
    } else if (msg.content) {
      total += estimateTokens(JSON.stringify(msg.content))
    }
    if (msg.tool_calls) {
      total += estimateTokens(JSON.stringify(msg.tool_calls))
    }
  }
  return total
}
