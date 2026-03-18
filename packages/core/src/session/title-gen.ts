/**
 * 自动生成会话标题
 * 在第一轮对话完成后，异步调用 LLM 生成 ≤10 字的中文标题
 */
import type { LLMProvider } from '../providers/types.js'
import type { Session } from './types.js'
import { persist } from './persist.js'

const TITLE_PROMPT = `请用一句话（不超过10个汉字）概括以下对话的主题。
只输出标题本身，不要加引号、句号或任何前缀。

对话内容：
`

/**
 * 异步生成会话标题。不抛异常（失败时静默）
 * @returns 生成的标题，或 null
 */
export async function generateTitle(
  session: Session,
  provider: LLMProvider,
): Promise<string | null> {
  // 已有标题则跳过
  if (session.title) return session.title

  // 至少需要一轮对话（一条 user + 一条 assistant）
  const userMsgs = session.messages.filter(m => 'role' in m && m.role === 'user')
  const assistantMsgs = session.messages.filter(m => 'role' in m && m.role === 'assistant')
  if (userMsgs.length === 0 || assistantMsgs.length === 0) return null

  // 取第一条 user 和 assistant 消息构建摘要
  const userContent = typeof userMsgs[0]!.content === 'string'
    ? userMsgs[0]!.content.slice(0, 300)
    : ''
  const assistantContent = typeof assistantMsgs[0]!.content === 'string'
    ? (assistantMsgs[0]!.content as string).slice(0, 300)
    : ''

  if (!userContent) return null

  const snippet = `用户: ${userContent}\n助手: ${assistantContent}`

  try {
    const result = await provider.chat({
      messages: [
        { role: 'user', content: TITLE_PROMPT + snippet },
      ],
    })
    const title = result.content?.trim().slice(0, 20) // 保护性截断
    if (title) {
      session.title = title
      await persist(session)
      return title
    }
  } catch {
    // 静默失败 — 标题生成不应影响正常流程
  }
  return null
}
