/**
 * agent/purpose.ts — 会话级 Purpose 推断与格式化
 *
 * 替代旧的 SOUL.md / IDENTITY.md / USER.md 机制，
 * 提供会话级的目标推断和 system prompt 注入。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionPurpose {
  /** 本次会话的主要目标（一句话） */
  goal: string
  /** 约束或偏好（如"简洁回复"、"用英文"） */
  constraints?: string[]
  /** 推断来源 */
  source: 'inferred' | 'manual' | 'bootstrap'
}

// ─── Inference ──────────────────────────────────────────────────────────────

/**
 * 从用户首条消息推断会话目的。
 * 纯文本匹配，不调用 LLM。
 * 闲聊/极短消息返回 undefined。
 */
export function inferPurpose(message: string): SessionPurpose | undefined {
  const trimmed = message.trim()

  // 太短，无法推断
  if (trimmed.length < 5) return undefined

  // 纯打招呼/闲聊 → 不设 purpose
  if (/^(你好|hi|hello|hey|嗨|哈喽|在吗|在不在|怎么样|how are you)[!！？?。.]*$/i.test(trimmed)) {
    return undefined
  }

  // 提取目标：去掉常见的请求前缀
  let goal = trimmed
    .replace(/^(请|帮我|帮忙|麻烦|能不能|可以|please|can you|could you|help me)\s*/gi, '')
    .replace(/[。？！.?!]+$/, '') // 去掉末尾标点

  // 如果提取后太短或跟原文一样短，直接用原文
  if (goal.length < 3) goal = trimmed.replace(/[。？！.?!]+$/, '')

  // 截断过长的 goal
  if (goal.length > 100) goal = goal.slice(0, 97) + '...'

  // 提取约束关键词
  const constraints: string[] = []
  if (/英文|english|in english/i.test(trimmed)) constraints.push('用英文回复')
  if (/简洁|简短|brief|concise/i.test(trimmed)) constraints.push('简洁回复')
  if (/详细|详尽|detailed|verbose/i.test(trimmed)) constraints.push('详细回复')
  if (/不要解释|直接给|just give/i.test(trimmed)) constraints.push('不要额外解释')

  return {
    goal,
    constraints: constraints.length > 0 ? constraints : undefined,
    source: 'inferred',
  }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * 将 SessionPurpose 格式化为可注入 system prompt 的文本块。
 * 无 purpose 时返回空字符串。
 */
export function formatPurposeBlock(purpose?: SessionPurpose): string {
  if (!purpose) return ''

  let block = `\n<session-purpose>\n目标：${purpose.goal}`
  if (purpose.constraints && purpose.constraints.length > 0) {
    block += '\n' + purpose.constraints.map(c => `约束：${c}`).join('\n')
  }
  block += '\n</session-purpose>\n'
  return block
}
