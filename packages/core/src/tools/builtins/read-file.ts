/**
 * tools/builtins/read-file.ts — 文件读取工具
 *
 * 支持行范围、行号前缀、截断保护。
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { truncateToolResult } from '../truncation.js'
import { guardPath } from './path-guard.js'

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: '读取文件内容。支持指定行范围（1-based）。返回带行号前缀的文件内容。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（相对于工作目录，或绝对路径）' },
      start_line: { type: 'number', description: '起始行号（1-based，可选，默认第 1 行）' },
      end_line: { type: 'number', description: '结束行号（1-based，可选，默认最后一行）' },
    },
    required: ['path'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(input.path ?? '')
    if (!filePath.trim()) {
      return { content: 'Error: path is required', isError: true }
    }

    const guard = guardPath(filePath, ctx.workspaceDir)
    if ('error' in guard) return { content: guard.error, isError: true }
    const absPath = guard.absPath

    // 文件存在性检查
    if (!fs.existsSync(absPath)) {
      return { content: `Error: file not found: ${absPath}`, isError: true }
    }

    const stat = fs.statSync(absPath)
    if (stat.isDirectory()) {
      return { content: `Error: path is a directory, not a file: ${absPath}`, isError: true }
    }

    // 读取文件内容
    let content: string
    try {
      content = fs.readFileSync(absPath, 'utf-8')
    } catch (err) {
      // 尝试 latin1（二进制文件等不可读场景）
      try {
        content = fs.readFileSync(absPath, 'latin1')
      } catch (e) {
        return { content: `Error reading file: ${(e as Error).message}`, isError: true }
      }
    }

    // 按行处理
    const lines = content.split('\n')
    const startLine = Math.max(1, Number(input.start_line) || 1)
    const endLine = Math.min(lines.length, Number(input.end_line) || lines.length)

    if (startLine > lines.length) {
      return { content: `Error: start_line ${startLine} exceeds total lines ${lines.length}`, isError: true }
    }

    // 加行号前缀
    const maxLineNum = endLine
    const padWidth = String(maxLineNum).length
    const selectedLines = lines.slice(startLine - 1, endLine)
    const numbered = selectedLines.map((line, i) => {
      const lineNum = String(startLine + i).padStart(padWidth, ' ')
      return `${lineNum} | ${line}`
    })

    let result = numbered.join('\n')

    // 截断保护
    const truncated = truncateToolResult(result)

    // 文件信息头
    const header = startLine === 1 && endLine === lines.length
      ? `File: ${absPath} (${lines.length} lines)\n`
      : `File: ${absPath} (lines ${startLine}-${endLine} of ${lines.length})\n`

    return {
      content: header + truncated.content,
      metadata: {
        truncated: truncated.truncated,
        originalLength: truncated.originalLength,
      },
    }
  },
}
