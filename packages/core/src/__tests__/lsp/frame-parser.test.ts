/**
 * __tests__/lsp/frame-parser.test.ts
 *
 * Phase B 单元测试 — 帧解析 (T1-T8)
 *
 * 测试 LspClient 的 Content-Length 帧协议解析逻辑。
 * 使用 in-process PassThrough stream mock，不依赖真实语言服务器。
 *
 * 运行方式：
 *   npx tsx src/__tests__/lsp/frame-parser.test.ts
 */

import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { LspClient } from '../../tools/lsp/client.js'

// ─── 测试工具 ────────────────────────────────────────────────────────────────

/** 构造 LSP Content-Length 帧 */
function buildFrame(obj: object): Buffer {
  const body = Buffer.from(JSON.stringify(obj), 'utf-8')
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii')
  return Buffer.concat([header, body])
}

/** 分片发送：将 buf 按 chunkSize 分块逐一 push 到 stream */
function sendInChunks(stream: PassThrough, buf: Buffer, chunkSize: number): void {
  for (let i = 0; i < buf.length; i += chunkSize) {
    stream.push(buf.subarray(i, i + chunkSize))
  }
}

/**
 * 创建一个模拟 ChildProcess 的对象，将 stdout 换成受控的 PassThrough stream，
 * stdin 换成可丢弃的 PassThrough（LspClient 会向其写入，我们不关心写入内容）。
 * 使用下方 makeClient() 即可。
 */

// ─── makeClient ──────────────────────────────────────────────────────────────

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
  if (a !== e) {
    throw new Error(`${label ? label + ': ' : ''}expected ${e}, got ${a}`)
  }
}

function assertContains(str: string, sub: string, label = ''): void {
  if (!str.includes(sub)) {
    throw new Error(`${label ? label + ': ' : ''}expected to contain "${sub}", got: "${str.slice(0, 200)}"`)
  }
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70))
console.log('Phase B — 帧解析测试 (T1-T8)')
console.log('═'.repeat(70) + '\n')

/** 创建 LspClient + 控制 stdout 的辅助函数 */
function makeClient(): { client: LspClient; stdout: PassThrough } {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  stdin.resume()
  ;(stdin as any).writable = true

  const emitter = new EventEmitter()
  const mockProcess = Object.assign(emitter, {
    stdout,
    stdin,
    stderr: new PassThrough(),
    kill: () => {},
    pid: 0,
  }) as unknown as ChildProcess

  return { client: new LspClient(mockProcess), stdout }
}

// ── T1：完整帧 ────────────────────────────────────────────────────────────────
await test('T1: 完整帧 — 单次 push，resolve 正确', async () => {
  const { client, stdout } = makeClient()
  const p = client.request<{ x: number }>('ping', {})
  // id=1
  stdout.push(buildFrame({ jsonrpc: '2.0', id: 1, result: { x: 99 } }))
  const r = await p
  assertEqual(r, { x: 99 })
})

// ── T2：body 分片 chunkSize=1 ─────────────────────────────────────────────────
await test('T2: body 分片（chunkSize=1）— 逐字节 push，resolve 正确', async () => {
  const { client, stdout } = makeClient()
  const p = client.request<{ v: string }>('ping', {})
  const frame = buildFrame({ jsonrpc: '2.0', id: 1, result: { v: 'hello' } })
  sendInChunks(stdout, frame, 1)
  const r = await p
  assertEqual(r, { v: 'hello' })
})

// ── T3：body 分片 chunkSize=10 ────────────────────────────────────────────────
await test('T3: body 分片（chunkSize=10）— 每 10 字节 push，resolve 正确', async () => {
  const { client, stdout } = makeClient()
  const p = client.request<{ v: number }>('ping', {})
  const frame = buildFrame({ jsonrpc: '2.0', id: 1, result: { v: 12345 } })
  sendInChunks(stdout, frame, 10)
  const r = await p
  assertEqual(r, { v: 12345 })
})

// ── T4：多帧粘包（2 条消息） ───────────────────────────────────────────────────
await test('T4: 多帧粘包（2 条消息一次 push）— 两个 Promise 均 resolve', async () => {
  const { client, stdout } = makeClient()
  const p1 = client.request<{ n: number }>('m1', {})  // id=1
  const p2 = client.request<{ n: number }>('m2', {})  // id=2

  const combined = Buffer.concat([
    buildFrame({ jsonrpc: '2.0', id: 1, result: { n: 1 } }),
    buildFrame({ jsonrpc: '2.0', id: 2, result: { n: 2 } }),
  ])
  stdout.push(combined)

  const [r1, r2] = await Promise.all([p1, p2])
  assertEqual(r1, { n: 1 }, 'r1')
  assertEqual(r2, { n: 2 }, 'r2')
})

// ── T5：多帧粘包（3 条消息） ───────────────────────────────────────────────────
await test('T5: 多帧粘包（3 条消息一次 push）— 三个 Promise 均 resolve', async () => {
  const { client, stdout } = makeClient()
  const p1 = client.request<{ n: number }>('m1', {})  // id=1
  const p2 = client.request<{ n: number }>('m2', {})  // id=2
  const p3 = client.request<{ n: number }>('m3', {})  // id=3

  const combined = Buffer.concat([
    buildFrame({ jsonrpc: '2.0', id: 1, result: { n: 10 } }),
    buildFrame({ jsonrpc: '2.0', id: 2, result: { n: 20 } }),
    buildFrame({ jsonrpc: '2.0', id: 3, result: { n: 30 } }),
  ])
  stdout.push(combined)

  const [r1, r2, r3] = await Promise.all([p1, p2, p3])
  assertEqual(r1, { n: 10 }, 'r1')
  assertEqual(r2, { n: 20 }, 'r2')
  assertEqual(r3, { n: 30 }, 'r3')
})

// ── T6：跨边界分隔符（\r\n\r\n 拆为 2 chunk） ────────────────────────────────
await test('T6: 跨边界分隔符（\\r\\n\\r\\n 拆为两个 chunk）— 正确解析', async () => {
  const { client, stdout } = makeClient()
  const p = client.request<{ ok: boolean }>('ping', {})

  const frame = buildFrame({ jsonrpc: '2.0', id: 1, result: { ok: true } })
  // 找到 \r\n\r\n 的位置（4 字节），在 \r\n 和 \r\n 之间切割
  const sepIdx = frame.indexOf(Buffer.from('\r\n\r\n'))
  // chunk1 = 到 \r\n（分隔符前半）
  // chunk2 = \r\n + body（分隔符后半 + body）
  const chunk1 = frame.subarray(0, sepIdx + 2)   // 含前两个字节 \r\n
  const chunk2 = frame.subarray(sepIdx + 2)       // 含后两个字节 \r\n + body

  stdout.push(chunk1)
  stdout.push(chunk2)

  const r = await p
  assertEqual(r, { ok: true })
})

// ── T7：超大消息体（128KB） ────────────────────────────────────────────────────
await test('T7: 超大消息体（128KB body，分 4KB chunk）— 解析结果一致', async () => {
  const { client, stdout } = makeClient()
  const p = client.request<{ data: string }>('ping', {})

  // 构造 128KB 的 payload
  const bigData = 'x'.repeat(128 * 1024)
  const frame = buildFrame({ jsonrpc: '2.0', id: 1, result: { data: bigData } })
  sendInChunks(stdout, frame, 4 * 1024)

  const r = await p
  assertEqual((r as any).data.length, bigData.length, 'data.length')
  assertEqual((r as any).data.slice(0, 10), bigData.slice(0, 10), 'data prefix')
})

// ── T8：并发请求有序响应（id=3,1,2 顺序到达） ────────────────────────────────
await test('T8: 并发请求 — 响应以 id=3,1,2 顺序到达，每个 Promise 拿到自己的响应', async () => {
  const { client, stdout } = makeClient()
  const p1 = client.request<{ tag: string }>('m1', {})  // id=1
  const p2 = client.request<{ tag: string }>('m2', {})  // id=2
  const p3 = client.request<{ tag: string }>('m3', {})  // id=3

  // 故意以 3,1,2 顺序推送响应
  stdout.push(buildFrame({ jsonrpc: '2.0', id: 3, result: { tag: 'third' } }))
  stdout.push(buildFrame({ jsonrpc: '2.0', id: 1, result: { tag: 'first' } }))
  stdout.push(buildFrame({ jsonrpc: '2.0', id: 2, result: { tag: 'second' } }))

  const [r1, r2, r3] = await Promise.all([p1, p2, p3])
  assertEqual(r1, { tag: 'first' },  'p1')
  assertEqual(r2, { tag: 'second' }, 'p2')
  assertEqual(r3, { tag: 'third' },  'p3')
})

// ─── 汇总 ────────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70))
console.log(`帧解析测试: ${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\n失败详情:')
  for (const e of errors) console.log(`  • ${e}`)
}
console.log('─'.repeat(70))

if (failed > 0) process.exit(1)
