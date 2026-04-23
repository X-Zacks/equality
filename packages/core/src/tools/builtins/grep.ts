/**
 * tools/builtins/grep.ts — 文本搜索工具
 *
 * 借鉴 OpenClaw 的 grep 工具设计（基于 ripgrep），
 * 但使用纯 JS 实现，不依赖外部二进制。
 *
 * 支持：正则/字面量搜索、大小写不敏感、上下文行、文件过滤、最大匹配数。
 */

import fs from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { truncateToolResult } from '../truncation.js'
import { guardPath } from './path-guard.js'

const MAX_MATCHES = 100
const MAX_OUTPUT_CHARS = 50_000
const MAX_LINE_LENGTH = 500
const DEFAULT_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/*.min.js', '**/*.min.css']
// 跳过二进制文件
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flv',
  '.zip', '.gz', '.tar', '.rar', '.7z', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock', '.sqlite', '.db',
])

interface GrepMatch {
  file: string
  line: number
  text: string
  context?: string[]
}

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function truncateLine(line: string): string {
  if (line.length <= MAX_LINE_LENGTH) return line
  return line.substring(0, MAX_LINE_LENGTH) + '…'
}

/**
 * 在单个文件中搜索
 */
function searchFile(
  absPath: string,
  regex: RegExp,
  contextLines: number,
): GrepMatch[] {
  let content: string
  try {
    content = fs.readFileSync(absPath, 'utf-8')
  } catch {
    return []
  }

  // 简单的二进制文件检测（包含 null byte）
  if (content.includes('\0')) return []

  const lines = content.split('\n')
  const matches: GrepMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      const match: GrepMatch = {
        file: absPath,
        line: i + 1,
        text: truncateLine(lines[i]),
      }

      if (contextLines > 0) {
        const ctxStart = Math.max(0, i - contextLines)
        const ctxEnd = Math.min(lines.length - 1, i + contextLines)
        const ctx: string[] = []
        for (let j = ctxStart; j <= ctxEnd; j++) {
          const prefix = j === i ? '>' : ' '
          ctx.push(`${prefix} ${j + 1} | ${truncateLine(lines[j])}`)
        }
        match.context = ctx
      }

      matches.push(match)

      // 重置 regex lastIndex（如果是 global 模式）
      regex.lastIndex = 0
    }
  }

  return matches
}

export const grepTool: ToolDefinition = {
  name: 'grep',
  description:
    'Search text in files using regex or literal patterns. ' +
    'Returns matching lines with line numbers and file paths. ' +
    'Searches all text files in workspace by default; use include to filter. ' +
    'Use when: regex matching needed, or searching non-code content (logs, config values, URLs, etc.). ' +
    'Prefer codebase_search for code search.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Search pattern (regex or literal string)',
      },
      path: {
        type: 'string',
        description: 'Search directory or file path (optional, defaults to workspace root)',
      },
      include: {
        type: 'string',
        description: 'Filename glob filter (e.g. "*.ts" or "src/**/*.py")',
      },
      ignore_case: {
        type: 'boolean',
        description: 'Whether to ignore case (default false)',
      },
      literal: {
        type: 'boolean',
        description: 'Treat pattern as literal string instead of regex (default false)',
      },
      context_lines: {
        type: 'number',
        description: 'Context lines to show before/after each match (default 0)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of matches (default 100)',
      },
    },
    required: ['pattern'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '')
    if (!pattern.trim()) {
      return { content: 'Error: pattern is required', isError: true }
    }

    const rawPath = input.path ? String(input.path) : ''
    if (rawPath) {
      const guard = guardPath(rawPath, ctx.workspaceDir)
      if ('error' in guard) return { content: guard.error, isError: true }
    }
    const searchPath = rawPath
      ? path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workspaceDir, rawPath)
      : ctx.workspaceDir

    const ignoreCase = Boolean(input.ignore_case)
    const literal = Boolean(input.literal)
    const contextLines = Math.min(Math.max(Number(input.context_lines) || 0, 0), 10)
    const maxResults = Math.min(Math.max(Number(input.max_results) || MAX_MATCHES, 1), 500)
    const includeGlob = input.include ? String(input.include) : undefined

    // 构建正则
    let regex: RegExp
    try {
      const escapedPattern = literal ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern
      regex = new RegExp(escapedPattern, ignoreCase ? 'i' : '')
    } catch (err) {
      return { content: `Error: invalid regex pattern: ${(err as Error).message}`, isError: true }
    }

    // 单文件搜索模式
    if (fs.existsSync(searchPath) && fs.statSync(searchPath).isFile()) {
      const matches = searchFile(searchPath, regex, contextLines)
      if (matches.length === 0) {
        return { content: `在 ${searchPath} 中未找到匹配 "${pattern}" 的内容` }
      }
      return { content: formatMatches(matches, maxResults, searchPath) }
    }

    // 目录搜索模式 — 使用 fast-glob 列出文件
    const globPattern = includeGlob || '**/*'
    let files: string[]
    try {
      files = await fg(globPattern, {
        cwd: searchPath,
        ignore: DEFAULT_IGNORE,
        onlyFiles: true,
        dot: false,
        absolute: true,
      })
    } catch (err) {
      return { content: `Error listing files: ${(err as Error).message}`, isError: true }
    }

    // 过滤二进制文件
    files = files.filter(f => !isBinaryFile(f))

    // 搜索所有文件
    const allMatches: GrepMatch[] = []
    for (const file of files) {
      if (allMatches.length >= maxResults) break
      const matches = searchFile(file, regex, contextLines)
      for (const m of matches) {
        allMatches.push(m)
        if (allMatches.length >= maxResults) break
      }
    }

    if (allMatches.length === 0) {
      return { content: `在 ${searchPath} 中未找到匹配 "${pattern}" 的内容` }
    }

    return { content: formatMatches(allMatches, maxResults, searchPath) }
  },
}

/**
 * 格式化搜索结果
 */
function formatMatches(matches: GrepMatch[], maxResults: number, baseDir: string): string {
  const truncated = matches.length >= maxResults
  const lines: string[] = []

  if (truncated) {
    lines.push(`⚠️ 结果已截断（显示前 ${maxResults} 条匹配）\n`)
  }

  // 按文件分组
  const byFile = new Map<string, GrepMatch[]>()
  for (const m of matches) {
    const rel = path.relative(baseDir, m.file) || m.file
    if (!byFile.has(rel)) byFile.set(rel, [])
    byFile.get(rel)!.push(m)
  }

  for (const [file, fileMatches] of byFile) {
    lines.push(`📄 ${file}`)
    for (const m of fileMatches) {
      if (m.context && m.context.length > 0) {
        lines.push(...m.context)
        lines.push('') // 空行分隔
      } else {
        lines.push(`  ${m.line}: ${m.text}`)
      }
    }
    lines.push('')
  }

  const header = `找到 ${matches.length} 条匹配（${byFile.size} 个文件）\n\n`
  const result = truncateToolResult(header + lines.join('\n'))
  return result.content
}
