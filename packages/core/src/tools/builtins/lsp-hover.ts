/**
 * tools/builtins/lsp-hover.ts — lsp_hover 工具
 *
 * Phase B: 获取指定位置符号的类型签名和文档注释。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { HoverResult } from '../lsp/types.js'
import { pathToFileUri } from '../lsp/types.js'
import { LspLifecycle } from '../lsp/lifecycle.js'
import { resolveFilePath, toLspPosition, getClientOrError } from '../lsp/helpers.js'

export const lspHoverTool: ToolDefinition = {
  name: 'lsp_hover',
  description:
    '获取代码中指定位置符号的类型信息和文档注释。' +
    '需要提供文件路径、行号和列号（均为 1-based）。' +
    '适用于了解变量类型、函数签名、接口定义等。' +
    '支持 TypeScript/JavaScript、Python、Go。',

  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: '文件路径（相对于工作目录或绝对路径）' },
      line: { type: 'number', description: '行号（1-based）' },
      column: { type: 'number', description: '列号（1-based）' },
    },
    required: ['file', 'line', 'column'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const absPath = resolveFilePath(input as any, ctx)
    if (!absPath) return { content: '错误: file 参数缺失', isError: true }

    const result = await getClientOrError(absPath, ctx)
    if ('content' in result) return result  // 错误或安装提示

    const { client, entry } = result
    const lifecycle = LspLifecycle.getInstance()

    // 确保文件已打开（同步最新内容）
    if (entry) await lifecycle.ensureFileOpen(entry, absPath)

    const uri = pathToFileUri(absPath)
    const position = toLspPosition(Number(input.line), Number(input.column))

    try {
      const hover = await client.request<HoverResult | null>('textDocument/hover', {
        textDocument: { uri },
        position,
      })

      if (!hover || !hover.contents) {
        return { content: '该位置没有符号信息。' }
      }

      const text = formatHoverContents(hover.contents)
      const line = Number(input.line)
      const col = Number(input.column)
      return { content: `${absPath}:${line}:${col}\n\n${text}` }
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
