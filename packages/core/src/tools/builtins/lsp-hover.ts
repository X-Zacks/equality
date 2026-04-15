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
    '获取代码中指定符号的类型信息和文档注释（TypeScript/JavaScript/Python/Go）。' +
    '返回类型签名、函数参数、JSDoc 注释等。' +
    'Use when: 需要确认某个符号的精确类型、理解函数签名、查看类型定义。' +
    'NOT for: 查找定义位置（用 lsp_definition）、查找所有使用处（用 lsp_references）。' +
    '可以用 symbol 参数直接传符号名（如 "handleNewChat"），工具会自动在文件中定位；也可以用 line+column 精确指定。',

  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: '文件路径（相对于工作目录或绝对路径）' },
      symbol: { type: 'string', description: '符号名称（如函数名、变量名）。提供此参数时可省略 line 和 column，工具会自动定位' },
      line: { type: 'number', description: '行号（1-based）。与 column 一起使用可精确指定位置' },
      column: { type: 'number', description: '列号（1-based）。与 line 一起使用可精确指定位置' },
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
