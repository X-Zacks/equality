/**
 * tools/builtins/lsp-diagnostics.ts — lsp_diagnostics 工具
 *
 * Phase B: 获取文件或工作区的诊断信息（TypeScript 错误、未使用变量等）。
 * 无需运行 tsc，直接从 LSP 服务器的实时诊断中获取。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { Diagnostic } from '../lsp/types.js'
import { DiagnosticSeverity, pathToFileUri, fileUriToPath, detectLanguage } from '../lsp/types.js'
import { LspLifecycle } from '../lsp/lifecycle.js'
import { resolveFilePath, getClientOrError } from '../lsp/helpers.js'

export const lspDiagnosticsTool: ToolDefinition = {
  name: 'lsp_diagnostics',
  description:
    'Get diagnostic info for a file or workspace (type errors, syntax errors, unused variables, etc.) without running tsc/pyright/go build. ' +
    'Use when: verifying no type errors after code changes; checking for potential issues during code review; confirming no errors before commit. ' +
    'NOT for: runtime errors (use bash); test failures (use bash to run tests); finding symbols (use lsp_hover/lsp_references). ' +
    'Specify file for single-file diagnostics, or omit for all open files; supports severity filter (error/warning/all).',

  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'File path (optional, omit to return diagnostics for all open files)',
      },
      severity: {
        type: 'string',
        description: 'Filter level: error (default, errors only), warning, all',
        enum: ['error', 'warning', 'all'],
        default: 'error',
      },
    },
    required: [],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const severity = String(input.severity || 'error')
    const fileArg = input.file ? String(input.file).trim() : null

    if (fileArg) {
      // 单文件模式
      const absPath = resolveFilePath({ file: fileArg } as any, ctx)
      if (!absPath) return { content: '错误: file 参数无效', isError: true }

      const result = await getClientOrError(absPath, ctx)
      if ('content' in result) return result

      const { client, entry } = result
      const lifecycle = LspLifecycle.getInstance()

      // 确保文件已打开（触发诊断推送）
      if (entry) await lifecycle.ensureFileOpen(entry, absPath)

      const uri = pathToFileUri(absPath)

      // 等待诊断到达
      const diagnostics = await client.waitForDiagnostics(uri, 3_000)
      const filtered = filterBySeverity(diagnostics, severity)

      return { content: formatDiagnostics(absPath, filtered) }
    } else {
      // 全量模式：返回所有已缓存的诊断
      const lang = 'typescript' // 默认 TypeScript
      const lifecycle = LspLifecycle.getInstance()
      const entry = lifecycle.getEntry(ctx.workspaceDir, lang)

      if (!entry) {
        return {
          content: '没有活跃的 LSP 会话。请先对某个文件调用 lsp_hover 或 lsp_diagnostics(file=...) 启动语言服务器。',
        }
      }

      const allDiags = entry.client.diagnostics
      if (allDiags.size === 0) {
        return { content: '✅ 没有诊断信息（无错误）。' }
      }

      const sections: string[] = []
      for (const [uri, diagnostics] of allDiags) {
        const filtered = filterBySeverity(diagnostics, severity)
        if (filtered.length === 0) continue
        const filePath = fileUriToPath(uri)
        sections.push(formatDiagnostics(filePath, filtered))
      }

      if (sections.length === 0) {
        return { content: `✅ 没有 ${severity === 'error' ? '错误' : '诊断信息'}。` }
      }

      return { content: sections.join('\n\n') }
    }
  },
}

function filterBySeverity(diagnostics: Diagnostic[], severity: string): Diagnostic[] {
  if (severity === 'all') return diagnostics
  if (severity === 'warning') {
    return diagnostics.filter(d =>
      d.severity === DiagnosticSeverity.Error || d.severity === DiagnosticSeverity.Warning,
    )
  }
  // 默认 'error'
  return diagnostics.filter(d => d.severity === DiagnosticSeverity.Error)
}

function formatDiagnostics(filePath: string, diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return `${filePath}: ✅ 无诊断信息`
  }

  const lines: string[] = [`${filePath} 诊断 (${diagnostics.length} 条):`]
  for (const d of diagnostics) {
    const line1 = d.range.start.line + 1
    const icon = d.severity === DiagnosticSeverity.Error ? '❌'
      : d.severity === DiagnosticSeverity.Warning ? '⚠️ '
      : 'ℹ️ '
    const code = d.code ? ` [${d.source || ''}${d.code}]` : ''
    lines.push(`  ${icon} 第 ${line1} 行: ${d.message}${code}`)
  }
  return lines.join('\n')
}
