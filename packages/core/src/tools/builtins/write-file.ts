/**
 * tools/builtins/write-file.ts — 文件写入工具
 *
 * 自动创建目录、写入前备份、UTF-8 编码。
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { guardPath } from './path-guard.js'

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Create or overwrite a file. Automatically creates intermediate directories. Creates a .equality-bak backup before writing.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative to workspace dir, or absolute)' },
      content: { type: 'string', description: 'File content to write' },
    },
    required: ['path', 'content'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(input.path ?? '')
    const content = String(input.content ?? '')

    if (!filePath.trim()) {
      return { content: 'Error: path is required', isError: true }
    }

    const guard = guardPath(filePath, ctx.workspaceDir, { sandboxEnabled: ctx.sandboxEnabled })
    if ('error' in guard) return { content: guard.error, isError: true }
    const absPath = guard.absPath
    const dir = path.dirname(absPath)

    try {
      // 确保目录存在
      fs.mkdirSync(dir, { recursive: true })

      // 写入前备份（仅当文件已存在时）
      if (fs.existsSync(absPath)) {
        const bakPath = absPath + '.equality-bak'
        fs.copyFileSync(absPath, bakPath)
      }

      // 写入文件
      fs.writeFileSync(absPath, content, 'utf-8')
      const bytes = Buffer.byteLength(content, 'utf-8')

      return {
        content: `✅ 文件已写入: ${absPath}\n大小: ${bytes} bytes (${content.split('\n').length} 行)`,
      }
    } catch (err) {
      return {
        content: `Error writing file: ${(err as Error).message}`,
        isError: true,
      }
    }
  },
}
