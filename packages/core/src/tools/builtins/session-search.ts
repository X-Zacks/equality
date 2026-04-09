/**
 * tools/builtins/session-search.ts — Phase O4: 历史会话搜索工具
 *
 * 使用 FTS5 全文搜索历史会话内容，帮助 Agent 查找过去的对话记录。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { searchSessions } from '../../session/search-db.js'
import { load as loadSession } from '../../session/persist.js'

// ─── session_search ──────────────────────────────────────────────────────────

export const sessionSearchTool: ToolDefinition = {
  name: 'session_search',
  description:
    'Search past conversation sessions for relevant context using full-text search. ' +
    'Use when the user mentions "last time", "before", "previously", or when context from earlier sessions would be helpful. ' +
    'Returns matching conversation snippets with session info.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — keywords to find in past conversations.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10).',
      },
    },
    required: ['query'],
  },

  async execute(
    args: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    const query = String(args.query ?? '').trim()
    if (!query) {
      return { content: 'Error: query cannot be empty.', isError: true }
    }

    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50)

    try {
      const results = searchSessions(query, limit)

      if (results.length === 0) {
        return { content: 'No matching sessions found.' }
      }

      // 按 session 分组
      const grouped = new Map<string, typeof results>()
      for (const r of results) {
        const arr = grouped.get(r.sessionKey) ?? []
        arr.push(r)
        grouped.set(r.sessionKey, arr)
      }

      // 格式化输出
      const lines: string[] = []
      for (const [sessionKey, turns] of grouped) {
        // 尝试获取 session title
        let title = sessionKey.slice(0, 8)
        try {
          const sessionData = await loadSession(sessionKey)
          if (sessionData?.title) {
            title = sessionData.title
          }
        } catch { /* ignore */ }

        const date = turns[0] ? new Date().toLocaleDateString('zh-CN') : ''
        lines.push(`Session: ${title} (${date})`)
        for (const t of turns) {
          lines.push(`  Turn ${t.turnIndex}: ${t.role}: ${t.snippet}`)
        }
        lines.push('---')
      }

      return { content: lines.join('\n') }
    } catch (err) {
      return {
        content: `Error searching sessions: ${(err as Error).message}`,
        isError: true,
      }
    }
  },
}
