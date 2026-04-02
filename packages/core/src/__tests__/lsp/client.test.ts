/**
 * __tests__/lsp/client.test.ts
 *
 * Phase B 单元测试 — 客户端行为 (T9-T10)
 *
 * T9: request 超时
 * T10: 进程意外退出后 pending 全部 reject
 *
 * 运行方式：
 *   npx tsx src/__tests__/lsp/client.test.ts
 */

import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { LspClient } from '../../tools/lsp/client.js'

// ─── Mock 工具 ────────────────────────────────────────────────────────────────

function makeClient(): { client: LspClient; stdout: PassThrough; emitter: EventEmitter } {
  const emitter = new EventEmitter()
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  stdin.resume()
  ;(stdin as any).writable = true

  const mockProcess = Object.assign(emitter, {
    stdout,
    stdin,
    stderr: new PassThrough(),
    kill: () => {},
    pid: 0,
  }) as unknown as ChildProcess

  return { client: new LspClient(mockProcess), stdout, emitter }
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

function assertContains(str: string, sub: string, label = ''): void {
  if (!str.includes(sub)) {
    throw new Error(`${label ? label + ': ' : ''}expected to contain "${sub}", got: "${str.slice(0, 300)}"`)
  }
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70))
console.log('Phase B — 客户端行为测试 (T9-T10)')
console.log('═'.repeat(70) + '\n')

// ── T9：request 超时 ─────────────────────────────────────────────────────────
await test('T9: request 超时 — mock 不回复，100ms 后 reject 含 "timeout"', async () => {
  const { client } = makeClient()
  // timeout 设为 100ms，mock 服务器不回复任何消息
  let caught: Error | null = null
  try {
    await client.request('test/slow', {}, 100)
  } catch (e) {
    caught = e as Error
  }
  if (!caught) throw new Error('应当 reject 但未 reject')
  // 错误消息应含 "timeout" 或 "超时"
  const msg = caught.message.toLowerCase()
  if (!msg.includes('timeout') && !msg.includes('超时')) {
    throw new Error(`reject 错误消息不含 timeout/超时: "${caught.message}"`)
  }
})

// ── T10：进程意外退出后 pending 全部 reject ────────────────────────────────────
await test('T10: 进程意外退出 — 所有 pending Promise 均被 reject', async () => {
  const { client, emitter } = makeClient()

  // 发出 3 个请求，不回复（让它们 pending）
  // 用非常大的 timeout 保证不被超时先 reject
  const p1 = client.request('m1', {}, 30_000).catch(e => e as Error)
  const p2 = client.request('m2', {}, 30_000).catch(e => e as Error)
  const p3 = client.request('m3', {}, 30_000).catch(e => e as Error)

  // 模拟进程退出
  emitter.emit('close', 1)

  const [e1, e2, e3] = await Promise.all([p1, p2, p3])

  if (!(e1 instanceof Error)) throw new Error('p1 应当 reject 为 Error')
  if (!(e2 instanceof Error)) throw new Error('p2 应当 reject 为 Error')
  if (!(e3 instanceof Error)) throw new Error('p3 应当 reject 为 Error')

  // 错误消息应提及"进程退出"或 exit
  assertContains(e1.message.toLowerCase(), '退出', 'e1.message')
})

// ─── 汇总 ────────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70))
console.log(`客户端行为测试: ${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\n失败详情:')
  for (const e of errors) console.log(`  • ${e}`)
}
console.log('─'.repeat(70))

if (failed > 0) process.exit(1)
