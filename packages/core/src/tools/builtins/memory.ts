/**
 * tools/builtins/memory.ts — 长期记忆工具
 *
 * Phase 12: memory_save + memory_search
 * Phase K2: memory_search 接入混合搜索（BM25 + cosine score fusion）
 * Phase M1: memory_save 传入 sessionKey + agentId + workspaceDir + source
 * 使用 SQLite + FTS5 + embedding 实现跨 Session 的长期记忆。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { memorySave, memorySearch, memoryList, memoryDelete, memoryCount, memoryCandidatesScoped, getAllMemoriesWithEmbedding, getDefaultEmbedder } from '../../memory/index.js'
import type { MemorySaveOptions, MemorySearchScope } from '../../memory/index.js'
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
        description: 'Content to remember (required). Should be a concise, meaningful statement.',
      },
      category: {
        type: 'string',
        description: 'Category (optional): preference, decision, fact, project, general (default)',
        enum: ['preference', 'decision', 'fact', 'project', 'general'],
      },
      importance: {
        type: 'number',
        description: 'Importance 1-10 (optional, default 5). 10 = most important.',
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
        description: 'Search keywords (required)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 5, max 20)',
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

    // M2: 作用域混合搜索（BM25 + cosine score fusion + scoped candidates）
    try {
      const scope: MemorySearchScope = { agentId: _ctx.agentId, workspaceDir: _ctx.workspaceDir }

      // BM25 搜索
      const bm25Results = memorySearch(query, limit * 2)
      const bm25Records: MemoryRecord[] = bm25Results.map(r => ({
        id: r.entry.id,
        text: r.entry.text,
        category: r.entry.category,
        bm25Score: Math.abs(r.rank),
        createdAt: r.entry.createdAt,
        pinned: r.entry.pinned,
      }))

      // 作用域候选（5-level 优先级）
      const scopedCandidates = memoryCandidatesScoped(scope)
      const scopedIds = new Set(scopedCandidates.map(e => e.id))

      // 只对 scope 内的 BM25 结果做 fusion
      const scopedBm25 = bm25Records.filter(r => scopedIds.has(r.id))
      const candidateRecords: MemoryRecord[] = scopedCandidates.map(e => ({
        id: e.id,
        text: e.text,
        category: e.category,
        embedding: e.embedding,
        createdAt: e.createdAt,
        pinned: e.pinned,
      }))

      const embedder = getDefaultEmbedder()
      const hybridResults = await hybridSearch(
        scopedBm25,
        candidateRecords,
        query,
        embedder,
        { query, limit, alpha: 0.4 },
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

// ─── memory_list ──────────────────────────────────────────────────────────────

export const memoryListTool: ToolDefinition = {
  name: 'memory_list',
  description:
    'List all saved memories, optionally filtered by category. ' +
    'Use this to show the user what memories exist or to audit stored information.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category (optional): preference, decision, fact, project, general',
        enum: ['preference', 'decision', 'fact', 'project', 'general'],
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 50)',
      },
    },
    required: [],
  },

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 20))
    const total = memoryCount()
    let entries = memoryList(limit * 2) // fetch more, then filter

    const cat = args.category ? String(args.category) : undefined
    if (cat) {
      entries = entries.filter(e => e.category === cat)
    }
    entries = entries.slice(0, limit)

    if (entries.length === 0) {
      return { content: cat ? `没有分类为 "${cat}" 的记忆 (共 ${total} 条)` : `记忆库为空` }
    }

    const lines = entries.map((e, i) => {
      const date = new Date(e.createdAt).toLocaleString('zh-CN')
      return `${i + 1}. [${e.category}] ${e.text.slice(0, 120)}${e.text.length > 120 ? '...' : ''}\n   ID: ${e.id.slice(0, 8)} | 重要性: ${e.importance} | ${date}`
    })

    return { content: `📋 记忆列表 (${entries.length}/${total} 条)${cat ? ` [${cat}]` : ''}:\n\n${lines.join('\n\n')}` }
  },
}

// ─── memory_delete ────────────────────────────────────────────────────────────

export const memoryDeleteTool: ToolDefinition = {
  name: 'memory_delete',
  description:
    'Delete a specific memory by ID. Use when the user asks to forget something ' +
    'or when outdated/incorrect memories need to be removed. ' +
    'Use memory_list or memory_search first to find the memory ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Memory ID to delete (from memory_list/memory_search, at least 8-char prefix to match)',
      },
    },
    required: ['id'],
  },

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const id = String(args.id ?? '').trim()
    if (!id) return { content: 'Error: id is required', isError: true }

    // 支持前缀匹配
    const all = memoryList(1000)
    const match = all.find(e => e.id.startsWith(id))
    if (!match) return { content: `Error: 未找到 ID 以 "${id}" 开头的记忆`, isError: true }

    memoryDelete(match.id)
    return {
      content: `🗑️ 已删除记忆\nID: ${match.id.slice(0, 8)}\n内容: ${match.text.slice(0, 100)}`,
    }
  },
}
