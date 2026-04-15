/**
 * tools/builtins/codebase-search.ts — 代码库搜索工具
 *
 * Phase N3 (N3.4.1): codebase_search 内建工具
 * - 语义 + 关键词 + 符号混合检索
 * - 集成 CodeSearchEngine
 * - 延迟索引构建
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { FileScanner, DEFAULT_SCANNER_CONFIG } from '../../indexer/file-scanner.js'
import { ChunkIndexer } from '../../indexer/chunk-indexer.js'
import { CodeSearchEngine } from '../../indexer/search-engine.js'
import type { CodeSearchResult } from '../../indexer/search-engine.js'

// ─── 全局单例索引（延迟初始化） ──────────────────────────────────────────────

let _scanner: FileScanner | null = null
let _indexer: ChunkIndexer | null = null
let _engine: CodeSearchEngine | null = null
let _indexBuilt = false
let _building = false

/**
 * 确保索引已构建。首次调用时触发全量扫描+分块。
 */
async function ensureIndex(workspaceDir: string): Promise<CodeSearchEngine> {
  if (_engine && _indexBuilt) return _engine

  if (_building) {
    // 等待正在进行的构建完成
    while (_building) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (_engine) return _engine
  }

  _building = true
  try {
    _scanner = new FileScanner({ rootDir: workspaceDir })
    _indexer = new ChunkIndexer()
    _engine = new CodeSearchEngine()

    const scanResult = _scanner.scanAll()

    // 对所有扫描到的文件进行分块
    for (const file of scanResult.indexedFiles) {
      if (file.content) {
        _indexer.indexFile(file.relativePath, file.content)
      }
    }

    _engine.loadChunks([..._indexer.allChunks])
    _indexBuilt = true

    return _engine
  } finally {
    _building = false
  }
}

/**
 * 重置索引（用于测试或工作区切换）。
 */
export function resetCodebaseIndex(): void {
  _scanner = null
  _indexer = null
  _engine = null
  _indexBuilt = false
  _building = false
}

// ─── 工具定义 ─────────────────────────────────────────────────────────────────

export const codebaseSearchTool: ToolDefinition = {
  name: 'codebase_search',
  description:
    '在项目代码库中搜索代码。这是搜索代码的首选工具，支持符号名、关键词和自然语言查询。' +
    '直接返回匹配的代码片段和上下文，无需再用 read_file 读取。' +
    'Use when: 搜索函数、变量、类的使用位置，查找某功能的实现，以及任何代码搜索任务。' +
    'NOT for: 正则表达式搜索用 grep，查类型签名用 lsp_hover，查定义用 lsp_definition。',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询（自然语言或代码片段）',
      },
      file_pattern: {
        type: 'string',
        description: '文件 glob 过滤（如 "src/**/*.ts"）',
      },
      max_results: {
        type: 'number',
        description: '最大返回数量（默认 10）',
      },
    },
    required: ['query'],
  },
  sectionId: 'fs',
  profiles: ['coding'],

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const query = input.query as string
    const filePattern = input.file_pattern as string | undefined
    const maxResults = (input.max_results as number) ?? 10

    if (!query || query.trim().length === 0) {
      return { content: '错误：query 不能为空', isError: true }
    }

    const start = Date.now()

    let engine: CodeSearchEngine
    try {
      engine = await ensureIndex(ctx.workspaceDir)
    } catch (err) {
      return {
        content: `项目索引构建失败: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }

    const results = await engine.search(query, {
      maxResults,
      fileFilter: filePattern ? [filePattern] : undefined,
    })

    const durationMs = Date.now() - start

    if (results.length === 0) {
      return {
        content: `未找到与 "${query}" 相关的代码片段。`,
        metadata: { durationMs },
      }
    }

    const formatted = formatResults(query, results, durationMs)
    return {
      content: formatted,
      metadata: { durationMs },
    }
  },
}

// ─── 格式化 ─────────────────────────────────────────────────────────────────

function formatResults(
  query: string,
  results: CodeSearchResult[],
  durationMs: number,
): string {
  const lines: string[] = [
    `Found ${results.length} results for "${query}" (${durationMs}ms):`,
    '',
  ]

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const symbolStr = r.symbols.length > 0 ? r.symbols.join(', ') : '(none)'
    lines.push(`${i + 1}. ${r.filePath}:${r.startLine}-${r.endLine} (score: ${r.score.toFixed(4)}, ${r.matchType})`)
    lines.push(`   Symbols: ${symbolStr}`)

    // 截取前 10 行代码
    const contentLines = r.content.split('\n')
    const preview = contentLines.slice(0, 10)
    lines.push('   ```')
    for (const line of preview) {
      lines.push(`   ${line}`)
    }
    if (contentLines.length > 10) {
      lines.push(`   ... (${contentLines.length - 10} more lines)`)
    }
    lines.push('   ```')
    lines.push('')
  }

  return lines.join('\n')
}
