/**
 * tools/builtins/memory.ts — 长期记忆工具
 *
 * Phase 12: memory_save + memory_search
 * Phase K2: memory_search 接入混合搜索（BM25 + cosine score fusion）
 * Phase M1: memory_save 传入 sessionKey + agentId + workspaceDir + source
 * 使用 SQLite + FTS5 + embedding 实现跨 Session 的长期记忆。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { memorySave, memorySearch, memoryList, memoryDelete, memoryCount, getAllMemoriesWithEmbedding, getDefaultEmbedder } from '../../memory/index.js'
import type { MemorySaveOptions } from '../../memory/index.js'
import { hybridSearch } from '../../memory/index.js'
import type { MemoryRecord } from '../../memory/index.js'

// ─── memory_save ──────────────────────────────────────────────────────────────

export const memorySaveTool: ToolDefinition = {
  name: 'memory_save',
  description:
    'Save information to persistent long-term memory that survives across sessions. ' +
    'Use this tool when the user asks you to remember something, states a preference, ' +
    'shares personal info (name, timezone, habits), or when an important decision is made. ' +
    'Do NOT use write_file to .md files for this purpose — use this tool instead.',
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
    ctx: ToolContext,
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

    // M1: 传入完整上下文
    const opts: MemorySaveOptions = {
      category,
      importance,
      sessionKey: ctx.sessionKey,
      agentId: ctx.agentId ?? 'default',
      workspaceDir: ctx.workspaceDir,
      source: 'tool',
    }

    const result = memorySave(text, opts)

    // 去重或安全拦截
    if ('blocked' in result) {
      return { content: `⚠️ 记忆被安全扫描拦截 (${result.type})`, isError: true }
    }
    if ('duplicate' in result) {
      return {
        content: `ℹ️ 检测到近似记忆 (相似度: ${result.similarity.toFixed(2)})，已跳过保存。\n` +
          `已有记忆: ${result.existingText.slice(0, 100)}`,
      }
    }

    return {
      content: `✅ 已保存记忆 (id: ${result.id.slice(0, 8)})\n` +
        `分类: ${category} | 重要性: ${importance}\n` +
        `内容: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`,
    }
  },
}

// ─── memory_search ────────────────────────────────────────────────────────────

export const memorySearchTool: ToolDefinition = {
  name: 'memory_search',
  description:
    'Search persistent long-term memory for previously saved information. ' +
    'Use this tool when the user asks "do you remember...", "what did I say about...", ' +
    'or when you need to recall user preferences, names, past decisions, or project conventions. ' +
    'Do NOT use read_file on .md files to recall personal info — use this tool instead.',
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
    const total = memoryCount()

    // K2: 混合搜索（BM25 + cosine score fusion）
    try {
      const bm25Results = memorySearch(query, limit * 2) // 多取一些 BM25 结果用于融合
      const allWithEmbedding = getAllMemoriesWithEmbedding()
      const embedder = getDefaultEmbedder()

      // 转换 BM25 结果为 MemoryRecord 格式
      const bm25Records: MemoryRecord[] = bm25Results.map(r => ({
        id: r.entry.id,
        text: r.entry.text,
        category: r.entry.category,
        bm25Score: Math.abs(r.rank), // FTS5 rank 是负数，取绝对值
      }))

      const hybridResults = await hybridSearch(
        bm25Records,
        allWithEmbedding.map(r => ({
          id: r.id,
          text: r.text,
          category: r.category,
          embedding: r.embedding,
        })),
        query,
        embedder,
        { query, limit, alpha: 0.4 }, // alpha=0.4 偏向语义，解决词汇不匹配问题
      )

      if (hybridResults.length === 0) {
        return { content: `未找到相关记忆 (数据库共 ${total} 条)` }
      }

      const lines = hybridResults.map((r, i) => {
        return `${i + 1}. [${r.category ?? 'general'}] ${r.text}\n   (综合得分: ${r.score.toFixed(3)}, BM25: ${r.bm25Score.toFixed(3)}, 语义: ${r.cosineScore.toFixed(3)})`
      })

      return {
        content: `找到 ${hybridResults.length} 条相关记忆 (共 ${total} 条):\n\n${lines.join('\n\n')}`,
      }
    } catch (err) {
      // 降级到纯 BM25
      console.warn('[memory_search] hybrid search 失败，降级到 BM25:', err)
      const results = memorySearch(query, limit)

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
    }
  },
}
