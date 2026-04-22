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

const RECOMMEND_SYSTEM_PROMPT = `你是一个 Crew 配置推荐器。根据用户的完整对话历史，深度分析用户的工作领域和任务需求，推荐一个 Crew（任务执行体）配置。

仔细阅读对话中的所有细节：用户讨论了什么主题、用了哪些工具、涉及什么技术栈、提到了什么文件类型或工作流程。

输出严格的 JSON（不要 markdown 代码块包裹）：
{
  "name": "简短但精确的名称（中文，≤20字，体现具体领域）",
  "description": "一句话描述这个 Crew 能做什么（具体到技术栈/工具/场景）",
  "emoji": "一个最贴合任务领域的 emoji",
  "systemPromptExtra": "详细的角色定义和行为指令（至少3-5条具体规则，基于对话中体现的用户偏好和工作习惯）",
  "keywords": ["关键词1", "关键词2", ..., "关键词N"]
}

systemPromptExtra 要求：
- 基于对话中用户的实际需求和偏好来写
- 包含具体的技术约定（如语言偏好、代码风格、输出格式等）
- 至少100字，要有实质内容

keywords 用于搜索匹配的 Skills（技能包），选择 5-10 个最相关的关键词，覆盖：
- 工具类（如 git, bash, docx, excel 等）
- 领域类（如 frontend, coding, data-analysis 等）
- 场景类（如 report, design, automation 等）`

export async function recommendCrew(
  messages: ChatCompletionMessageParam[],
  provider?: LLMProvider,
): Promise<CrewRecommendation> {
  const resolvedProvider = provider ?? routeModel('chat').provider

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
