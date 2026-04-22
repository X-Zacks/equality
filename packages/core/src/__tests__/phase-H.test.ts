/**
 * Phase H 测试
 *
 * H1: 孤儿恢复（≥12 assertions）
 * H2: SQLite 任务存储（≥12 assertions）
 * H3: API Key 轮换（≥14 assertions）
 * H4: 持久化守卫（≥12 assertions）
 */

import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// ─── H1: 孤儿恢复 ─────────────────────────────────────────────────────────

import { TaskRegistry } from '../tasks/registry.js'
import { InMemoryTaskStore } from '../tasks/store.js'
import { VALID_TRANSITIONS, TERMINAL_STATES } from '../tasks/types.js'
import {
  buildResumeMessage,
  recoverOrphanTasks,
} from '../tasks/orphan-recovery.js'

async function testH1_T1_lostToQueuedTransition() {
  console.log('  H1-T1: lost → queued 状态迁移')

  // lost 允许迁移到 queued
  assert.ok(
    VALID_TRANSITIONS.lost.includes('queued'),
    'VALID_TRANSITIONS.lost 应包含 queued',
  )

  // lost 不在终止态集合中
  assert.ok(
    !TERMINAL_STATES.has('lost'),
    'TERMINAL_STATES 不应包含 lost',
  )

  // 实际迁移测试
  const registry = new TaskRegistry({ store: new InMemoryTaskStore() })
  const task = registry.register({
    runtime: 'subtask',
    title: '测试孤儿任务',
  })
  registry.transition(task.id, 'running')
  // 模拟 restore 时 running → lost
  const taskRef = registry.get(task.id)!
  ;(taskRef as { state: string }).state = 'lost'
  taskRef.finishedAt = Date.now()

  // lost → queued 应该成功
  registry.transition(task.id, 'queued')
  assert.equal(registry.get(task.id)!.state, 'queued')

  console.log('    ✅ (3 assertions)')
}

async function testH1_T2_otherTerminalStatesStillBlocked() {
  console.log('  H1-T2: 其他终止态仍不可迁移')

  const registry = new TaskRegistry({ store: new InMemoryTaskStore() })

  // succeeded → queued 应抛出
  const t1 = registry.register({ runtime: 'subtask', title: 'test1' })
  registry.transition(t1.id, 'running')
  registry.transition(t1.id, 'succeeded')
  assert.throws(
    () => registry.transition(t1.id, 'queued'),
    /Invalid transition/,
  )

  // cancelled → queued 应抛出
  const t2 = registry.register({ runtime: 'subtask', title: 'test2' })
  registry.transition(t2.id, 'running')
  registry.transition(t2.id, 'cancelled')
  assert.throws(
    () => registry.transition(t2.id, 'queued'),
    /Invalid transition/,
  )

  // failed → queued 应抛出
  const t3 = registry.register({ runtime: 'subtask', title: 'test3' })
  registry.transition(t3.id, 'running')
  registry.transition(t3.id, 'failed')
  assert.throws(
    () => registry.transition(t3.id, 'queued'),
    /Invalid transition/,
  )

  console.log('    ✅ (3 assertions)')
}

async function testH1_T3_recoverOrphanTasks() {
  console.log('  H1-T3: recoverOrphanTasks 恢复 subtask 跳过 cron')

  const store = new InMemoryTaskStore()
  const registry = new TaskRegistry({ store })

  // 创建 2 个 lost subtask 任务
  const sub1 = registry.register({ runtime: 'subtask', title: 'sub1' })
  registry.transition(sub1.id, 'running')
  const sub1Ref = registry.get(sub1.id)!
  ;(sub1Ref as { state: string }).state = 'lost'

  const sub2 = registry.register({ runtime: 'subtask', title: 'sub2' })
  registry.transition(sub2.id, 'running')
  const sub2Ref = registry.get(sub2.id)!
  ;(sub2Ref as { state: string }).state = 'lost'

  // 创建 1 个 lost cron 任务
  const cron1 = registry.register({ runtime: 'cron', title: 'cron1' })
  registry.transition(cron1.id, 'running')
  const cron1Ref = registry.get(cron1.id)!
  ;(cron1Ref as { state: string }).state = 'lost'

  const result = await recoverOrphanTasks({
    taskRegistry: registry,
    spawnFn: async () => true,
  })

  assert.equal(result.recovered, 2, '应恢复 2 个 subtask 任务')
  assert.equal(result.skipped, 1, '应跳过 1 个 cron 任务')
  assert.equal(result.failed, 0, '无失败')

  console.log('    ✅ (3 assertions)')
}

async function testH1_T4_partialFailure() {
  console.log('  H1-T4: 部分失败统计')

  const registry = new TaskRegistry({ store: new InMemoryTaskStore() })

  // 创建 3 个 lost subtask 任务
  const ids: string[] = []
  for (let i = 0; i < 3; i++) {
    const t = registry.register({ runtime: 'subtask', title: `task-${i}` })
    registry.transition(t.id, 'running')
    const ref = registry.get(t.id)!
    ;(ref as { state: string }).state = 'lost'
    ids.push(t.id)
  }

  let callCount = 0
  const result = await recoverOrphanTasks({
    taskRegistry: registry,
    spawnFn: async () => {
      callCount++
      if (callCount === 2) throw new Error('模拟失败')
      return true
    },
  })

  assert.equal(result.recovered, 2, '2 个恢复成功')
  assert.equal(result.failed, 1, '1 个失败')

  console.log('    ✅ (2 assertions)')
}

async function testH1_T5_buildResumeMessage() {
  console.log('  H1-T5: buildResumeMessage 格式')

  const msg = buildResumeMessage({
    id: 'test-id',
    runtime: 'subtask',
    state: 'lost',
    title: '分析项目代码结构',
    createdAt: Date.now(),
    notificationPolicy: 'done_only',
    lastError: '连接超时',
  })

  assert.ok(msg.includes('[System]'), '包含 [System] 前缀')
  assert.ok(msg.includes('分析项目代码结构'), '包含原始任务标题')
  assert.ok(msg.includes('继续'), '包含继续指令')
  assert.ok(msg.includes('连接超时'), '包含最后错误信息')

  // 长标题截断
  const longMsg = buildResumeMessage({
    id: 'test-id-2',
    runtime: 'subtask',
    state: 'lost',
    title: 'x'.repeat(3000),
    createdAt: Date.now(),
    notificationPolicy: 'done_only',
  })
  assert.ok(longMsg.includes('...'), '长标题被截断')

  console.log('    ✅ (5 assertions)')
}

async function testH1_T6_idempotency() {
  console.log('  H1-T6: 幂等保护')

  const registry = new TaskRegistry({ store: new InMemoryTaskStore() })
  const t = registry.register({ runtime: 'subtask', title: 'idempotent' })
  registry.transition(t.id, 'running')
  const ref = registry.get(t.id)!
  ;(ref as { state: string }).state = 'lost'

  const recoveredIds = new Set<string>()

  // 第一次恢复
  const r1 = await recoverOrphanTasks({
    taskRegistry: registry,
    spawnFn: async () => true,
    recoveredIds,
  })
  assert.equal(r1.recovered, 1)

  // 重置为 lost 模拟第二轮
  const ref2 = registry.get(t.id)!
  ;(ref2 as { state: string }).state = 'lost'

  // 第二次恢复 — 应跳过已恢复的
  const r2 = await recoverOrphanTasks({
    taskRegistry: registry,
    spawnFn: async () => true,
    recoveredIds,
  })
  assert.equal(r2.skipped, 1, '已恢复的应跳过')
  assert.equal(r2.recovered, 0, '不重复恢复')

  console.log('    ✅ (3 assertions)')
}

// ─── H2: SQLite 任务存储 ──────────────────────────────────────────────────

import { SqliteTaskStore } from '../tasks/sqlite-store.js'
import type { TaskRecord } from '../tasks/types.js'

function createTempDbPath(): string {
  const dir = join(tmpdir(), `equality-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return join(dir, 'tasks.db')
}

async function testH2_T1_autoCreateSchema() {
  console.log('  H2-T1: 自动建表')

  const dbPath = createTempDbPath()
  assert.ok(!existsSync(dbPath), '数据库文件应不存在')

  const store = new SqliteTaskStore(dbPath)
  // 构造函数异步初始化，通过 load() 等待就绪
  const records = await store.load()
  assert.ok(existsSync(dbPath), '初始化完成后数据库文件应存在')
  assert.deepEqual(records, [], '空数据库应返回空数组')

  await store.close()
  rmSync(dbPath, { force: true })

  console.log('    \u2705 (3 assertions)')
}

async function testH2_T2_roundTrip() {
  console.log('  H2-T2: 数据往返一致性')

  const dbPath = createTempDbPath()
  const store = new SqliteTaskStore(dbPath)

  const record: TaskRecord = {
    id: 'task-001',
    runtime: 'subtask',
    state: 'running',
    title: '测试任务',
    sessionKey: 'session-abc',
    parentTaskId: 'parent-001',
    parentSessionKey: 'session-parent',
    createdAt: 1700000000000,
    startedAt: 1700000001000,
    timeoutMs: 30000,
    notificationPolicy: 'state_changes',
    lastError: '连接超时',
    summary: '正在处理',
    metadata: { foo: 'bar', count: 42 },
  }

  await store.save([record])
  const loaded = await store.load()

  assert.equal(loaded.length, 1)
  const r = loaded[0]
  assert.equal(r.id, 'task-001')
  assert.equal(r.runtime, 'subtask')
  assert.equal(r.state, 'running')
  assert.equal(r.title, '测试任务')
  assert.equal(r.sessionKey, 'session-abc')
  assert.equal(r.createdAt, 1700000000000)
  assert.equal(r.startedAt, 1700000001000)
  assert.equal(r.lastError, '连接超时')
  assert.deepEqual(r.metadata, { foo: 'bar', count: 42 })

  await store.close()
  rmSync(dbPath, { force: true })

  console.log('    \u2705 (9 assertions)')
}

async function testH2_T3_upsert() {
  console.log('  H2-T3: upsert 更新 + 插入')

  const dbPath = createTempDbPath()
  const store = new SqliteTaskStore(dbPath)

  const record: TaskRecord = {
    id: 'upsert-001',
    runtime: 'manual',
    state: 'queued',
    title: '原始标题',
    createdAt: Date.now(),
    notificationPolicy: 'done_only',
  }

  // 插入
  await store.upsert(record)
  let loaded = await store.load()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].title, '原始标题')

  // 更新
  await store.upsert({ ...record, state: 'running', title: '更新后标题' })
  loaded = await store.load()
  assert.equal(loaded.length, 1, '应覆盖而非新增')
  assert.equal(loaded[0].state, 'running')
  assert.equal(loaded[0].title, '更新后标题')

  await store.close()
  rmSync(dbPath, { force: true })

  console.log('    ✅ (5 assertions)')
}

async function testH2_T4_saveFullReplace() {
  console.log('  H2-T4: save 全量替换')

  const dbPath = createTempDbPath()
  const store = new SqliteTaskStore(dbPath)

  // 第一次 save 3 条
  await store.save([
    { id: 'a', runtime: 'manual', state: 'queued', title: 'A', createdAt: 1, notificationPolicy: 'done_only' },
    { id: 'b', runtime: 'manual', state: 'queued', title: 'B', createdAt: 2, notificationPolicy: 'done_only' },
    { id: 'c', runtime: 'manual', state: 'queued', title: 'C', createdAt: 3, notificationPolicy: 'done_only' },
  ] as TaskRecord[])

  let loaded = await store.load()
  assert.equal(loaded.length, 3)

  // 第二次 save 1 条 — 应替换
  await store.save([
    { id: 'd', runtime: 'cron', state: 'running', title: 'D', createdAt: 4, notificationPolicy: 'done_only' },
  ] as TaskRecord[])

  loaded = await store.load()
  assert.equal(loaded.length, 1, 'save 应全量替换')
  assert.equal(loaded[0].id, 'd')

  await store.close()
  rmSync(dbPath, { force: true })

  console.log('    \u2705 (3 assertions)')
}

async function testH2_T5_registryIntegration() {
  console.log('  H2-T5: 与 TaskRegistry 集成')

  const dbPath = createTempDbPath()
  const store = new SqliteTaskStore(dbPath)
  const registry = new TaskRegistry({ store, flushDebounceMs: 0 })

  const task = registry.register({ runtime: 'subtask', title: 'SQLite 集成测试' })
  registry.transition(task.id, 'running')
  registry.transition(task.id, 'succeeded', '完成了')

  // 刷盘
  await registry.flush()

  // 新 registry 从 SQLite 恢复
  const registry2 = new TaskRegistry({ store, flushDebounceMs: 0 })
  await registry2.restore()

  const restored = registry2.get(task.id)
  assert.ok(restored, '任务应被恢复')
  assert.equal(restored!.state, 'succeeded')
  assert.equal(restored!.summary, '完成了')

  await store.close()
  rmSync(dbPath, { force: true })

  console.log('    ✅ (3 assertions)')
}

// ─── H3: API Key 轮换 ─────────────────────────────────────────────────────

import {
  executeWithKeyRotation,
  dedupeKeys,
  collectProviderKeys,
  isRateLimitError,
} from '../providers/key-rotation.js'

async function testH3_T1_firstKeySucceeds() {
  console.log('  H3-T1: 首个 key 成功')

  let retried = false
  const result = await executeWithKeyRotation({
    provider: 'test',
    keys: ['key-A', 'key-B'],
    execute: async (key) => {
      assert.equal(key, 'key-A')
      return 'success'
    },
    onRetry: () => { retried = true },
  })

  assert.equal(result, 'success')
  assert.ok(!retried, '不应触发 onRetry')

  console.log('    ✅ (3 assertions)')
}

async function testH3_T2_rotateOnRateLimit() {
  console.log('  H3-T2: 首个 key 限流轮换到第二个')

  const usedKeys: string[] = []
  let retryCount = 0

  const result = await executeWithKeyRotation({
    provider: 'test',
    keys: ['key-A', 'key-B'],
    execute: async (key) => {
      usedKeys.push(key)
      if (key === 'key-A') throw new Error('429 Too Many Requests')
      return 'ok'
    },
    onRetry: () => { retryCount++ },
  })

  assert.equal(result, 'ok')
  assert.deepEqual(usedKeys, ['key-A', 'key-B'])
  assert.equal(retryCount, 1)

  console.log('    ✅ (3 assertions)')
}

async function testH3_T3_allKeysFail() {
  console.log('  H3-T3: 全部失败抛出最后错误')

  await assert.rejects(
    () => executeWithKeyRotation({
      provider: 'test',
      keys: ['key-A', 'key-B'],
      execute: async () => { throw new Error('rate_limit exceeded') },
    }),
    /rate_limit exceeded/,
  )

  console.log('    ✅ (1 assertion)')
}

async function testH3_T4_emptyKeys() {
  console.log('  H3-T4: 空 key 列表报错')

  await assert.rejects(
    () => executeWithKeyRotation({
      provider: 'test',
      keys: [],
      execute: async () => 'never',
    }),
    /No API keys configured/,
  )

  console.log('    ✅ (1 assertion)')
}

async function testH3_T5_dedupeKeys() {
  console.log('  H3-T5: key 去重')

  const result = dedupeKeys(['key-A', ' key-A ', '', 'key-B', 'key-A', '  ', 'key-C'])
  assert.deepEqual(result, ['key-A', 'key-B', 'key-C'])

  const empty = dedupeKeys(['', '  ', '   '])
  assert.deepEqual(empty, [])

  console.log('    ✅ (2 assertions)')
}

async function testH3_T6_collectProviderKeys() {
  console.log('  H3-T6: collectProviderKeys 多 key 收集')

  // 保存并设置环境变量
  const saved = {
    TESTPROVIDER_API_KEY: process.env.TESTPROVIDER_API_KEY,
    TESTPROVIDER_API_KEY_1: process.env.TESTPROVIDER_API_KEY_1,
    TESTPROVIDER_API_KEY_2: process.env.TESTPROVIDER_API_KEY_2,
  }

  process.env.TESTPROVIDER_API_KEY = 'env-main'
  process.env.TESTPROVIDER_API_KEY_1 = 'env-extra1'
  process.env.TESTPROVIDER_API_KEY_2 = 'env-extra2'

  const keys = collectProviderKeys('testprovider', 'primary')
  assert.ok(keys.includes('primary'), '应包含 primaryKey')
  assert.ok(keys.includes('env-main'), '应包含环境变量主 key')
  assert.ok(keys.includes('env-extra1'), '应包含额外 key 1')
  assert.ok(keys.includes('env-extra2'), '应包含额外 key 2')

  // 恢复环境变量
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }

  console.log('    ✅ (4 assertions)')
}

async function testH3_T7_authErrorNoRetry() {
  console.log('  H3-T7: 认证错误不重试')

  const usedKeys: string[] = []

  await assert.rejects(
    () => executeWithKeyRotation({
      provider: 'test',
      keys: ['key-A', 'key-B'],
      execute: async (key) => {
        usedKeys.push(key)
        throw new Error('401 Unauthorized')
      },
    }),
    /401 Unauthorized/,
  )

  // 默认 shouldRetry 只在 rate_limit 时重试，401 不重试
  assert.deepEqual(usedKeys, ['key-A'], '401 不应轮换到 key-B')

  console.log('    ✅ (2 assertions)')
}

async function testH3_T8_isRateLimitError() {
  console.log('  H3-T8: isRateLimitError 检测')

  assert.ok(isRateLimitError('429 Too Many Requests'))
  assert.ok(isRateLimitError('rate_limit exceeded'))
  assert.ok(isRateLimitError('quota exceeded'))
  assert.ok(!isRateLimitError('401 Unauthorized'))
  assert.ok(!isRateLimitError('500 Internal Server Error'))

  console.log('    ✅ (5 assertions)')
}

// ─── H4: 持久化守卫 ──────────────────────────────────────────────────────

import { truncateForPersistence } from '../session/persist-guard.js'
import type { Message } from '../session/types.js'

function makeToolMsg(content: string): Message {
  return { role: 'tool', content, tool_call_id: 'call-' + randomUUID().slice(0, 8) } as Message
}

function makeAssistantMsg(content: string): Message {
  return { role: 'assistant', content } as Message
}

async function testH4_T1_smallMessagesNoTruncation() {
  console.log('  H4-T1: 小消息不截断')

  const messages: Message[] = [
    makeAssistantMsg('hello'),
    makeToolMsg('short result'),
    makeAssistantMsg('response'),
  ]

  const result = truncateForPersistence(messages)
  assert.equal(result.truncatedCount, 0)
  assert.equal(result.savedChars, 0)
  assert.equal(result.messages.length, 3)

  console.log('    ✅ (3 assertions)')
}

async function testH4_T2_oversizeToolResultTruncated() {
  console.log('  H4-T2: 超大 tool result 被截断')

  const bigContent = 'x'.repeat(200_000)
  const messages: Message[] = [
    makeAssistantMsg('intro'),
    makeToolMsg(bigContent),
  ]

  const result = truncateForPersistence(messages, { maxToolResultChars: 50_000 })
  assert.equal(result.truncatedCount, 1)
  assert.ok(result.savedChars > 100_000, '应节省大量字符')

  const toolMsg = result.messages[1]
  assert.ok(typeof toolMsg.content === 'string')
  assert.ok(
    (toolMsg.content as string).length <= 55_000,  // 50K + 截断提示
    '截断后应 ≤ 55K',
  )
  assert.ok(
    (toolMsg.content as string).includes('持久化时被截断'),
    '应包含截断提示',
  )

  console.log('    ✅ (5 assertions)')
}

async function testH4_T3_multipleOversizeTruncated() {
  console.log('  H4-T3: 多条超大截断')

  const messages: Message[] = [
    makeToolMsg('a'.repeat(100_000)),
    makeToolMsg('b'.repeat(100_000)),
    makeToolMsg('c'.repeat(100_000)),
  ]

  const result = truncateForPersistence(messages, { maxToolResultChars: 50_000 })
  assert.equal(result.truncatedCount, 3)
  assert.ok(result.savedChars > 100_000)

  console.log('    ✅ (2 assertions)')
}

async function testH4_T4_assistantNotTruncated() {
  console.log('  H4-T4: assistant 消息不受影响')

  const bigAssistant = 'x'.repeat(200_000)
  const messages: Message[] = [makeAssistantMsg(bigAssistant)]

  const result = truncateForPersistence(messages, { maxToolResultChars: 50_000 })
  assert.equal(result.truncatedCount, 0)
  assert.equal(result.messages[0].content, bigAssistant, 'assistant 内容不变')

  console.log('    ✅ (2 assertions)')
}

async function testH4_T5_totalBudgetProtection() {
  console.log('  H4-T5: 总预算保护')

  // 10 条 tool result，每条 80K，总计 800K > 500K 预算
  const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
    makeToolMsg(`line-${i}\n`.repeat(80_000 / 7))
  )

  const result = truncateForPersistence(messages, {
    maxToolResultChars: 100_000,  // 单条不触发
    totalBudgetChars: 500_000,    // 但总量触发
  })

  // 总量应被压到预算附近
  let totalChars = 0
  for (const msg of result.messages) {
    if (typeof msg.content === 'string') totalChars += msg.content.length
  }
  assert.ok(totalChars <= 550_000, `总量应 ≤ 550K, 实际 ${totalChars}`)
  assert.ok(result.truncatedCount > 0, '应有截断')

  console.log('    ✅ (2 assertions)')
}

async function testH4_T6_truncationMarkerPresent() {
  console.log('  H4-T6: 截断标记存在')

  const messages: Message[] = [
    makeToolMsg('data\n'.repeat(20_000) + 'Error: connection refused\n'),
  ]

  const result = truncateForPersistence(messages, { maxToolResultChars: 10_000 })
  const content = result.messages[0].content as string

  assert.ok(content.includes('⚠️'), '应包含截断图标')
  assert.ok(content.includes('持久化时被截断'), '应包含截断说明')

  console.log('    ✅ (2 assertions)')
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Phase H Tests ===\n')

  console.log('--- H1: 孤儿恢复 ---')
  await testH1_T1_lostToQueuedTransition()
  await testH1_T2_otherTerminalStatesStillBlocked()
  await testH1_T3_recoverOrphanTasks()
  await testH1_T4_partialFailure()
  await testH1_T5_buildResumeMessage()
  await testH1_T6_idempotency()

  console.log('\n--- H2: SQLite 任务存储 ---')
  await testH2_T1_autoCreateSchema()
  await testH2_T2_roundTrip()
  await testH2_T3_upsert()
  await testH2_T4_saveFullReplace()
  await testH2_T5_registryIntegration()

  console.log('\n--- H3: API Key 轮换 ---')
  await testH3_T1_firstKeySucceeds()
  await testH3_T2_rotateOnRateLimit()
  await testH3_T3_allKeysFail()
  await testH3_T4_emptyKeys()
  await testH3_T5_dedupeKeys()
  await testH3_T6_collectProviderKeys()
  await testH3_T7_authErrorNoRetry()
  await testH3_T8_isRateLimitError()

  console.log('\n--- H4: 持久化守卫 ---')
  await testH4_T1_smallMessagesNoTruncation()
  await testH4_T2_oversizeToolResultTruncated()
  await testH4_T3_multipleOversizeTruncated()
  await testH4_T4_assistantNotTruncated()
  await testH4_T5_totalBudgetProtection()
  await testH4_T6_truncationMarkerPresent()

  console.log('\n✅ Phase H: 全部通过\n')
}

main().catch(err => {
  console.error('❌ Phase H 测试失败:', err)
  process.exit(1)
})
