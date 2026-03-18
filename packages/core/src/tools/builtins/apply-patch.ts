/**
 * tools/builtins/apply-patch.ts — 多文件补丁工具
 *
 * 借鉴 OpenClaw 的 apply_patch 设计：
 * - *** Begin Patch / *** End Patch 格式
 * - Add / Update / Delete 三种操作
 * - 四级回退匹配（seekSequence）
 * - 逆序 splice 应用替换
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'

/* ── 类型 ──────────────────────────────────────── */

interface PatchOp {
  type: 'add' | 'update' | 'delete'
  path: string
  content?: string      // add: 新文件内容
  hunks?: PatchHunk[]   // update: 变更 hunks
}

interface PatchHunk {
  context: string[]     // @@ 后的上下文行
  changes: HunkLine[]
}

interface HunkLine {
  type: 'keep' | 'remove' | 'add'
  text: string
}

/* ── Unicode 标点归一化 ──────────────────────── */

function normalizePunctuation(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2012\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
}

/* ── 四级回退匹配 ────────────────────────────── */

function linesMatch(
  fileLines: string[],
  pattern: string[],
  startIdx: number,
  transform: (s: string) => string,
): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (startIdx + i >= fileLines.length) return false
    if (transform(fileLines[startIdx + i]) !== transform(pattern[i])) return false
  }
  return true
}

/**
 * seekSequence — 四级回退匹配
 * 借鉴 OpenClaw 的 apply-patch-update.ts
 */
function seekSequence(
  lines: string[],
  pattern: string[],
  searchStart: number,
): number | null {
  if (pattern.length === 0) return searchStart
  const maxStart = lines.length - pattern.length

  // 第 1 级: 精确匹配
  for (let i = searchStart; i <= maxStart; i++) {
    if (linesMatch(lines, pattern, i, v => v)) return i
  }
  // 第 2 级: trimEnd
  for (let i = searchStart; i <= maxStart; i++) {
    if (linesMatch(lines, pattern, i, v => v.trimEnd())) return i
  }
  // 第 3 级: trim
  for (let i = searchStart; i <= maxStart; i++) {
    if (linesMatch(lines, pattern, i, v => v.trim())) return i
  }
  // 第 4 级: trim + normalizePunctuation
  for (let i = searchStart; i <= maxStart; i++) {
    if (linesMatch(lines, pattern, i, v => normalizePunctuation(v.trim()))) return i
  }

  return null
}

/* ── 补丁解析 ────────────────────────────────── */

function parsePatch(patchText: string): PatchOp[] {
  const lines = patchText.split('\n')
  const ops: PatchOp[] = []

  let i = 0

  // 跳过 *** Begin Patch
  while (i < lines.length && !lines[i].startsWith('*** Begin Patch')) i++
  i++ // 跳过 Begin Patch 行

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('*** End Patch')) break

    if (line.startsWith('*** Add File: ')) {
      const filePath = line.substring('*** Add File: '.length).trim()
      const contentLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('***')) {
        // Add 的行都以 + 开头
        contentLines.push(lines[i].startsWith('+') ? lines[i].substring(1) : lines[i])
        i++
      }
      ops.push({ type: 'add', path: filePath, content: contentLines.join('\n') })
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const filePath = line.substring('*** Delete File: '.length).trim()
      ops.push({ type: 'delete', path: filePath })
      i++
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const filePath = line.substring('*** Update File: '.length).trim()
      const hunks: PatchHunk[] = []
      i++

      while (i < lines.length && !lines[i].startsWith('***')) {
        if (lines[i].startsWith('@@ ')) {
          const contextLine = lines[i].substring(3)
          const context = contextLine ? [contextLine] : []
          const changes: HunkLine[] = []
          i++

          while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('***')) {
            const l = lines[i]
            if (l.startsWith('-')) {
              changes.push({ type: 'remove', text: l.substring(1) })
            } else if (l.startsWith('+')) {
              changes.push({ type: 'add', text: l.substring(1) })
            } else if (l.startsWith(' ') || l === '') {
              changes.push({ type: 'keep', text: l.startsWith(' ') ? l.substring(1) : l })
            }
            i++
          }

          hunks.push({ context, changes })
          continue
        }
        i++
      }

      ops.push({ type: 'update', path: filePath, hunks })
      continue
    }

    i++
  }

  return ops
}

/* ── 应用单个 Update hunk ────────────────────── */

interface Replacement {
  startLine: number
  removeCount: number
  insertLines: string[]
}

function computeReplacements(
  fileLines: string[],
  hunks: PatchHunk[],
): Replacement[] {
  const replacements: Replacement[] = []
  let searchFrom = 0

  for (const hunk of hunks) {
    // 从上下文行定位开始位置
    let startLine = searchFrom
    if (hunk.context.length > 0) {
      const found = seekSequence(fileLines, hunk.context, searchFrom)
      if (found !== null) {
        startLine = found + hunk.context.length
      }
    }

    // 收集连续的 keep+remove 行作为匹配模式
    const patternLines: string[] = []
    for (const c of hunk.changes) {
      if (c.type === 'keep' || c.type === 'remove') {
        patternLines.push(c.text)
      }
    }

    // 定位替换区域
    const matchPos = seekSequence(fileLines, patternLines, startLine)
    if (matchPos === null) continue  // 匹配失败，跳过此 hunk

    // 构建替换内容
    const insertLines: string[] = []
    for (const c of hunk.changes) {
      if (c.type === 'keep') insertLines.push(c.text)
      else if (c.type === 'add') insertLines.push(c.text)
      // remove 的行不加入
    }

    replacements.push({
      startLine: matchPos,
      removeCount: patternLines.length,
      insertLines,
    })

    searchFrom = matchPos + patternLines.length
  }

  return replacements
}

/* ── 工具定义 ────────────────────────────────── */

export const applyPatchTool: ToolDefinition = {
  name: 'apply_patch',
  description:
    '应用多文件补丁。使用 *** Begin Patch / *** End Patch 格式。' +
    '支持 Add File（创建）、Update File（修改）、Delete File（删除）三种操作。' +
    'Update 使用四级模糊匹配定位代码位置。',
  inputSchema: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: '补丁内容（*** Begin Patch ... *** End Patch 格式）',
      },
    },
    required: ['patch'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const patchText = String(input.patch ?? '')
    if (!patchText.includes('*** Begin Patch')) {
      return { content: 'Error: 补丁必须包含 "*** Begin Patch" 标记', isError: true }
    }

    const ops = parsePatch(patchText)
    if (ops.length === 0) {
      return { content: 'Error: 未解析到任何操作', isError: true }
    }

    const results: string[] = []
    let errors = 0

    for (const op of ops) {
      const absPath = path.isAbsolute(op.path)
        ? op.path
        : path.resolve(ctx.workspaceDir, op.path)

      // 安全检查：workspace 边界
      if (!absPath.startsWith(ctx.workspaceDir)) {
        results.push(`❌ ${op.path}: 路径超出工作区范围`)
        errors++
        continue
      }

      try {
        switch (op.type) {
          case 'add': {
            if (fs.existsSync(absPath)) {
              results.push(`❌ ${op.path}: 文件已存在（请使用 Update File）`)
              errors++
              break
            }
            fs.mkdirSync(path.dirname(absPath), { recursive: true })
            fs.writeFileSync(absPath, op.content ?? '', 'utf-8')
            results.push(`✅ 新建: ${op.path}`)
            break
          }

          case 'delete': {
            if (!fs.existsSync(absPath)) {
              results.push(`⚠️ ${op.path}: 文件不存在（已跳过）`)
              break
            }
            fs.unlinkSync(absPath)
            results.push(`✅ 删除: ${op.path}`)
            break
          }

          case 'update': {
            if (!fs.existsSync(absPath)) {
              results.push(`❌ ${op.path}: 文件不存在`)
              errors++
              break
            }

            let content = fs.readFileSync(absPath, 'utf-8')
            // Strip BOM
            if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

            // 检测行尾
            const hasCRLF = content.includes('\r\n')
            const contentLF = hasCRLF ? content.replace(/\r\n/g, '\n') : content
            const fileLines = contentLF.split('\n')

            // 计算替换
            const replacements = computeReplacements(fileLines, op.hunks ?? [])
            if (replacements.length === 0) {
              results.push(`⚠️ ${op.path}: 未找到匹配的代码位置（跳过）`)
              break
            }

            // 逆序应用（避免索引偏移）
            const sortedReplacements = [...replacements].sort((a, b) => b.startLine - a.startLine)
            for (const r of sortedReplacements) {
              fileLines.splice(r.startLine, r.removeCount, ...r.insertLines)
            }

            // 还原行尾 + 写入
            let output = fileLines.join('\n')
            if (hasCRLF) output = output.replace(/\n/g, '\r\n')

            // 备份
            const bakPath = absPath + '.equality-bak'
            fs.copyFileSync(absPath, bakPath)

            fs.writeFileSync(absPath, output, 'utf-8')
            results.push(`✅ 修改: ${op.path} (${replacements.length} 处替换)`)
            break
          }
        }
      } catch (err) {
        results.push(`❌ ${op.path}: ${(err as Error).message}`)
        errors++
      }
    }

    const summary = errors > 0
      ? `⚠️ 补丁应用完成，${errors} 个错误：`
      : `✅ 补丁应用成功：`

    return {
      content: `${summary}\n\n${results.join('\n')}`,
      isError: errors > 0,
    }
  },
}
