/**
 * tools/builtins/edit-file.ts — 精确文本替换编辑工具
 *
 * 借鉴 OpenClaw 的 edit_file 设计：
 * - search-and-replace 模式
 * - 两级模糊匹配回退（精确 → Unicode 归一化）
 * - 唯一性检查（防止替换到错误位置）
 * - 生成 diff 反馈
 */

import fs from 'node:fs'
import path from 'node:path'
import { guardPath } from './path-guard.js'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'

/* ── Unicode 归一化 ───────────────────────────── */

/**
 * 归一化 Unicode 特殊字符为 ASCII 等价物
 * 借鉴 OpenClaw 的 normalizePunctuation
 */
function normalizeUnicode(s: string): string {
  return s
    // 智能引号 → ASCII 引号
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // 各种 Unicode 破折号 → ASCII 连字符
    .replace(/[\u2013\u2014\u2015\u2012\uFE58\uFE63\uFF0D]/g, '-')
    // 各种 Unicode 空格 → 普通空格
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    // 去除尾部空白
    .trimEnd()
}

/**
 * 统计 text 在 content 中的出现次数
 */
function countOccurrences(content: string, text: string): number {
  if (!text) return 0
  let count = 0
  let pos = 0
  while ((pos = content.indexOf(text, pos)) !== -1) {
    count++
    pos += text.length
  }
  return count
}

/**
 * 按行归一化后搜索（Unicode 模糊匹配）
 * 返回原始 content 中的 [start, end] 位置
 */
function fuzzyFind(content: string, search: string): { start: number; end: number } | null {
  const contentNorm = normalizeUnicode(content)
  const searchNorm = normalizeUnicode(search)

  const pos = contentNorm.indexOf(searchNorm)
  if (pos === -1) return null

  // 还需检查唯一性
  if (contentNorm.indexOf(searchNorm, pos + searchNorm.length) !== -1) {
    return null // 多次匹配，不安全
  }

  // 原始文本中对应的起止位置
  // 由于归一化可能改变字符数量（很少），我们用逐段对齐
  // 简化实现：归一化后的 pos 直接对应原始 pos（单字符替换，长度不变）
  return { start: pos, end: pos + searchNorm.length }
}

/**
 * 生成简洁的 unified diff 预览
 */
function generateDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
  oldString: string,
  newString: string,
): string {
  // 找到变更所在行
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  // 找 oldString 第一行所在行号
  const prefix = oldContent.substring(0, oldContent.indexOf(oldString))
  const startLine = prefix.split('\n').length

  const oldMatchLines = oldString.split('\n')
  const newMatchLines = newString.split('\n')

  const contextLines = 3
  const diffStart = Math.max(1, startLine - contextLines)
  const diffEndOld = Math.min(oldLines.length, startLine + oldMatchLines.length - 1 + contextLines)
  const diffEndNew = Math.min(newLines.length, startLine + newMatchLines.length - 1 + contextLines)

  const lines: string[] = [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -${diffStart},${diffEndOld - diffStart + 1} +${diffStart},${diffEndNew - diffStart + 1} @@`,
  ]

  // 上方上下文
  for (let i = diffStart; i < startLine; i++) {
    lines.push(` ${oldLines[i - 1]}`)
  }
  // 被删除的行
  for (const line of oldMatchLines) {
    lines.push(`-${line}`)
  }
  // 新增的行
  for (const line of newMatchLines) {
    lines.push(`+${line}`)
  }
  // 下方上下文
  for (let i = startLine + oldMatchLines.length; i <= diffEndOld; i++) {
    lines.push(` ${oldLines[i - 1] ?? ''}`)
  }

  return lines.join('\n')
}

/* ── 工具定义 ─────────────────────────────────── */

export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description:
    'Replace a text segment in a file precisely. Provide old_string (exact text to replace) and new_string (replacement). ' +
    'old_string must appear exactly once in the file. Supports Unicode fuzzy matching. ' +
    'To create a new file, use the write_file tool. ' +
    'To append to end of file, set old_string to empty string.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path (relative to workspace dir, or absolute)',
      },
      old_string: {
        type: 'string',
        description: 'Exact text to replace. Must appear exactly once in the file. Set to empty string to append at end.',
      },
      new_string: {
        type: 'string',
        description: 'Replacement text',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(input.path ?? '')
    const oldString = String(input.old_string ?? '')
    const newString = String(input.new_string ?? '')

    if (!filePath.trim()) {
      return { content: 'Error: path is required', isError: true }
    }

    const guard = guardPath(filePath, ctx.workspaceDir, { sandboxEnabled: ctx.sandboxEnabled })
    if ('error' in guard) return { content: guard.error, isError: true }
    const absPath = guard.absPath

    // ── 追加模式（old_string 为空）────────────────
    if (oldString === '') {
      try {
        const dir = path.dirname(absPath)
        fs.mkdirSync(dir, { recursive: true })

        // 如果文件存在则追加，否则创建
        if (fs.existsSync(absPath)) {
          fs.appendFileSync(absPath, newString, 'utf-8')
          return { content: `✅ 已追加内容到 ${absPath} (${newString.length} 字符)` }
        } else {
          fs.writeFileSync(absPath, newString, 'utf-8')
          return { content: `✅ 已创建文件 ${absPath} (${newString.length} 字符)` }
        }
      } catch (err) {
        return { content: `Error: ${(err as Error).message}`, isError: true }
      }
    }

    // ── 替换模式 ──────────────────────────────────
    if (!fs.existsSync(absPath)) {
      return { content: `Error: file not found: ${absPath}`, isError: true }
    }

    let content: string
    try {
      content = fs.readFileSync(absPath, 'utf-8')
    } catch (err) {
      return { content: `Error reading file: ${(err as Error).message}`, isError: true }
    }

    // Strip BOM
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1)
    }

    // 检测行尾
    const hasCRLF = content.includes('\r\n')

    // 归一化为 LF 处理
    const contentLF = hasCRLF ? content.replace(/\r\n/g, '\n') : content
    const oldStringLF = oldString.replace(/\r\n/g, '\n')
    const newStringLF = newString.replace(/\r\n/g, '\n')

    let finalContent: string

    // ── 第 1 级：精确匹配 ─────────────────────────
    const exactCount = countOccurrences(contentLF, oldStringLF)
    if (exactCount === 1) {
      finalContent = contentLF.replace(oldStringLF, newStringLF)
    } else if (exactCount > 1) {
      return {
        content: `Error: old_string 在文件中出现了 ${exactCount} 次，无法安全替换。请提供更多上下文使其唯一。\n\n提示：包含更多前后行来确保唯一性。`,
        isError: true,
      }
    } else {
      // ── 第 2 级：Unicode 模糊匹配 ───────────────
      const fuzzyResult = fuzzyFind(contentLF, oldStringLF)
      if (fuzzyResult) {
        finalContent =
          contentLF.substring(0, fuzzyResult.start) +
          newStringLF +
          contentLF.substring(fuzzyResult.end)
      } else {
        // 匹配失败，给出有用的诊断信息
        const firstLine = oldStringLF.split('\n')[0].trim()
        const hint = firstLine
          ? contentLF.includes(firstLine)
            ? `提示：文件中包含 "${firstLine.substring(0, 60)}" 但完整的 old_string 不匹配。请检查空白字符和缩进。`
            : `提示：文件中未找到 "${firstLine.substring(0, 60)}"。请确认文件内容是否正确。`
          : ''

        return {
          content: `Error: old_string 在文件中未找到。\n${hint}\n\n建议：先用 read_file 工具查看文件内容，再用精确的文本进行替换。`,
          isError: true,
        }
      }
    }

    // ── 还原行尾 + 写入 ──────────────────────────
    const output = hasCRLF ? finalContent.replace(/\n/g, '\r\n') : finalContent

    try {
      // 备份
      const bakPath = absPath + '.equality-bak'
      fs.copyFileSync(absPath, bakPath)

      fs.writeFileSync(absPath, output, 'utf-8')
    } catch (err) {
      return { content: `Error writing file: ${(err as Error).message}`, isError: true }
    }

    // ── 生成 diff 反馈 ───────────────────────────
    const diff = generateDiff(absPath, contentLF, finalContent, oldStringLF, newStringLF)

    return {
      content: `✅ 已编辑 ${absPath}\n\n\`\`\`diff\n${diff}\n\`\`\``,
    }
  },
}
