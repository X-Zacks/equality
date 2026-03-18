/**
 * tools/builtins/glob.ts — 文件搜索工具
 *
 * 使用 fast-glob，默认忽略 node_modules/.git/dist/build，最多 500 条。
 */

import fg from 'fast-glob'
import path from 'node:path'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'

const MAX_RESULTS = 500
const DEFAULT_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']

export const globTool: ToolDefinition = {
  name: 'glob',
  description: '搜索匹配 glob 模式的文件路径。返回相对路径列表。默认忽略 node_modules、.git、dist、build。',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'glob 模式（如 **/*.ts、src/**/*.py）' },
      cwd: { type: 'string', description: '搜索起始目录（可选，默认工作区根目录）' },
    },
    required: ['pattern'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '')
    if (!pattern.trim()) {
      return { content: 'Error: pattern is required', isError: true }
    }

    const cwd = input.cwd
      ? path.isAbsolute(String(input.cwd))
        ? String(input.cwd)
        : path.resolve(ctx.workspaceDir, String(input.cwd))
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
