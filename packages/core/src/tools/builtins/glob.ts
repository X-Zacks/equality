/**
 * tools/builtins/glob.ts — 文件搜索工具
 *
 * 使用 fast-glob，默认忽略 node_modules/.git/dist/build，最多 500 条。
 */

import fg from 'fast-glob'
import path from 'node:path'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { guardPath } from './path-guard.js'

const MAX_RESULTS = 500
const DEFAULT_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Search for file paths matching a glob pattern. Returns relative path list. Ignores node_modules, .git, dist, build by default.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g. **/*.ts, src/**/*.py)' },
      cwd: { type: 'string', description: 'Search root directory (optional, defaults to workspace root)' },
    },
    required: ['pattern'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '')
    if (!pattern.trim()) {
      return { content: 'Error: pattern is required', isError: true }
    }

    const rawCwd = input.cwd ? String(input.cwd) : ''
    if (rawCwd) {
      const guard = guardPath(rawCwd, ctx.workspaceDir)
      if ('error' in guard) return { content: guard.error, isError: true }
    }
    const cwd = rawCwd
      ? path.isAbsolute(rawCwd)
        ? rawCwd
        : path.resolve(ctx.workspaceDir, rawCwd)
      : ctx.workspaceDir

    try {
      const files = await fg(pattern, {
        cwd,
        ignore: DEFAULT_IGNORE,
        onlyFiles: true,
        dot: false,
      })

      if (files.length === 0) {
        return { content: `没有找到匹配 "${pattern}" 的文件` }
      }

      const truncated = files.length > MAX_RESULTS
      const display = truncated ? files.slice(0, MAX_RESULTS) : files
      const result = display.join('\n')

      const header = truncated
        ? `找到 ${files.length} 个文件（仅显示前 ${MAX_RESULTS} 个）：\n`
        : `找到 ${files.length} 个文件：\n`

      return { content: header + result }
    } catch (err) {
      return {
        content: `Error searching files: ${(err as Error).message}`,
        isError: true,
      }
    }
  },
}
