/**
 * tools/builtins/list-dir.ts — 目录列表工具
 *
 * 借鉴 OpenClaw 的 ls 工具设计：
 * - 读取目录内容
 * - 按字母排序（大小写不敏感）
 * - 目录加 / 后缀
 * - 显示文件大小
 * - 最大 500 条
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { guardPath } from './path-guard.js'

const MAX_ENTRIES = 500

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
}

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description:
    '列出目录内容。显示文件名、类型（目录加 / 后缀）和大小。' +
    '按字母排序，最多返回 500 条目。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '目录路径（可选，默认工作区根目录）',
      },
      max_entries: {
        type: 'number',
        description: '最大条目数（默认 500）',
      },
    },
    required: [],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const rawPath = input.path ? String(input.path) : ''
    if (rawPath) {
      const guard = guardPath(rawPath, ctx.workspaceDir)
      if ('error' in guard) return { content: guard.error, isError: true }
    }
    const dirPath = rawPath
      ? path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workspaceDir, rawPath)
      : ctx.workspaceDir

    const maxEntries = Math.min(
      Math.max(Number(input.max_entries) || MAX_ENTRIES, 1),
      MAX_ENTRIES,
    )

    // 验证路径
    if (!fs.existsSync(dirPath)) {
      return { content: `Error: directory not found: ${dirPath}`, isError: true }
    }

    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      return { content: `Error: path is not a directory: ${dirPath}`, isError: true }
    }

    // 读取目录
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch (err) {
      return { content: `Error reading directory: ${(err as Error).message}`, isError: true }
    }

    // 按字母排序（大小写不敏感），目录在前
    entries.sort((a, b) => {
      const aIsDir = a.isDirectory() ? 0 : 1
      const bIsDir = b.isDirectory() ? 0 : 1
      if (aIsDir !== bIsDir) return aIsDir - bIsDir
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })

    if (entries.length === 0) {
      return { content: `目录为空: ${dirPath}` }
    }

    const truncated = entries.length > maxEntries
    const displayEntries = truncated ? entries.slice(0, maxEntries) : entries

    const lines: string[] = []
    for (const entry of displayEntries) {
      try {
        if (entry.isDirectory()) {
          lines.push(`📁 ${entry.name}/`)
        } else if (entry.isSymbolicLink()) {
          lines.push(`🔗 ${entry.name}`)
        } else {
          const fileStat = fs.statSync(path.join(dirPath, entry.name))
          lines.push(`📄 ${entry.name}  (${formatSize(fileStat.size)})`)
        }
      } catch {
        lines.push(`❓ ${entry.name}  (inaccessible)`)
      }
    }

    const header = truncated
      ? `目录: ${dirPath} (显示 ${maxEntries}/${entries.length} 条)\n\n`
      : `目录: ${dirPath} (${entries.length} 条)\n\n`

    return { content: header + lines.join('\n') }
  },
}
