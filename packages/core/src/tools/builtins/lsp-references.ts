/**
 * tools/builtins/lsp-references.ts — lsp_references 工具
 *
 * Phase B: 查找符号的所有引用位置。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { Location } from '../lsp/types.js'
import { pathToFileUri, fileUriToPath } from '../lsp/types.js'
import { LspLifecycle } from '../lsp/lifecycle.js'
import { resolveFilePath, toLspPosition, getClientOrError, readLineFromFile, resolveSymbolPosition } from '../lsp/helpers.js'

const MAX_REFERENCES = 50

export const lspReferencesTool: ToolDefinition = {
  name: 'lsp_references',
  description:
    '查找符号（函数、类、变量）在整个项目中的所有引用位置（TypeScript/JavaScript/Python/Go）。' +
    'Use when: 重构函数/变量前评估影响范围；需要了解一个函数被哪些地方调用；多文件修改前确认所有调用点。' +
    'NOT for: 找定义位置（用 lsp_definition）；文本字符串搜索（用 grep）。' +
    '可以用 symbol 参数直接传符号名，工具会自动在文件中定位；也可以用 line+column 精确指定。',

  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: '文件路径（相对于工作目录或绝对路径）' },
      symbol: { type: 'string', description: '符号名称（如函数名、变量名）。提供此参数时可省略 line 和 column，工具会自动定位' },
      line: { type: 'number', description: '行号（1-based）' },
      column: { type: 'number', description: '列号（1-based）' },
      include_declaration: {
        type: 'string',
        description: '是否包含声明本身（true/false，默认 false）',
        default: 'false',
      },
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
    if ('content' in result) return result

    const { client, entry } = result
    const lifecycle = LspLifecycle.getInstance()

    if (entry) await lifecycle.ensureFileOpen(entry, absPath)

    const uri = pathToFileUri(absPath)
    const position = toLspPosition(line, column)
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
