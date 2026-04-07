/**
 * Phase J — Observability & Hooks Foundation
 *
 * J.1: Structured Logger (GAP-27)       ~30 assertions
 * J.2: Session Lifecycle Events (GAP-35) ~25 assertions
 * J.3: Hooks Framework (GAP-36)          ~30 assertions
 */

import assert from 'node:assert/strict'

// ═══════════════════════════════════════════════════════════════════════════════
// J.1: Structured Logger (GAP-27)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── J.1: Structured Logger ──')

import {
  createLogger,
  resolveLogLevel,
  VALID_LOG_LEVELS,
  type LogLevel,
  type Logger,
} from '../diagnostics/logger.js'

// T1: resolveLogLevel 解析
{
  assert.equal(resolveLogLevel(undefined), 'info', 'J1-T1a: undefined → info')
  assert.equal(resolveLogLevel(''), 'info', 'J1-T1b: empty → info')
  assert.equal(resolveLogLevel('debug'), 'debug', 'J1-T1c: debug')
  assert.equal(resolveLogLevel('WARN'), 'warn', 'J1-T1d: WARN (case insensitive)')
  assert.equal(resolveLogLevel('error'), 'error', 'J1-T1e: error')
  assert.equal(resolveLogLevel('invalid'), 'info', 'J1-T1f: invalid → info')
  console.log('  ✅ J1-T1: resolveLogLevel (6 assertions)')
}

// T2: createLogger 基本功能
{
  const logs: string[] = []
  const mockConsole = {
    debug: (...args: unknown[]) => logs.push(`debug:${args[0]}`),
    info: (...args: unknown[]) => logs.push(`info:${args[0]}`),
    warn: (...args: unknown[]) => logs.push(`warn:${args[0]}`),
    error: (...args: unknown[]) => logs.push(`error:${args[0]}`),
  }

  const logger = createLogger('test-module', { level: 'debug', console: mockConsole, env: {} })
  assert.equal(logger.module, 'test-module', 'J1-T2a: module name')
  assert.equal(logger.level, 'debug', 'J1-T2b: level')

  logger.info('hello world')
  assert.ok(logs.some(l => l.includes('hello world')), 'J1-T2c: info message logged')

  logger.debug('debug msg')
  assert.ok(logs.some(l => l.includes('debug msg')), 'J1-T2d: debug message logged')

  logger.warn('warn msg')
  assert.ok(logs.some(l => l.includes('warn msg')), 'J1-T2e: warn message logged')

  logger.error('error msg')
  assert.ok(logs.some(l => l.includes('error msg')), 'J1-T2f: error message logged')
  console.log('  ✅ J1-T2: createLogger 基本功能 (6 assertions)')
}

// T3: 日志级别过滤
{
  const logs: string[] = []
  const mockConsole = {
    debug: (...args: unknown[]) => logs.push(`debug`),
    info: (...args: unknown[]) => logs.push(`info`),
    warn: (...args: unknown[]) => logs.push(`warn`),
    error: (...args: unknown[]) => logs.push(`error`),
  }

  const logger = createLogger('filter-test', { level: 'warn', console: mockConsole, env: {} })
  logger.debug('should not appear')
  logger.info('should not appear')
  logger.warn('should appear')
  logger.error('should appear')

  assert.equal(logs.length, 2, 'J1-T3a: only warn+error pass filter')
  assert.equal(logs[0], 'warn', 'J1-T3b: first is warn')
  assert.equal(logs[1], 'error', 'J1-T3c: second is error')
  console.log('  ✅ J1-T3: 日志级别过滤 (3 assertions)')
}

// T4: JSONL 文件输出
{
  const lines: string[] = []
  const mockWriter = { write: (data: string) => lines.push(data), close: () => {} }

  const logger = createLogger('file-test', {
    level: 'info',
    writer: mockWriter,
    console: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    env: {},
  })

  logger.info('test message', { key: 'value' })
  assert.equal(lines.length, 1, 'J1-T4a: one line written')

  const entry = JSON.parse(lines[0])
  assert.equal(entry.level, 'info', 'J1-T4b: level in JSONL')
  assert.equal(entry.module, 'file-test', 'J1-T4c: module in JSONL')
  assert.equal(entry.message, 'test message', 'J1-T4d: message in JSONL')
  assert.ok(entry.ts, 'J1-T4e: ts present')
  console.log('  ✅ J1-T4: JSONL 文件输出 (5 assertions)')
}

// T5: 环境变量控制
{
  const logs: string[] = []
  const mockConsole = {
    debug: () => logs.push('d'),
    info: () => logs.push('i'),
    warn: () => logs.push('w'),
    error: () => logs.push('e'),
  }

  const logger = createLogger('env-test', {
    env: { EQUALITY_LOG_LEVEL: 'error' },
    console: mockConsole,
  })
  assert.equal(logger.level, 'error', 'J1-T5a: level from env')

  logger.info('filtered')
  logger.error('passed')
  assert.equal(logs.length, 1, 'J1-T5b: only error passed')
  console.log('  ✅ J1-T5: 环境变量控制 (2 assertions)')
}

// T6: extra fields 脱敏
{
  const lines: string[] = []
  const mockWriter = { write: (data: string) => lines.push(data), close: () => {} }

  const logger = createLogger('redact-test', {
    level: 'info',
    writer: mockWriter,
    redact: true,
    console: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    env: {},
  })

  logger.info('test', { apiKey: 'sk-12345678901234567890' })
  assert.equal(lines.length, 1, 'J1-T6a: line written')

  const entry = JSON.parse(lines[0])
  // sanitizeDiagnosticPayload 应该处理 apiKey
  assert.ok(!JSON.stringify(entry).includes('sk-12345678901234567890') || entry.apiKey !== 'sk-12345678901234567890',
    'J1-T6b: apiKey is redacted or not raw')
  console.log('  ✅ J1-T6: 脱敏 (2 assertions)')
}

// T7: VALID_LOG_LEVELS 常量
{
  assert.deepEqual([...VALID_LOG_LEVELS], ['debug', 'info', 'warn', 'error'], 'J1-T7: VALID_LOG_LEVELS')
  console.log('  ✅ J1-T7: VALID_LOG_LEVELS (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// J.2: Session Lifecycle Events (GAP-35)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── J.2: Session Lifecycle Events ──')

import {
  onSessionEvent,
  offSessionEvent,
  emitSessionEvent,
  listenerCount,
  clearAllSessionListeners,
  SESSION_EVENT_TYPES,
  type SessionEvent,
  type SessionEventType,
} from '../session/lifecycle.js'

// 每个测试前清空
clearAllSessionListeners()

// T1: 基本事件订阅和发射
{
  clearAllSessionListeners()
  const events: SessionEvent[] = []
  onSessionEvent('session:created', (e) => events.push(e))

  emitSessionEvent('session:created', 'test-key-1')
  assert.equal(events.length, 1, 'J2-T1a: one event received')
  assert.equal(events[0].type, 'session:created', 'J2-T1b: correct type')
  assert.equal(events[0].sessionKey, 'test-key-1', 'J2-T1c: correct key')
  assert.ok(events[0].timestamp > 0, 'J2-T1d: timestamp present')
  console.log('  ✅ J2-T1: 基本事件订阅 (4 assertions)')
}

// T2: 带 data 的事件
{
  clearAllSessionListeners()
  const events: SessionEvent[] = []
  onSessionEvent('session:persisted', (e) => events.push(e))

  emitSessionEvent('session:persisted', 'key-2', { messageCount: 42 })
  assert.equal(events.length, 1, 'J2-T2a: event received')
  assert.equal(events[0].data?.messageCount, 42, 'J2-T2b: data.messageCount')
  console.log('  ✅ J2-T2: 带 data 事件 (2 assertions)')
}

// T3: 移除监听器
{
  clearAllSessionListeners()
  const events: SessionEvent[] = []
  const handler = (e: SessionEvent) => events.push(e)

  onSessionEvent('session:destroyed', handler)
  assert.equal(listenerCount('session:destroyed'), 1, 'J2-T3a: 1 listener')

  emitSessionEvent('session:destroyed', 'key-3')
  assert.equal(events.length, 1, 'J2-T3b: event received')

  const removed = offSessionEvent('session:destroyed', handler)
  assert.equal(removed, true, 'J2-T3c: removed successfully')
  assert.equal(listenerCount('session:destroyed'), 0, 'J2-T3d: 0 listeners')

  emitSessionEvent('session:destroyed', 'key-3b')
  assert.equal(events.length, 1, 'J2-T3e: no more events after removal')
  console.log('  ✅ J2-T3: 移除监听器 (5 assertions)')
}

// T4: 多个监听器
{
  clearAllSessionListeners()
  const order: number[] = []
  onSessionEvent('session:reaped', () => order.push(1))
  onSessionEvent('session:reaped', () => order.push(2))
  onSessionEvent('session:reaped', () => order.push(3))

  emitSessionEvent('session:reaped', 'key-4')
  assert.deepEqual(order, [1, 2, 3], 'J2-T4a: handlers called in order')
  assert.equal(listenerCount('session:reaped'), 3, 'J2-T4b: 3 listeners')
  console.log('  ✅ J2-T4: 多监听器顺序 (2 assertions)')
}

// T5: handler 异常隔离
{
  clearAllSessionListeners()
  const events: string[] = []
  onSessionEvent('session:created', () => { throw new Error('boom') })
  onSessionEvent('session:created', () => events.push('survived'))

  emitSessionEvent('session:created', 'key-5')
  assert.equal(events.length, 1, 'J2-T5a: second handler survived')
  assert.equal(events[0], 'survived', 'J2-T5b: correct value')
  console.log('  ✅ J2-T5: 异常隔离 (2 assertions)')
}

// T6: 无监听器时不报错
{
  clearAllSessionListeners()
  // 不应抛出异常
  emitSessionEvent('session:restored', 'key-6')
  assert.ok(true, 'J2-T6: no error when no listeners')
  console.log('  ✅ J2-T6: 无监听器安全 (1 assertion)')
}

// T7: SESSION_EVENT_TYPES 常量
{
  assert.equal(SESSION_EVENT_TYPES.length, 5, 'J2-T7a: 5 event types')
  assert.ok(SESSION_EVENT_TYPES.includes('session:created'), 'J2-T7b: includes created')
  assert.ok(SESSION_EVENT_TYPES.includes('session:restored'), 'J2-T7c: includes restored')
  assert.ok(SESSION_EVENT_TYPES.includes('session:persisted'), 'J2-T7d: includes persisted')
  assert.ok(SESSION_EVENT_TYPES.includes('session:destroyed'), 'J2-T7e: includes destroyed')
  assert.ok(SESSION_EVENT_TYPES.includes('session:reaped'), 'J2-T7f: includes reaped')
  console.log('  ✅ J2-T7: SESSION_EVENT_TYPES (6 assertions)')
}

// T8: offSessionEvent 对不存在的 handler 返回 false
{
  clearAllSessionListeners()
  const result = offSessionEvent('session:created', () => {})
  assert.equal(result, false, 'J2-T8: returns false for unknown handler')
  console.log('  ✅ J2-T8: offSessionEvent 未知 handler (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// J.3: Hooks Framework (GAP-36)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── J.3: Hooks Framework ──')

import {
  HookRegistry,
  globalHookRegistry,
  HOOK_POINTS,
  type HookPoint,
} from '../hooks/index.js'

// T1: HookRegistry 基本注册和触发
{
  const registry = new HookRegistry()
  const calls: string[] = []

  registry.register('beforeToolCall', (payload) => {
    calls.push(`before:${payload.toolName}`)
  })

  await registry.invoke('beforeToolCall', {
    toolName: 'bash',
    args: { command: 'ls' },
    sessionKey: 'test',
  })

  assert.equal(calls.length, 1, 'J3-T1a: handler called')
  assert.equal(calls[0], 'before:bash', 'J3-T1b: correct payload')
  assert.equal(registry.count('beforeToolCall'), 1, 'J3-T1c: count = 1')
  console.log('  ✅ J3-T1: 基本注册和触发 (3 assertions)')
}

// T2: hook 阻止执行
{
  const registry = new HookRegistry()
  registry.register('beforeToolCall', () => ({ block: true, reason: 'denied by policy' }))

  const result = await registry.invoke('beforeToolCall', {
    toolName: 'bash',
    args: {},
    sessionKey: 'test',
  })

  assert.equal(result.blocked, true, 'J3-T2a: blocked')
  assert.equal(result.reason, 'denied by policy', 'J3-T2b: reason')
  console.log('  ✅ J3-T2: hook 阻止执行 (2 assertions)')
}

// T3: 多个 hook 按注册顺序执行
{
  const registry = new HookRegistry()
  const order: number[] = []

  registry.register('afterToolCall', () => { order.push(1) })
  registry.register('afterToolCall', () => { order.push(2) })
  registry.register('afterToolCall', () => { order.push(3) })

  await registry.invoke('afterToolCall', {
    toolName: 'read_file',
    args: {},
    result: 'ok',
    isError: false,
    sessionKey: 'test',
    durationMs: 100,
  })

  assert.deepEqual(order, [1, 2, 3], 'J3-T3a: order preserved')
  assert.equal(registry.count('afterToolCall'), 3, 'J3-T3b: count = 3')
  console.log('  ✅ J3-T3: 注册顺序 (2 assertions)')
}

// T4: hook 错误隔离
{
  const registry = new HookRegistry()
  const calls: string[] = []

  registry.register('beforeLLMCall', () => { throw new Error('hook crash') })
  registry.register('beforeLLMCall', () => { calls.push('survived') })

  const result = await registry.invoke('beforeLLMCall', {
    sessionKey: 'test',
    providerId: 'copilot',
    modelId: 'gpt-4o',
    messageCount: 5,
    loopCount: 1,
  })

  assert.equal(result.blocked, false, 'J3-T4a: not blocked despite error')
  assert.equal(calls.length, 1, 'J3-T4b: second handler survived')
  assert.equal(calls[0], 'survived', 'J3-T4c: correct value')
  console.log('  ✅ J3-T4: 错误隔离 (3 assertions)')
}

// T5: 取消注册（返回的 unregister 函数）
{
  const registry = new HookRegistry()
  const calls: string[] = []

  const unregister = registry.register('afterLLMCall', () => { calls.push('called') })
  assert.equal(registry.count('afterLLMCall'), 1, 'J3-T5a: count = 1')

  unregister()
  assert.equal(registry.count('afterLLMCall'), 0, 'J3-T5b: count = 0 after unregister')

  await registry.invoke('afterLLMCall', {
    sessionKey: 'test',
    providerId: 'copilot',
    modelId: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 50,
    toolCallCount: 0,
    loopCount: 1,
  })
  assert.equal(calls.length, 0, 'J3-T5c: handler not called after unregister')
  console.log('  ✅ J3-T5: 取消注册 (3 assertions)')
}

// T6: 无 hook 时 invoke 安全返回
{
  const registry = new HookRegistry()
  const result = await registry.invoke('beforePersist', { sessionKey: 'test', messageCount: 0 })
  assert.equal(result.blocked, false, 'J3-T6a: not blocked')
  assert.equal(result.reason, undefined, 'J3-T6b: no reason')
  console.log('  ✅ J3-T6: 无 hook 安全返回 (2 assertions)')
}

// T7: clear 和 clearPoint
{
  const registry = new HookRegistry()
  registry.register('beforeToolCall', () => {})
  registry.register('afterToolCall', () => {})
  registry.register('beforeLLMCall', () => {})

  registry.clearPoint('beforeToolCall')
  assert.equal(registry.count('beforeToolCall'), 0, 'J3-T7a: beforeToolCall cleared')
  assert.equal(registry.count('afterToolCall'), 1, 'J3-T7b: afterToolCall intact')

  registry.clear()
  assert.equal(registry.count('afterToolCall'), 0, 'J3-T7c: all cleared')
  assert.equal(registry.count('beforeLLMCall'), 0, 'J3-T7d: all cleared')
  console.log('  ✅ J3-T7: clear / clearPoint (4 assertions)')
}

// T8: HOOK_POINTS 常量
{
  assert.equal(HOOK_POINTS.length, 6, 'J3-T8a: 6 hook points')
  assert.ok(HOOK_POINTS.includes('beforeToolCall'), 'J3-T8b')
  assert.ok(HOOK_POINTS.includes('afterToolCall'), 'J3-T8c')
  assert.ok(HOOK_POINTS.includes('beforeLLMCall'), 'J3-T8d')
  assert.ok(HOOK_POINTS.includes('afterLLMCall'), 'J3-T8e')
  assert.ok(HOOK_POINTS.includes('beforePersist'), 'J3-T8f')
  assert.ok(HOOK_POINTS.includes('afterPersist'), 'J3-T8g')
  console.log('  ✅ J3-T8: HOOK_POINTS (7 assertions)')
}

// T9: globalHookRegistry 是 HookRegistry 实例
{
  assert.ok(globalHookRegistry instanceof HookRegistry, 'J3-T9a: instance of HookRegistry')
  assert.equal(typeof globalHookRegistry.register, 'function', 'J3-T9b: has register')
  assert.equal(typeof globalHookRegistry.invoke, 'function', 'J3-T9c: has invoke')
  console.log('  ✅ J3-T9: globalHookRegistry (3 assertions)')
}

// T10: beforePersist / afterPersist hook
{
  const registry = new HookRegistry()
  const calls: string[] = []

  registry.register('beforePersist', (p) => { calls.push(`before:${p.sessionKey}`) })
  registry.register('afterPersist', (p) => { calls.push(`after:${p.sessionKey}`) })

  await registry.invoke('beforePersist', { sessionKey: 'sess1', messageCount: 10 })
  await registry.invoke('afterPersist', { sessionKey: 'sess1', messageCount: 10 })

  assert.deepEqual(calls, ['before:sess1', 'after:sess1'], 'J3-T10: persist hooks work')
  console.log('  ✅ J3-T10: persist hooks (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════════════════════════

const J1_TOTAL = 6 + 6 + 3 + 5 + 2 + 2 + 1  // 25
const J2_TOTAL = 4 + 2 + 5 + 2 + 2 + 1 + 6 + 1  // 23
const J3_TOTAL = 3 + 2 + 2 + 3 + 3 + 2 + 4 + 7 + 3 + 1  // 30
const TOTAL = J1_TOTAL + J2_TOTAL + J3_TOTAL
console.log(`\n✅ Phase J: 全部通过 (${TOTAL} assertions)`)
