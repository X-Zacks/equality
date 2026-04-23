/**
 * crew/briefing.ts — Briefing 生成器
 *
 * 从 Chat 历史中提炼关键上下文，生成结构化简报注入 Crew Session。
 * 一次 LLM 调用（~2K input → ~500 output）。
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { LLMProvider } from '../providers/types.js'
import { getUserSelectedProvider } from '../providers/router.js'

export interface BriefingResult {
  summary: string
  /** 源 Chat 的 session key */
  sourceSessionKey: string
}

const BRIEFING_SYSTEM_PROMPT = `你是一个上下文提炼器。从以下对话中提取：
1. 关键决策和结论
2. 技术方案和架构约定
3. 约束条件和偏好
4. 待完成的任务

输出结构化简报，使用以下格式：
## 背景
[一句话概括讨论主题]

## 关键决策
- [决策1]
- [决策2]

## 技术约定
- [约定1]

## 待办
- [任务1]

保持简洁，总共不超过 500 字。`

/**
 * 从 Chat 历史生成 Briefing
 */
export async function generateBriefing(
  messages: ChatCompletionMessageParam[],
  sourceSessionKey: string,
  provider?: LLMProvider,
): Promise<BriefingResult> {
  const resolvedProvider = provider ?? getUserSelectedProvider()

  // 只取最近的消息，控制输入量
  const recentMessages = messages.slice(-30)

  // 格式化对话历史——保留足够上下文
  const chatText = recentMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content.slice(0, 1500) : '(non-text)'}`)
    .join('\n\n')

  const briefingMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
    { role: 'user', content: chatText },
  ]

  // 单次 LLM 调用
  let summary = ''
  const stream = resolvedProvider.streamChat({ messages: briefingMessages })
  for await (const delta of stream) {
    if (delta.content) {
      summary += delta.content
    }
  }

  return {
    summary: summary.trim() || '(无法生成简报)',
    sourceSessionKey,
  }
}
