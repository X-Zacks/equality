/**
 * tools/lsp/helpers.ts — LSP 工具共享辅助函数
 *
 * 4 个 LSP 工具共用的：参数解析、路径转换、缺失依赖处理、客户端获取。
 */

import path from 'node:path'
import fs from 'node:fs'
import type { ToolResult, ToolContext } from '../types.js'
import type { MissingDependency } from './types.js'
import { detectLanguage, isMissingDependency } from './types.js'
import { LspLifecycle } from './lifecycle.js'
import type { LspClient } from './client.js'

/** LSP 工具的标准入参 */
export interface LspToolInput {
  file: string
  line?: number
  column?: number
}

/** 解析并验证路径，返回绝对路径 */
export function resolveFilePath(input: LspToolInput, ctx: ToolContext): string | null {
  const filePath = String(input.file ?? '').trim()
  if (!filePath) return null
  return path.isAbsolute(filePath) ? filePath : path.resolve(ctx.workspaceDir, filePath)
}

/** 1-based 行列 → LSP 0-based position */
export function toLspPosition(line: number, column: number) {
  return { line: Math.max(0, (line || 1) - 1), character: Math.max(0, (column || 1) - 1) }
}

/** 尝试获取 LspClient，处理缺失依赖情况 */
export async function getClientOrError(
  absPath: string,
  ctx: ToolContext,
): Promise<{ client: LspClient; entry: ReturnType<LspLifecycle['getEntry']> } | ToolResult> {
  // 文件存在性检查
  if (!fs.existsSync(absPath)) {
    return { content: `错误: 文件不存在 — ${absPath}`, isError: true }
  }

  // 检测语言
  const lang = detectLanguage(absPath)
  if (!lang) {
    return {
      content: `不支持的文件类型: ${path.extname(absPath)}\n目前支持: .ts/.tsx/.js/.jsx（TypeScript）、.py（Python）、.go（Go）`,
      isError: true,
    }
  }

  const lifecycle = LspLifecycle.getInstance()
  const result = await lifecycle.getOrStart(ctx.workspaceDir, lang)

  // 缺失依赖
  if (isMissingDependency(result)) {
    const dep = result as MissingDependency
    return {
      content: `🔧 ${dep.missingCommand} 未安装，无法提供语义分析。\n\n` +
               `请执行以下命令安装:\n${dep.installCommand}\n\n` +
               `文档: ${dep.guideUrl}\n\n` +
               `安装完成后请重新调用此工具即可。`,
      isError: false,
      metadata: {
        actionable: true,
        suggestedCommand: dep.installCommand,
      },
    }
  }

  // 启动失败
  if (!result) {
    return {
      content: `LSP 服务器启动失败或不适用于当前工作区。\n` +
               `请确认工作区包含 ${lang} 项目文件（如 tsconfig.json / go.mod 等）。`,
      isError: true,
    }
  }

  // 获取 entry（用于 ensureFileOpen）
  const entry = lifecycle.getEntry(ctx.workspaceDir, lang)

  return { client: result, entry }
}

/** 读取文件的指定行（用于代码预览） */
export function readLineFromFile(filePath: string, lineNumber: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const idx = lineNumber // 0-based
    if (idx >= 0 && idx < lines.length) {
      return lines[idx].trimEnd()
    }
    return ''
  } catch {
    return ''
  }
}

/**
 * 通过符号名在文件中定位行列号。
 * 返回 1-based { line, column }，未找到返回 null。
 *
 * 策略：
 * 1. 精确匹配 word boundary（函数/变量/类定义）
 * 2. 找到第一处匹配（通常是定义位置，在文件靠前）
 */
export function resolveSymbolPosition(absPath: string, symbol: string): { line: number; column: number } | null {
  try {
    const content = fs.readFileSync(absPath, 'utf-8')
    const lines = content.split('\n')

    // 构建 word-boundary 正则，匹配符号名
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\b${escaped}\\b`)

    for (let i = 0; i < lines.length; i++) {
      const match = pattern.exec(lines[i])
      if (match) {
        return { line: i + 1, column: match.index + 1 } // 1-based
      }
    }
    return null
  } catch {
    return null
  }
}

