/**
 * tools/builtins/lsp-definition.ts — lsp_definition 工具
 *
 * Phase B: 跳转到符号的定义位置。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { Location, LocationLink } from '../lsp/types.js'
import { pathToFileUri, fileUriToPath } from '../lsp/types.js'
import { LspLifecycle } from '../lsp/lifecycle.js'
import { resolveFilePath, toLspPosition, getClientOrError, readLineFromFile } from '../lsp/helpers.js'

export const lspDefinitionTool: ToolDefinition = {
  name: 'lsp_definition',
  description:
    '跳转到符号的定义位置（TypeScript/JavaScript/Python/Go）。' +
    '返回定义所在文件路径和行号，支持跨文件。' +
    'Use when: 在阅读代码时遇到函数调用、类名、变量引用，需要找到其实现或声明位置；重构前确认实现位置。' +
    'NOT for: 获取类型签名（用 lsp_hover）、查所有使用处（用 lsp_references）、grep 搜索字符串。' +
    '需要提供文件路径、行号和列号（均为 1-based）。',

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
    if ('content' in result) return result

    const { client, entry } = result
    const lifecycle = LspLifecycle.getInstance()

    if (entry) await lifecycle.ensureFileOpen(entry, absPath)

    const uri = pathToFileUri(absPath)
    const position = toLspPosition(Number(input.line), Number(input.column))

    try {
      const response = await client.request<Location | Location[] | LocationLink[] | null>(
        'textDocument/definition',
        { textDocument: { uri }, position },
      )

      if (!response) {
        return { content: '未找到定义。' }
      }

      const locations = normalizeLocations(response)
      if (locations.length === 0) {
        return { content: '未找到定义。' }
      }

      const lines: string[] = [`定义位置 (共 ${locations.length} 处):`]
      for (const loc of locations) {
        const filePath = fileUriToPath(loc.uri)
        const line1 = loc.range.start.line + 1 // 转回 1-based
        const col1 = loc.range.start.character + 1
        const preview = readLineFromFile(filePath, loc.range.start.line)
        lines.push(`  → ${filePath}:${line1}:${col1}`)
        if (preview) lines.push(`     ${preview}`)
      }

      return { content: lines.join('\n') }
    } catch (err) {
      return { content: `LSP definition 请求失败: ${(err as Error).message}`, isError: true }
    }
  },
}

function normalizeLocations(
  response: Location | Location[] | LocationLink[],
): Location[] {
  if (Array.isArray(response)) {
    return response.map(item => {
      // LocationLink 有 targetUri，Location 有 uri
      if ('targetUri' in item) {
        return {
          uri: (item as LocationLink).targetUri,
          range: (item as LocationLink).targetSelectionRange,
        }
      }
      return item as Location
    })
  }
  return [response as Location]
}
