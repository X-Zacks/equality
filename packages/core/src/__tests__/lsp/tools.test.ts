/**
 * __tests__/lsp/tools.test.ts
 *
 * Phase B 单元测试 — 工具层行为 (T14-T15)
 *
 * T14: lsp_hover — getOrStart 返回 MissingDependency 时，result 含 suggestedCommand，metadata.actionable=true
 * T15: lsp_diagnostics — 预填 client.diagnostics Map，工具返回预填的诊断信息
 *
 * 测试策略：mock LspLifecycle.getInstance()，绕开真实进程 spawn。
 *
 * 运行方式：
 *   npx tsx src/__tests__/lsp/tools.test.ts
 */

import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// ─── Mock LspLifecycle 注入 ───────────────────────────────────────────────────
//
// tools 层通过 LspLifecycle.getInstance() 获取单例，然后调用 getOrStart()。
// 我们在 import 工具前先设置单例，让工具拿到受控的 mock。

import { LspLifecycle } from '../../tools/lsp/lifecycle.js'
import { LspClient } from '../../tools/lsp/client.js'
import { DiagnosticSeverity } from '../../tools/lsp/types.js'
import type { Diagnostic } from '../../tools/lsp/types.js'

import { lspHoverTool } from '../../tools/builtins/lsp-hover.js'
import { lspDiagnosticsTool } from '../../tools/builtins/lsp-diagnostics.js'
import { pathToFileUri } from '../../tools/lsp/types.js'

// ─── 测试辅助 ────────────────────────────────────────────────────────────────

/** 构造一个 LspClient，stdout 由外部控制 */
function makeClient(): { client: LspClient; stdout: PassThrough } {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  stdin.resume()
  ;(stdin as any).writable = true

  const mockProcess = Object.assign(new EventEmitter(), {
    stdout,
    stdin,
    stderr: new PassThrough(),
    kill: () => {},
    pid: 0,
  }) as unknown as ChildProcess

  return { client: new LspClient(mockProcess), stdout }
}

/** 向 LspClient 注入一个 hover 响应帧（id=1） */
function injectHoverResponse(stdout: PassThrough, hoverResult: object | null): void {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result: hoverResult })
  const bodyBuf = Buffer.from(body, 'utf-8')
  const header = Buffer.from(`Content-Length: ${bodyBuf.length}\r\n\r\n`, 'ascii')
  stdout.push(Buffer.concat([header, bodyBuf]))
}

/** 创建临时 .ts 文件，用于工具层文件存在性检查 */
function makeTempTsFile(): string {
  const tmpDir = os.tmpdir()
  const filePath = path.join(tmpDir, `lsp-test-${Date.now()}.ts`)
  fs.writeFileSync(filePath, 'export const x: number = 1\n', 'utf-8')
  return filePath
}

// ─── 简易测试框架 ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`  ✗ ${name}`)
    console.log(`      ${msg}`)
    errors.push(`${name}: ${msg}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, label = ''): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${label ? label + ': ' : ''}expected ${e}, got ${a}`)
}

function assertContains(str: string, sub: string, label = ''): void {
  if (!str.includes(sub)) {
    throw new Error(`${label ? label + ': ' : ''}expected to contain "${sub}", got: "${str.slice(0, 300)}"`)
  }
}

// ─── Mock 辅助：覆盖 LspLifecycle 单例行为 ───────────────────────────────────

type MockLifecycle = {
  getOrStart: () => Promise<unknown>
  getEntry: () => unknown
  ensureFileOpen: () => Promise<void>
}

function injectMockLifecycle(mock: MockLifecycle): void {
  // 利用 TypeScript 类的静态单例模式：直接替换 instance
  ;(LspLifecycle as any).instance = {
    getOrStart: mock.getOrStart,
    getEntry: mock.getEntry,
    ensureFileOpen: mock.ensureFileOpen,
  }
}

function resetLifecycle(): void {
  ;(LspLifecycle as any).instance = null
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70))
console.log('Phase B — 工具层行为测试 (T14-T15)')
console.log('═'.repeat(70) + '\n')

const baseCtx = {
  workspaceDir: os.tmpdir(),
  sessionKey: 'test',
}

// ── T14：lsp_hover — MissingDependency 时返回 actionable 提示 ─────────────────
await test('T14: lsp_hover — MissingDependency → actionable=true + suggestedCommand', async () => {
  const tmpFile = makeTempTsFile()
  try {
    injectMockLifecycle({
      getOrStart: async () => ({
        missingCommand: 'typescript-language-server',
        installCommand: 'npm install -g typescript-language-server typescript',
        guideUrl: 'https://github.com/typescript-language-server/typescript-language-server',
      }),
      getEntry: () => null,
      ensureFileOpen: async () => {},
    })

    const result = await lspHoverTool.execute(
      { file: tmpFile, line: 1, column: 14 },
      baseCtx,
    )

    // 不是 isError
    if (result.isError) throw new Error('不应为 isError，应返回友好提示')

    // content 含安装命令
    assertContains(result.content, 'npm install -g typescript-language-server', 'content')

    // metadata.actionable = true
    if (!result.metadata?.actionable) throw new Error('metadata.actionable 应为 true')

    // metadata.suggestedCommand 含安装命令
    if (!result.metadata?.suggestedCommand?.includes('typescript-language-server')) {
      throw new Error(`metadata.suggestedCommand 异常: ${result.metadata?.suggestedCommand}`)
    }
  } finally {
    resetLifecycle()
    fs.unlinkSync(tmpFile)
  }
})

// ── T15：lsp_diagnostics — 从 diagnostics 缓存读取 ───────────────────────────
await test('T15: lsp_diagnostics — 预填 diagnostics Map，工具返回预填内容', async () => {
  const tmpFile = makeTempTsFile()
  try {
    const { client } = makeClient()

    // 预填诊断缓存（使用与工具内部相同的 pathToFileUri 转换，确保 URI 格式一致）
    const uri = pathToFileUri(tmpFile)
    const fakeDiag: Diagnostic = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      severity: DiagnosticSeverity.Error,
      message: 'Type number is not assignable to type string',
      code: 2322,
      source: 'ts',
    }
    client.diagnostics.set(uri, [fakeDiag])

    injectMockLifecycle({
      getOrStart: async () => client,
      getEntry: () => ({ client }),
      ensureFileOpen: async () => {},
    })

    const result = await lspDiagnosticsTool.execute(
      { file: tmpFile, severity: 'error' },
      baseCtx,
    )

    if (result.isError) throw new Error(`不应为 isError: ${result.content}`)

    // 结果应含诊断消息
    assertContains(result.content, 'Type number is not assignable', 'content')
    // 结果应含错误码
    assertContains(result.content, '2322', 'error code')
  } finally {
    resetLifecycle()
    fs.unlinkSync(tmpFile)
  }
})

// ─── 汇总 ────────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70))
console.log(`工具层行为测试: ${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\n失败详情:')
  for (const e of errors) console.log(`  • ${e}`)
}
console.log('─'.repeat(70))

if (failed > 0) process.exit(1)
