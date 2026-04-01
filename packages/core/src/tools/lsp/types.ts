/**
 * tools/lsp/types.ts — LSP 协议类型定义 + 工具辅助类型
 *
 * Phase B: LSP 语义代码理解
 * 只定义本项目用到的 LSP 子集，不引入 vscode-languageserver-protocol 全量依赖。
 */

import path from 'node:path'

// ─── JSON-RPC 帧类型 ──────────────────────────────────────────────────────────

export interface LspRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface LspResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: LspResponseError
}

export interface LspResponseError {
  code: number
  message: string
  data?: unknown
}

export interface LspNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

// ─── LSP 基础类型 ─────────────────────────────────────────────────────────────

/** LSP Position（0-based） */
export interface Position {
  line: number
  character: number
}

/** LSP Range */
export interface Range {
  start: Position
  end: Position
}

/** LSP Location（定义/引用的位置） */
export interface Location {
  uri: string
  range: Range
}

/** LSP LocationLink（textDocument/definition 可能返回这种） */
export interface LocationLink {
  originSelectionRange?: Range
  targetUri: string
  targetRange: Range
  targetSelectionRange: Range
}

/** LSP Diagnostic severity */
export const enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/** LSP Diagnostic */
export interface Diagnostic {
  range: Range
  severity?: DiagnosticSeverity
  code?: number | string
  source?: string
  message: string
}

/** LSP Hover 结果 */
export interface HoverResult {
  contents: string | { kind: string; value: string } | Array<string | { kind: string; value: string }>
  range?: Range
}

/** LSP PublishDiagnosticsParams（服务器推送） */
export interface PublishDiagnosticsParams {
  uri: string
  diagnostics: Diagnostic[]
}

// ─── 缺失依赖信息 ─────────────────────────────────────────────────────────────

export interface MissingDependency {
  missingCommand: string
  installCommand: string
  guideUrl: string
}

export function isMissingDependency(v: unknown): v is MissingDependency {
  return v !== null && typeof v === 'object' && 'missingCommand' in (v as any)
}

// ─── file:// URI ↔ 操作系统路径 转换 ──────────────────────────────────────────

/**
 * 将绝对文件路径转为 LSP file:// URI
 *
 * Windows: c:\foo\bar.ts → file:///c%3A/foo/bar.ts
 * Unix:    /foo/bar.ts   → file:///foo/bar.ts
 */
export function pathToFileUri(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:/.test(normalized)) {
    // Windows 盘符：冒号 percent-encode
    return `file:///${normalized[0]}%3A${normalized.slice(2)}`
  }
  return `file://${normalized}`
}

/**
 * 将 LSP file:// URI 转回操作系统路径
 *
 * file:///c%3A/foo/bar.ts → c:/foo/bar.ts (Windows)
 * file:///foo/bar.ts      → /foo/bar.ts   (Unix)
 */
export function fileUriToPath(uri: string): string {
  try {
    const url = new URL(uri)
    let p = decodeURIComponent(url.pathname)
    // Windows: pathname 以 /c: 开头，去掉开头的 /
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(p)) {
      p = p.slice(1)
    }
    return p
  } catch {
    // fallback：简单去掉 file://
    return uri.replace(/^file:\/\//, '')
  }
}

// ─── 语言检测 ─────────────────────────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.mjs': 'typescript',
  '.cjs': 'typescript',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
}

/** LSP languageId（用于 didOpen 通知） */
const EXT_TO_LANGUAGE_ID: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
}

/**
 * 根据文件扩展名推导 LSP 语言 key（'typescript' | 'python' | 'go' | null）
 */
export function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  return EXT_TO_LANGUAGE[ext] ?? null
}

/**
 * 根据文件扩展名推导 LSP languageId（用于 textDocument/didOpen）
 */
export function detectLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return EXT_TO_LANGUAGE_ID[ext] ?? 'plaintext'
}
