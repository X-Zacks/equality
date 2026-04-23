/**
 * tools/builtins/skill-search.ts — skill_search 工具
 *
 * Chat/Crew 双模态：按需搜索可用 Skills，替代全量注入。
 * 使用 BM25 + 关键词混合检索。
 */

import type { ToolDefinition } from '../types.js'
import { getGlobalRetriever } from '../../skills/retriever.js'

export const skillSearchTool: ToolDefinition = {
  name: 'skill_search',
  description:
    'Search available Skills. Use when you think there might be an existing Skill relevant to the current task. Returns matching Skill names and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search keywords or intent description, e.g. "git commit" or "create PowerPoint"',
      },
      topK: {
        type: 'number',
        description: 'Number of results to return, default 5',
      },
    },
    required: ['query'],
  },
  execute: async (input) => {
    const query = String(input.query ?? '').trim()
    if (!query) {
      return { content: 'query is required', isError: true }
    }

    const topK = typeof input.topK === 'number' ? Math.min(input.topK, 20) : 5
    const retriever = getGlobalRetriever()
    const results = retriever.search(query, topK)

    if (results.length === 0) {
      return { content: `没有找到与 "${query}" 匹配的 Skill。` }
    }

    const lines = results.map((r, i) =>
      `${i + 1}. **${r.skill.name}** (score: ${r.score.toFixed(1)})\n   ${r.skill.description}\n   📁 ${r.skill.filePath}`
    )

    return {
      content: `找到 ${results.length} 个匹配的 Skill：\n\n${lines.join('\n\n')}\n\n💡 使用 skill_view 查看完整内容。`,
    }
  },
}
