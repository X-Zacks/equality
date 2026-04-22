/**
 * crew/recommender.ts — AI 辅助 Crew 创建
 *
 * 从 Chat 历史推荐 Crew 配置：名称、描述、推荐 Skills。
 * 一次 LLM 调用。
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { LLMProvider } from '../providers/types.js'
import { routeModel } from '../providers/router.js'
import { getGlobalRetriever } from '../skills/retriever.js'

export interface CrewRecommendation {
  name: string
  description: string
  emoji: string
  systemPromptExtra: string
  recommendedSkillNames: string[]
}

const RECOMMEND_SYSTEM_PROMPT = `你是一个 Crew 配置推荐器。根据用户的对话历史，推荐一个 Crew（任务执行体）配置。

输出严格的 JSON（不要 markdown 代码块包裹）：
{
  "name": "简短名称（中文，≤20字）",
  "description": "一句话描述用途",
  "emoji": "一个合适的 emoji",
  "systemPromptExtra": "针对此任务的额外指令（可为空字符串）",
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

keywords 用于搜索匹配的 Skills，选择 3-5 个最相关的关键词。`

export async function recommendCrew(
  messages: ChatCompletionMessageParam[],
  provider?: LLMProvider,
): Promise<CrewRecommendation> {
  const resolvedProvider = provider ?? routeModel('chat').provider

  const recentMessages = messages.slice(-15)
  const chatText = recentMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content.slice(0, 300) : ''}`)
    .join('\n')

  const reqMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: RECOMMEND_SYSTEM_PROMPT },
    { role: 'user', content: chatText },
  ]

  let raw = ''
  const stream = resolvedProvider.streamChat({ messages: reqMessages })
  for await (const delta of stream) {
    if (delta.content) raw += delta.content
  }

  // 解析 JSON
  let parsed: { name: string; description: string; emoji: string; systemPromptExtra: string; keywords: string[] }
  try {
    // 尝试去掉可能的 markdown 代码块
    const cleaned = raw.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // 回退到默认值
    parsed = {
      name: '新 Crew',
      description: '从聊天推荐的 Crew',
      emoji: '🤖',
      systemPromptExtra: '',
      keywords: [],
    }
  }

  // 用 keywords 搜索匹配的 Skills
  const retriever = getGlobalRetriever()
  const allMatches = new Map<string, number>()
  for (const kw of parsed.keywords) {
    const results = retriever.search(kw, 5)
    for (const r of results) {
      const existing = allMatches.get(r.skill.name) ?? 0
      allMatches.set(r.skill.name, existing + r.score)
    }
  }

  // 按总分排序，取 top 10
  const ranked = [...allMatches.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name)

  return {
    name: parsed.name || '新 Crew',
    description: parsed.description || '',
    emoji: parsed.emoji || '🤖',
    systemPromptExtra: parsed.systemPromptExtra || '',
    recommendedSkillNames: ranked,
  }
}
