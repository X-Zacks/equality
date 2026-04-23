/**
 * crew/recommender.ts — AI 辅助 Crew 创建
 *
 * 从 Chat 历史推荐 Crew 配置：名称、描述、推荐 Skills。
 * 一次 LLM 调用。
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { LLMProvider } from '../providers/types.js'
import { getUserSelectedProvider } from '../providers/router.js'
import { getGlobalRetriever } from '../skills/retriever.js'

export interface CrewRecommendation {
  name: string
  description: string
  emoji: string
  systemPromptExtra: string
  recommendedSkillNames: string[]
}

const RECOMMEND_SYSTEM_PROMPT = `You are a Crew configuration recommender. Based on the user's full conversation history, deeply analyze the user's work domain and task requirements, then recommend a Crew (task execution entity) configuration.

Carefully read all details in the conversation: topics discussed, tools used, tech stacks involved, file types or workflows mentioned.

Output strict JSON (no markdown code block wrapping):
{
  "name": "Short but precise name (≤20 chars, reflect specific domain, match conversation language)",
  "description": "One-sentence description of what this Crew can do (specific to tech stack/tools/scenarios, match conversation language)",
  "emoji": "One emoji best matching the task domain",
  "systemPromptExtra": "Detailed role definition and behavioral instructions (at least 3-5 specific rules, based on user preferences and work habits from conversation)",
  "keywords": ["keyword1", "keyword2", ..., "keywordN"]
}

systemPromptExtra requirements:
- Write based on actual user needs and preferences from conversation
- Include specific technical conventions (language preferences, code style, output format, etc.)
- At least 100 characters with substantial content
- Use the same language as the conversation

keywords are used to search for matching Skills, choose 5-10 most relevant keywords covering:
- Tool types (e.g. git, bash, docx, excel)
- Domain types (e.g. frontend, coding, data-analysis)
- Scenario types (e.g. report, design, automation)`

export async function recommendCrew(
  messages: ChatCompletionMessageParam[],
  provider?: LLMProvider,
): Promise<CrewRecommendation> {
  const resolvedProvider = provider ?? getUserSelectedProvider()

  const recentMessages = messages.slice(-30)
  const chatText = recentMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const text = typeof m.content === 'string' ? m.content : ''
      // 保留更多上下文以便 LLM 准确分析
      return `[${m.role}]: ${text.slice(0, 1000)}`
    })
    .join('\n\n')

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
      name: 'New Crew',
      description: 'Crew recommended from chat',
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
