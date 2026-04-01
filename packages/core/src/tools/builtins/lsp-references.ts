/**
 * tools/builtins/lsp-references.ts — lsp_references 工具
 *
 * Phase B: 查找符号的所有引用位置。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { Location } from '../lsp/types.js'
import { pathToFileUri, fileUriToPath } from '../lsp/types.js'
import { LspLifecycle } from '../lsp/lifecycle.js'
import { resolveFilePath, toLspPosition, getClientOrError, readLineFromFile } from '../lsp/helpers.js'

const MAX_REFERENCES = 50

export const lspReferencesTool: ToolDefinition = {
  name: 'lsp_references',
  description:
    '查找符号的所有引用位置。' +
    '给定文件路径、行号和列号（1-based），返回该符号在整个项目中的所有使用位置。' +
    '适用于重构前评估影响范围、查找函数调用方等。' +
    '支持 TypeScript/JavaScript、Python、Go。',

  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: '文件路径（相对于工作目录或绝对路径）' },
      line: { type: 'number', description: '行号（1-based）' },
      column: { type: 'number', description: '列号（1-based）' },
      include_declaration: {
        type: 'string',
        description: '是否包含声明本身（true/false，默认 false）',
        default: 'false',
      },
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
    const includeDeclaration = String(input.include_declaration) === 'true'

    try {
      const refs = await client.request<Location[] | null>('textDocument/references', {
        textDocument: { uri },
        position,
        context: { includeDeclaration },
      })

      if (!refs || refs.length === 0) {
        return { content: '未找到引用。' }
      }

      const total = refs.length
      const displayed = refs.slice(0, MAX_REFERENCES)

      const lines: string[] = [`引用 (共 ${total} 处):`]
      for (const ref of displayed) {
        const filePath = fileUriToPath(ref.uri)
        const line1 = ref.range.start.line + 1
        const col1 = ref.range.start.character + 1
        const preview = readLineFromFile(filePath, ref.range.start.line)
        lines.push(`  → ${filePath}:${line1}:${col1}`)
        if (preview) lines.push(`     ${preview}`)
      }

      if (total > MAX_REFERENCES) {
        lines.push(`\n  (仅显示前 ${MAX_REFERENCES} 处，共 ${total} 处)`)
      }

      return { content: lines.join('\n') }
    } catch (err) {
      return { content: `LSP references 请求失败: ${(err as Error).message}`, isError: true }
    }
  },
}
