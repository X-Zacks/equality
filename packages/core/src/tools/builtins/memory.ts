/**
 * tools/builtins/memory.ts — 长期记忆工具
 *
 * Phase 12: memory_save + memory_search
 * 使用 SQLite + FTS5 实现跨 Session 的长期记忆。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { memorySave, memorySearch, memoryList, memoryDelete, memoryCount } from '../../memory/index.js'

// ─── memory_save ──────────────────────────────────────────────────────────────

export const memorySaveTool: ToolDefinition = {
  name: 'memory_save',
  description:
    '将一条信息保存到长期记忆中。用于记住用户偏好、项目约定、技术决策等重要信息。' +
    '这些记忆会跨会话持久保留，在未来的对话中自动检索。',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: '要记住的内容（必填）。应该是简洁、有意义的陈述句。',
      },
      category: {
        type: 'string',
        description: '分类（可选）：preference（偏好）、decision（决策）、fact（事实）、project（项目）、general（通用，默认）',
        enum: ['preference', 'decision', 'fact', 'project', 'general'],
      },
      importance: {
        type: 'number',
        description: '重要性 1-10（可选，默认 5）。10 = 最重要。',
      },
    },
    required: ['text'],
  },

  async execute(
    args: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    const text = String(args.text ?? '').trim()
    if (!text) {
      return { content: 'Error: text 不能为空', isError: true }
    }
    if (text.length > 2000) {
      return { content: 'Error: 单条记忆不能超过 2000 字符', isError: true }
    }

    const category = String(args.category ?? 'general')
    const importance = Math.min(10, Math.max(1, Number(args.importance) || 5))

    const entry = memorySave(text, category, importance)
    return {
      content: `✅ 已保存记忆 (id: ${entry.id.slice(0, 8)})\n` +
        `分类: ${category} | 重要性: ${importance}\n` +
        `内容: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`,
    }
  },
}

// ─── memory_search ────────────────────────────────────────────────────────────

export const memorySearchTool: ToolDefinition = {
  name: 'memory_search',
  description:
    '搜索长期记忆。使用全文检索（BM25）查找之前保存的记忆。' +
    '可以用来回忆用户偏好、项目约定、之前的决策等。',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词（必填）',
      },
      limit: {
        type: 'number',
        description: '最大返回条数（默认 5，最大 20）',
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
      return { content: 'Error: query 不能为空', isError: true }
    }

    const limit = Math.min(20, Math.max(1, Number(args.limit) || 5))
    const results = memorySearch(query, limit)
    const total = memoryCount()

    if (results.length === 0) {
      return { content: `未找到相关记忆 (数据库共 ${total} 条)` }
    }

    const lines = results.map((r, i) => {
      const date = new Date(r.entry.createdAt).toLocaleString('zh-CN')
      return `${i + 1}. [${r.entry.category}] ${r.entry.text}\n   (重要性: ${r.entry.importance}, 时间: ${date})`
    })

    return {
      content: `找到 ${results.length} 条相关记忆 (共 ${total} 条):\n\n${lines.join('\n\n')}`,
    }
  },
}
