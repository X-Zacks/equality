/**
 * tools/builtins/skill-search.ts — skill_search 工具
 *
 * Chat/Crew 双模态：按需搜索可用 Skills，替代全量注入。
 * Phase K2 升级：RAG embedding 混合检索 + 交互式确认（Mode B）。
 *
 * 流程：Agent 调用 skill_search → RAG 检索 → 命中 → 返回交互式载荷
 *       → 用户确认「使用」→ Skill body 注入 context → Agent 继续
 */

import type { ToolDefinition } from '../types.js'
import { getGlobalRetriever } from '../../skills/retriever.js'
import { getGlobalRAGRetriever } from '../../skills/rag-retriever.js'

export const skillSearchTool: ToolDefinition = {
  name: 'skill_search',
  description:
    'Search available Skills using semantic search. Use when you think there might be an existing Skill relevant to the current task. Returns matching Skills with an interactive confirmation for the user to approve injection.',
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

    // 优先使用 RAG retriever，降级到原始 BM25 retriever
    const ragRetriever = getGlobalRAGRetriever()
    if (ragRetriever) {
      const results = await ragRetriever.search(query, topK)

      if (results.length === 0) {
        return { content: `没有找到与 "${query}" 匹配的 Skill。` }
      }

      const top = results[0]
      const otherLines = results.slice(1).map((r, i) =>
        `${i + 2}. **${r.skillName}** (score: ${r.score.toFixed(2)})`
      )

      const content = [
        `找到 ${results.length} 个匹配的 Skill：`,
        '',
        `1. **${top.skillName}** (score: ${top.score.toFixed(2)})`,
        ...(top.matchedChunks.length > 0
          ? [`   匹配段落：${top.matchedChunks[0].heading}`]
          : []),
        ...otherLines,
      ].join('\n')

      return {
        content,
        interactive: {
          type: 'skill-confirm',
          skillName: top.skillName,
          score: top.score,
          preview: top.skill?.description ?? '',
          actions: [
            { id: 'use', label: '使用此技能', primary: true },
            { id: 'skip', label: '跳过' },
          ],
        },
      }
    }

    // Fallback: 原始 BM25 retriever
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
