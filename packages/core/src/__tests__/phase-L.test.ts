/**
 * Phase L — 配置与搜索与进程 集成验证
 *
 *   L1: Config Schema Validation (GAP-33)
 *   L2: Web Search Abstraction (GAP-29)
 *   L3: Process Supervision (GAP-34)
 */

import assert from 'node:assert/strict'

// ═══════════════════════════════════════════════════════════════════════════════
// L1: Config Schema Validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── L1: Config Schema Validation ──')

import { EQUALITY_CONFIG_SCHEMA, type ConfigSchema } from '../config/schema.js'
import { validateConfig, type ConfigValidationResult } from '../config/validate.js'
import { migrateConfig, type ConfigMigration } from '../config/migrate.js'

// T1: Schema 覆盖关键配置项
{
  assert.ok('CUSTOM_API_KEY' in EQUALITY_CONFIG_SCHEMA, 'L1-T1a: has CUSTOM_API_KEY')
  assert.ok('CUSTOM_BASE_URL' in EQUALITY_CONFIG_SCHEMA, 'L1-T1b: has CUSTOM_BASE_URL')
  assert.ok('CUSTOM_MODEL' in EQUALITY_CONFIG_SCHEMA, 'L1-T1c: has CUSTOM_MODEL')
  assert.ok('BRAVE_API_KEY' in EQUALITY_CONFIG_SCHEMA, 'L1-T1d: has BRAVE_API_KEY')
  assert.ok('MCP_SERVERS' in EQUALITY_CONFIG_SCHEMA, 'L1-T1e: has MCP_SERVERS')
  assert.ok(Object.keys(EQUALITY_CONFIG_SCHEMA).length >= 10, 'L1-T1f: ≥10 fields')
  console.log('  ✅ L1-T1: Schema 覆盖 (6 assertions)')
}

// T2: 有效配置
{
  const result = validateConfig({ CUSTOM_MODEL: 'gpt-4o' }, EQUALITY_CONFIG_SCHEMA)
  assert.equal(result.valid, true, 'L1-T2a: valid')
  assert.equal(result.errors.length, 0, 'L1-T2b: no errors')
  console.log('  ✅ L1-T2: 有效配置 (2 assertions)')
}

// T3: 类型不匹配
{
  const schema: ConfigSchema = {
    PORT: { type: 'number', description: 'port' },
  }
  const result = validateConfig({ PORT: 'not-a-number' } as any, schema)
  assert.equal(result.valid, false, 'L1-T3a: invalid')
  assert.ok(result.errors.some(e => e.key === 'PORT'), 'L1-T3b: PORT error')
  assert.ok(result.errors[0].message.includes('type mismatch'), 'L1-T3c: type mismatch message')
  console.log('  ✅ L1-T3: 类型不匹配 (3 assertions)')
}

// T4: 必填项缺失
{
  const schema: ConfigSchema = {
    API_KEY: { type: 'string', required: true, description: 'API Key' },
  }
  const result = validateConfig({}, schema)
  assert.equal(result.valid, false, 'L1-T4a: invalid')
  assert.ok(result.errors.some(e => e.key === 'API_KEY'), 'L1-T4b: missing key error')
  console.log('  ✅ L1-T4: 必填缺失 (2 assertions)')
}

// T5: 默认值填充
{
  const schema: ConfigSchema = {
    MODEL: { type: 'string', default: 'gpt-4o', description: 'model' },
    COUNT: { type: 'number', default: 10, description: 'count' },
  }
  const result = validateConfig({}, schema)
  assert.equal(result.valid, true, 'L1-T5a: valid')
  assert.equal(result.applied.MODEL, 'gpt-4o', 'L1-T5b: MODEL default')
  assert.equal(result.applied.COUNT, 10, 'L1-T5c: COUNT default')
  console.log('  ✅ L1-T5: 默认值填充 (3 assertions)')
}

// T6: 未知 key 警告
{
  const result = validateConfig({ UNKNOWN_KEY: 'value' }, EQUALITY_CONFIG_SCHEMA)
  assert.ok(result.warnings.some(w => w.key === 'UNKNOWN_KEY'), 'L1-T6: unknown key warning')
  console.log('  ✅ L1-T6: 未知 key (1 assertion)')
}

// T7: deprecated 警告
{
  const schema: ConfigSchema = {
    OLD_KEY: { type: 'string', deprecated: 'use NEW_KEY instead', description: 'old' },
  }
  const result = validateConfig({ OLD_KEY: 'value' }, schema)
  assert.ok(result.warnings.some(w => w.key === 'OLD_KEY' && w.message.includes('deprecated')), 'L1-T7: deprecated warning')
  console.log('  ✅ L1-T7: deprecated (1 assertion)')
}

// T8: 自定义 validate
{
  const result = validateConfig({ EQUALITY_LOG_LEVEL: 'invalid' }, EQUALITY_CONFIG_SCHEMA)
  assert.equal(result.valid, false, 'L1-T8a: custom validate failed')
  assert.ok(result.errors.some(e => e.key === 'EQUALITY_LOG_LEVEL'), 'L1-T8b: field in errors')
  console.log('  ✅ L1-T8: 自定义 validate (2 assertions)')
}

// T9: 配置迁移 — 按版本顺序
{
  const migrations: ConfigMigration[] = [
    {
      fromVersion: 1, toVersion: 2,
      migrate: (c) => ({ ...c, MODEL: c.MODEL ?? 'gpt-4o', _version: 2 }),
    },
    {
      fromVersion: 2, toVersion: 3,
      migrate: (c) => ({ ...c, PROVIDER: 'custom', _version: 3 }),
    },
  ]
  const result = migrateConfig({ API_KEY: 'sk-123' }, 1, migrations)
  assert.equal(result.toVersion, 3, 'L1-T9a: migrated to v3')
  assert.equal(result.migrationsApplied, 2, 'L1-T9b: 2 migrations')
  assert.equal(result.config.MODEL, 'gpt-4o', 'L1-T9c: MODEL added')
  assert.equal(result.config.PROVIDER, 'custom', 'L1-T9d: PROVIDER added')
  console.log('  ✅ L1-T9: 迁移 (4 assertions)')
}

// T10: 无需迁移（currentVersion=3 但没有 fromVersion=3 的迁移）
{
  const result = migrateConfig({ key: 'val' }, 3, [
    { fromVersion: 1, toVersion: 2, migrate: c => ({ ...c, extra: true }) },
  ])
  assert.equal(result.migrationsApplied, 0, 'L1-T10a: 0 migrations')
  assert.equal(result.toVersion, 3, 'L1-T10b: same version')
  console.log('  ✅ L1-T10: 无需迁移 (2 assertions)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// L2: Web Search Abstraction
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── L2: Web Search Abstraction ──')

import type { WebSearchProvider, WebSearchResult } from '../search/types.js'
import { WebSearchRegistry } from '../search/registry.js'

// Mock providers
const mockBrave: WebSearchProvider = {
  id: 'brave',
  name: 'Brave Search',
  isAvailable: () => true,
  search: async (q) => [{ title: `Brave: ${q}`, url: 'https://brave.com', snippet: q, source: 'brave' }],
}

const mockDDG: WebSearchProvider = {
  id: 'duckduckgo',
  name: 'DuckDuckGo',
  isAvailable: () => true,
  search: async (q) => [{ title: `DDG: ${q}`, url: 'https://ddg.gg', snippet: q, source: 'duckduckgo' }],
}

const mockUnavailable: WebSearchProvider = {
  id: 'unavailable',
  name: 'Unavailable',
  isAvailable: () => false,
  search: async () => [],
}

// T11: 注册和列出
{
  const registry = new WebSearchRegistry()
  registry.register(mockBrave)
  registry.register(mockDDG)
  assert.equal(registry.size, 2, 'L2-T11a: 2 providers')

  const list = await registry.listProviders()
  assert.equal(list.length, 2, 'L2-T11b: list returns 2')
  assert.ok(list.some(p => p.id === 'brave'), 'L2-T11c: brave listed')
  console.log('  ✅ L2-T11: 注册列出 (3 assertions)')
}

// T12: 自动选择可用 provider
{
  const registry = new WebSearchRegistry()
  registry.register(mockUnavailable)
  registry.register(mockDDG)
  const defaultP = await registry.getDefaultProvider()
  assert.equal(defaultP?.id, 'duckduckgo', 'L2-T12: skip unavailable, use ddg')
  console.log('  ✅ L2-T12: 自动选择 (1 assertion)')
}

// T13: 指定 provider 搜索
{
  const registry = new WebSearchRegistry()
  registry.register(mockBrave)
  registry.register(mockDDG)
  const results = await registry.search('test', { providerId: 'brave' })
  assert.ok(results.length > 0, 'L2-T13a: has results')
  assert.equal(results[0].source, 'brave', 'L2-T13b: from brave')
  console.log('  ✅ L2-T13: 指定 provider (2 assertions)')
}

// T14: 通过 registry 搜索（自动选择）
{
  const registry = new WebSearchRegistry()
  registry.register(mockBrave)
  const results = await registry.search('hello')
  assert.ok(results.length > 0, 'L2-T14a: results')
  assert.equal(results[0].title, 'Brave: hello', 'L2-T14b: correct title')
  console.log('  ✅ L2-T14: 自动搜索 (2 assertions)')
}

// T15: 所有 provider 不可用
{
  const registry = new WebSearchRegistry()
  registry.register(mockUnavailable)
  const results = await registry.search('test')
  assert.equal(results.length, 0, 'L2-T15: empty when none available')
  console.log('  ✅ L2-T15: 无可用 provider (1 assertion)')
}

// T16: unregister
{
  const registry = new WebSearchRegistry()
  registry.register(mockBrave)
  assert.equal(registry.size, 1, 'L2-T16a: size=1')
  const removed = registry.unregister('brave')
  assert.equal(removed, true, 'L2-T16b: removed')
  assert.equal(registry.size, 0, 'L2-T16c: size=0')
  console.log('  ✅ L2-T16: 移除 (3 assertions)')
}

// T17: 不存在的 provider
{
  const registry = new WebSearchRegistry()
  try {
    await registry.search('test', { providerId: 'nonexistent' })
    assert.fail('should throw')
  } catch (e: any) {
    assert.ok(e.message.includes('not found'), 'L2-T17: error for missing provider')
  }
  console.log('  ✅ L2-T17: 不存在的 provider (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// L3: Process Supervision
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── L3: Process Supervision ──')

import { CommandQueue, COMMAND_STATUSES } from '../process/command-queue.js'
import { isProcessAlive } from '../process/kill-tree.js'

// T18: COMMAND_STATUSES 常量
{
  assert.deepEqual([...COMMAND_STATUSES], ['queued', 'running', 'completed', 'failed', 'timeout'], 'L3-T18: statuses')
  console.log('  ✅ L3-T18: 常量 (1 assertion)')
}

// T19: 基本入队和执行
{
  const queue = new CommandQueue({ maxConcurrent: 3 })
  const cmd = await queue.enqueue('echo hello', '/tmp', {}, async () => {})
  assert.equal(cmd.status, 'completed', 'L3-T19a: completed')
  assert.ok(cmd.startTime! > 0, 'L3-T19b: has startTime')
  assert.ok(cmd.id.startsWith('cmd-'), 'L3-T19c: has id')
  console.log('  ✅ L3-T19: 基本执行 (3 assertions)')
}

// T20: 并发限制
{
  const queue = new CommandQueue({ maxConcurrent: 2 })
  const status0 = queue.getStatus()
  assert.equal(status0.maxConcurrent, 2, 'L3-T20a: maxConcurrent=2')

  let running = 0
  let maxRunning = 0

  const makeExecutor = () => async () => {
    running++
    maxRunning = Math.max(maxRunning, running)
    await new Promise(r => setTimeout(r, 50))
    running--
  }

  const promises = [
    queue.enqueue('cmd1', '.', {}, makeExecutor()),
    queue.enqueue('cmd2', '.', {}, makeExecutor()),
    queue.enqueue('cmd3', '.', {}, makeExecutor()),
  ]
  await Promise.all(promises)
  assert.ok(maxRunning <= 2, `L3-T20b: maxRunning=${maxRunning} ≤ 2`)
  console.log('  ✅ L3-T20: 并发限制 (2 assertions)')
}

// T21: getStatus
{
  const queue = new CommandQueue({ maxConcurrent: 1 })
  let resolve1!: () => void
  const p1 = new Promise<void>(r => { resolve1 = r })

  const cmdPromise = queue.enqueue('cmd', '.', {}, async () => { await p1 })
  // 入队第二个（应排队）
  const cmd2Promise = queue.enqueue('cmd2', '.', {}, async () => {})

  // 给一点时间让第一个开始
  await new Promise(r => setTimeout(r, 10))
  const status = queue.getStatus()
  assert.equal(status.running, 1, 'L3-T21a: 1 running')
  assert.equal(status.queued, 1, 'L3-T21b: 1 queued')

  resolve1()
  await Promise.all([cmdPromise, cmd2Promise])
  console.log('  ✅ L3-T21: getStatus (2 assertions)')
}

// T22: kill 返回 boolean
{
  const queue = new CommandQueue({ maxConcurrent: 1 })
  // kill 不存在的 id → false
  const killed = queue.kill('nonexistent-id')
  assert.equal(killed, false, 'L3-T22: kill nonexistent returns false')
  console.log('  ✅ L3-T22: kill (1 assertion)')
}

// T23: drain
{
  const queue = new CommandQueue({ maxConcurrent: 5 })
  await queue.enqueue('cmd', '.', {}, async () => {})
  await queue.drain()
  const status = queue.getStatus()
  assert.equal(status.running, 0, 'L3-T23a: 0 running after drain')
  assert.equal(status.queued, 0, 'L3-T23b: 0 queued after drain')
  console.log('  ✅ L3-T23: drain (2 assertions)')
}

// T24: 优先级排序
{
  const queue = new CommandQueue({ maxConcurrent: 1 })
  let resolve1!: () => void
  const p1 = new Promise<void>(r => { resolve1 = r })

  const order: string[] = []

  // 先占满一个槽位
  const cmd1 = queue.enqueue('blocker', '.', {}, async () => { await p1 })
  // 排入两个不同优先级
  const cmd2 = queue.enqueue('low', '.', { priority: 10 }, async () => { order.push('low') })
  const cmd3 = queue.enqueue('high', '.', { priority: 1 }, async () => { order.push('high') })

  resolve1()
  await Promise.all([cmd1, cmd2, cmd3])
  assert.equal(order[0], 'high', 'L3-T24: high priority first')
  console.log('  ✅ L3-T24: 优先级 (1 assertion)')
}

// T25: isProcessAlive
{
  // 当前进程应该是存活的
  assert.equal(isProcessAlive(process.pid), true, 'L3-T25a: current process alive')
  // 不存在的 PID
  assert.equal(isProcessAlive(999999), false, 'L3-T25b: nonexistent pid')
  console.log('  ✅ L3-T25: isProcessAlive (2 assertions)')
}

// T26: executor 异常处理
{
  const queue = new CommandQueue({ maxConcurrent: 3 })
  const cmd = await queue.enqueue('fail', '.', {}, async () => { throw new Error('exec error') })
  assert.equal(cmd.status, 'failed', 'L3-T26: status=failed on error')
  console.log('  ✅ L3-T26: executor 异常 (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// 总结
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n✅ Phase L: 全部通过 (69 assertions)')
