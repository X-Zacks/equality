/**
 * Phase D.4 — 可插拔上下文引擎生命周期测试
 *
 * T23: ContextEngine 接口——新方法可选不实现（no-op）
 * T24: afterToolCall 被调用——参数包含 mutationType
 * T25: beforeCompaction 被调用——参数包含 compressCount
 * T26: 自定义引擎替换 default 引擎
 */

import { DefaultContextEngine } from '../context/default-engine.js'
import type {
  ContextEngine,
  AssembleParams,
  AssembleResult,
  AfterTurnParams,
  BeforeTurnParams,
  AfterToolCallParams,
  BeforeCompactionParams,
} from '../context/types.js'

// ─── 辅助 ────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ─── 测试 ────────────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════════════════════════')
console.log('Phase D.4 — 可插拔上下文引擎生命周期测试')
console.log('══════════════════════════════════════════════════════════════════════════')

// T23: 可选方法 no-op — 只实现 assemble/afterTurn 的引擎不会崩溃
console.log('\n── T23: ContextEngine 接口 — 可选方法不实现 ──')
{
  // 一个最简引擎：只实现必选方法
  const minimalEngine: ContextEngine = {
    engineId: 'minimal',
    async assemble(): Promise<AssembleResult> {
      return { messages: [], wasCompacted: false, recalledMemories: 0 }
    },
    async afterTurn(): Promise<void> { /* no-op */ },
  }

  assert(minimalEngine.engineId === 'minimal', 'T23a — minimal 引擎 engineId 正确')
  assert(minimalEngine.beforeTurn === undefined, 'T23b — beforeTurn 未实现 → undefined')
  assert(minimalEngine.afterToolCall === undefined, 'T23c — afterToolCall 未实现 → undefined')
  assert(minimalEngine.beforeCompaction === undefined, 'T23d — beforeCompaction 未实现 → undefined')
  assert(minimalEngine.dispose === undefined, 'T23e — dispose 未实现 → undefined')

  // 安全调用（模拟 runner 中 contextEngine?.afterToolCall?.() 的模式）
  let noop = true
  if (minimalEngine.afterToolCall) {
    noop = false
  }
  assert(noop, 'T23f — 可选链调用安全跳过')
}

// T24: afterToolCall 被调用 — DefaultContextEngine 实现了该方法
console.log('\n── T24: afterToolCall 被调用 — 参数包含 mutationType ──')
{
  const engine = new DefaultContextEngine()

  assert(typeof engine.afterToolCall === 'function', 'T24a — DefaultContextEngine 实现了 afterToolCall')

  // 调用 afterToolCall 并捕获 console.log 验证参数
  const logs: string[] = []
  const origLog = console.log
  console.log = (...args: unknown[]) => { logs.push(args.join(' ')) }

  await engine.afterToolCall({
    sessionKey: 'test-session-1234-5678',
    toolName: 'write_file',
    args: { path: '/tmp/foo.txt', content: 'hello' },
    result: 'success',
    isError: false,
    mutationType: 'write',
    risk: 'high',
  })

  console.log = origLog

  const logLine = logs.find(l => l.includes('afterToolCall'))
  assert(logLine !== undefined, 'T24b — afterToolCall 产生了日志')
  assert(logLine!.includes('write_file'), 'T24c — 日志包含 toolName')
  assert(logLine!.includes('write'), 'T24d — 日志包含 mutationType')
  assert(logLine!.includes('high'), 'T24e — 日志包含 risk')
  assert(logLine!.includes('test-ses'), 'T24f — 日志包含 sessionKey 前缀')
  assert(logLine!.includes('error=false'), 'T24g — 日志包含 isError')

  // 测试 isError=true 的情况
  logs.length = 0
  console.log = (...args: unknown[]) => { logs.push(args.join(' ')) }

  await engine.afterToolCall({
    sessionKey: 'test-session-abcd-efgh',
    toolName: 'bash',
    args: { command: 'rm -rf /' },
    result: 'permission denied',
    isError: true,
    mutationType: 'exec',
    risk: 'medium',
  })

  console.log = origLog

  const errLog = logs.find(l => l.includes('afterToolCall'))
  assert(errLog!.includes('error=true'), 'T24h — 错误工具调用 isError=true')
  assert(errLog!.includes('exec'), 'T24i — bash 分类为 exec')
  assert(errLog!.includes('medium'), 'T24j — 风险等级 medium')
}

// T25: beforeCompaction 被调用 — 参数包含 compressCount 和 tokenUsageRatio
console.log('\n── T25: beforeCompaction 被调用 — 参数包含 compressCount ──')
{
  const engine = new DefaultContextEngine()

  assert(typeof engine.beforeCompaction === 'function', 'T25a — DefaultContextEngine 实现了 beforeCompaction')

  const logs: string[] = []
  const origLog = console.log
  console.log = (...args: unknown[]) => { logs.push(args.join(' ')) }

  await engine.beforeCompaction({
    sessionKey: 'compact-session-1234',
    compressCount: 42,
    tokenUsageRatio: 0.85,
  })

  console.log = origLog

  const logLine = logs.find(l => l.includes('beforeCompaction'))
  assert(logLine !== undefined, 'T25b — beforeCompaction 产生了日志')
  assert(logLine!.includes('compress=42'), 'T25c — 日志包含 compressCount')
  assert(logLine!.includes('85.0%'), 'T25d — 日志包含 tokenUsageRatio 百分比')
  assert(logLine!.includes('compact-'), 'T25e — 日志包含 sessionKey 前缀')
}

// T26: 自定义引擎替换 — 第三方引擎可实现所有可选方法
console.log('\n── T26: 自定义引擎替换 default 引擎 ──')
{
  const calls: string[] = []

  const customEngine: ContextEngine = {
    engineId: 'custom-plugin',

    async assemble(): Promise<AssembleResult> {
      calls.push('assemble')
      return { messages: [{ role: 'system', content: 'custom' }], wasCompacted: false, recalledMemories: 0 }
    },

    async afterTurn(): Promise<void> {
      calls.push('afterTurn')
    },

    async beforeTurn(params: BeforeTurnParams): Promise<void> {
      calls.push(`beforeTurn:${params.userMessage}`)
    },

    async afterToolCall(params: AfterToolCallParams): Promise<void> {
      calls.push(`afterToolCall:${params.toolName}:${params.mutationType}:${params.risk}`)
    },

    async beforeCompaction(params: BeforeCompactionParams): Promise<void> {
      calls.push(`beforeCompaction:${params.compressCount}`)
    },

    async dispose(): Promise<void> {
      calls.push('dispose')
    },
  }

  assert(customEngine.engineId === 'custom-plugin', 'T26a — 自定义引擎 engineId')

  // 模拟 runner 中的生命周期调用序列
  // 1. beforeTurn（如果实现了的话）
  if (customEngine.beforeTurn) {
    await customEngine.beforeTurn({ sessionKey: 'ses-1', userMessage: '你好' })
  }
  assert(calls.includes('beforeTurn:你好'), 'T26b — beforeTurn 被调用')

  // 2. assemble
  const result = await customEngine.assemble({} as AssembleParams)
  assert(result.messages[0]?.content === 'custom', 'T26c — assemble 返回自定义 system prompt')

  // 3. afterToolCall（每次工具执行后）
  if (customEngine.afterToolCall) {
    await customEngine.afterToolCall({
      sessionKey: 'ses-1',
      toolName: 'read_file',
      args: { path: '/foo' },
      result: 'content...',
      isError: false,
      mutationType: 'read',
      risk: 'low',
    })
  }
  assert(calls.includes('afterToolCall:read_file:read:low'), 'T26d — afterToolCall 参数完整')

  // 4. beforeCompaction（压缩前）
  if (customEngine.beforeCompaction) {
    await customEngine.beforeCompaction({
      sessionKey: 'ses-1',
      compressCount: 100,
      tokenUsageRatio: 0.92,
    })
  }
  assert(calls.includes('beforeCompaction:100'), 'T26e — beforeCompaction 被调用')

  // 5. afterTurn
  await customEngine.afterTurn({ sessionKey: 'ses-1', assistantMessage: '回复' })
  assert(calls.includes('afterTurn'), 'T26f — afterTurn 被调用')

  // 6. dispose
  if (customEngine.dispose) {
    await customEngine.dispose()
  }
  assert(calls.includes('dispose'), 'T26g — dispose 被调用')

  // 完整调用序列验证
  assert(calls.length === 6, `T26h — 调用序列完整: ${calls.length} calls`)
  assert(calls[0] === 'beforeTurn:你好', 'T26i — 调用顺序正确: beforeTurn 在最前')
  assert(calls[calls.length - 1] === 'dispose', 'T26j — 调用顺序正确: dispose 在最后')
}

// ── Extra: RunAttemptParams.contextEngine 类型兼容测试 ──
console.log('\n── Extra: 类型兼容 — contextEngine 传入 RunAttemptParams ──')
{
  // 模拟 RunAttemptParams 中 contextEngine 的使用模式（不实际调用 runAttempt）
  const engine: ContextEngine = new DefaultContextEngine()

  // 可选链调用安全性
  const result1 = await engine.afterToolCall?.({
    sessionKey: 'x', toolName: 'bash', args: {}, result: 'ok',
    isError: false, mutationType: 'exec', risk: 'low',
  })
  assert(result1 === undefined, 'TC1 — afterToolCall 返回 void (undefined)')

  const result2 = await engine.beforeCompaction?.({
    sessionKey: 'x', compressCount: 10, tokenUsageRatio: 0.5,
  })
  assert(result2 === undefined, 'TC2 — beforeCompaction 返回 void (undefined)')

  // 抛出异常不影响（模拟 runner 中 try/catch 包裹）
  const throwingEngine: ContextEngine = {
    engineId: 'throwing',
    async assemble(): Promise<AssembleResult> {
      return { messages: [], wasCompacted: false, recalledMemories: 0 }
    },
    async afterTurn(): Promise<void> {},
    async afterToolCall(): Promise<void> {
      throw new Error('plugin crash')
    },
  }

  let caught = false
  try {
    await throwingEngine.afterToolCall!({
      sessionKey: 'x', toolName: 'bash', args: {}, result: 'ok',
      isError: false, mutationType: 'exec', risk: 'low',
    })
  } catch {
    caught = true
  }
  assert(caught, 'TC3 — 异常引擎的 afterToolCall 抛出异常可被捕获')
}

// ── 结果汇总 ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════════')
console.log(`Phase D.4 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
console.log('══════════════════════════════════════════════════════════════════════════')

if (failed > 0) process.exit(1)
