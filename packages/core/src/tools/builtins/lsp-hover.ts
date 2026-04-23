/**
 * tools/builtins/lsp-hover.ts — lsp_hover 工具
 *
 * Phase B: 获取指定位置符号的类型签名和文档注释。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { HoverResult } from '../lsp/types.js'
import { pathToFileUri } from '../lsp/types.js'
import { LspLifecycle } from '../lsp/lifecycle.js'
import { resolveFilePath, toLspPosition, getClientOrError, resolveSymbolPosition } from '../lsp/helpers.js'

export const lspHoverTool: ToolDefinition = {
  name: 'lsp_hover',
  description:
    'Get type information and documentation for a symbol in code (TypeScript/JavaScript/Python/Go). ' +
    'Returns type signatures, function parameters, JSDoc comments, etc. ' +
    'Use when: need to confirm a symbol\'s exact type, understand function signatures, view type definitions. ' +
    'NOT for: finding definition location (use lsp_definition), finding all usages (use lsp_references). ' +
    'You can pass a symbol name (e.g. "handleNewChat") via the symbol param — auto-locates in file; or use line+column for precise positioning.',

  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'File path (relative to workspace dir or absolute)' },
      symbol: { type: 'string', description: 'Symbol name (e.g. function name, variable name). When provided, line and column can be omitted — tool auto-locates' },
      line: { type: 'number', description: 'Line number (1-based). Use with column for precise positioning' },
      column: { type: 'number', description: 'Column number (1-based). Use with line for precise positioning' },
    },
    required: ['file'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const absPath = resolveFilePath(input as any, ctx)
    if (!absPath) return { content: '错误: file 参数缺失', isError: true }

    // 解析位置：优先 line+column，其次 symbol 自动定位
    let line = input.line != null ? Number(input.line) : undefined
    let column = input.column != null ? Number(input.column) : undefined

    if ((line == null || column == null) && input.symbol) {
      const pos = resolveSymbolPosition(absPath, String(input.symbol))
      if (!pos) return { content: `在 ${absPath} 中未找到符号 "${input.symbol}"。` }
      line = pos.line
      column = pos.column
    }

    if (line == null || column == null) {
      return { content: '错误: 需要提供 symbol（符号名）或 line+column（行列号）', isError: true }
    }

    const result = await getClientOrError(absPath, ctx)
    if ('content' in result) return result  // 错误或安装提示

    const { client, entry } = result
    const lifecycle = LspLifecycle.getInstance()

    // 确保文件已打开（同步最新内容）
    if (entry) await lifecycle.ensureFileOpen(entry, absPath)

    const uri = pathToFileUri(absPath)
    const position = toLspPosition(line, column)

    try {
      const hover = await client.request<HoverResult | null>('textDocument/hover', {
        textDocument: { uri },
        position,
      })

      if (!hover || !hover.contents) {
        return { content: '该位置没有符号信息。' }
      }

      const text = formatHoverContents(hover.contents)
      return { content: `${absPath}:${line}:${column}\n\n${text}` }
    } catch (err) {
      return { content: `LSP hover 请求失败: ${(err as Error).message}`, isError: true }
    }
  },
}

function formatHoverContents(
  contents: string | { kind: string; value: string } | Array<string | { kind: string; value: string }>,
): string {
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents.map(c => typeof c === 'string' ? c : c.value).join('\n\n')
  }
  return contents.value || ''
}
