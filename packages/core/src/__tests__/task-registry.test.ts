/**
 * Phase E1 — 任务注册中心单元测试
 *
 * T27: 注册任务后初始状态为 queued
 * T28: 合法迁移：queued → running → succeeded
 * T29: 非法迁移被拒绝
 * T30: 启动恢复时 running → lost
 * T31: cancelTask() 将任务置为 cancelled
 * T32: steerTask() 将消息投递到目标任务
 */

import { TaskRegistry } from '../tasks/registry.js'
import { InMemoryTaskStore } from '../tasks/store.js'
import { TERMINAL_STATES } from '../tasks/types.js'
import type { TaskEvent, TaskRecord } from '../tasks/types.js'

// ─── 测试工具 ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}

function assertThrows(fn: () => void, msg: string) {
  try {
    fn()
    failed++
    console.error(`  ❌ ${msg} (expected throw but succeeded)`)
  } catch {
    passed++
    console.log(`  ✅ ${msg}`)
  }
}

// ─── T27: 注册任务后初始状态为 queued ─────────────────────────────────────────

console.log('\n── T27: 注册任务后初始状态为 queued ──')
{
  const registry = new TaskRegistry()

  // 注册 manual 任务
  const task1 = registry.register({ runtime: 'manual', title: '手动任务' })
  assert(task1.state === 'queued', 'manual 任务初始状态为 queued')
  assert(task1.runtime === 'manual', 'runtime 为 manual')
  assert(typeof task1.id === 'string' && task1.id.length > 0, 'id 非空')
  assert(task1.createdAt > 0, 'createdAt 有值')
  assert(task1.notificationPolicy === 'done_only', '默认通知策略为 done_only')

  // 注册 cron 任务
  const task2 = registry.register({ runtime: 'cron', title: 'cron 任务' })
  assert(task2.state === 'queued', 'cron 任务初始状态为 queued')
  assert(task2.runtime === 'cron', 'runtime 为 cron')

  // 注册 subagent 任务（带 parent 关联）
  const task3 = registry.register({
    runtime: 'subagent',
    title: '子任务',
    parentTaskId: task1.id,
    parentSessionKey: 'session-abc',
    notificationPolicy: 'state_changes',
  })
  assert(task3.state === 'queued', 'subagent 任务初始状态为 queued')
  assert(task3.parentTaskId === task1.id, 'parentTaskId 正确')
  assert(task3.notificationPolicy === 'state_changes', '自定义通知策略生效')

  // 查询
  assert(registry.get(task1.id)?.id === task1.id, 'get() 返回正确任务')
  assert(registry.get('nonexistent') === undefined, '不存在的任务返回 undefined')

  // list
  const all = registry.list()
  assert(all.length === 3, 'list() 返回 3 个任务')

  // 按 runtime 过滤
  const cronTasks = registry.list({ runtime: 'cron' })
  assert(cronTasks.length === 1, 'list(runtime=cron) 返回 1 个')

  // 按 parentTaskId 过滤
  const children = registry.list({ parentTaskId: task1.id })
  assert(children.length === 1, 'list(parentTaskId) 返回 1 个子任务')

  registry.clear()
}

// ─── T28: 合法迁移：queued → running → succeeded ──────────────────────────────

console.log('\n── T28: 合法状态迁移 ──')
{
  const events: TaskEvent[] = []
  const registry = new TaskRegistry()
  registry.events.on(e => events.push(e))

  const task = registry.register({
    runtime: 'manual',
    title: '迁移测试',
    notificationPolicy: 'state_changes',
  })

  // queued → running
  const r1 = registry.transition(task.id, 'running')
  assert(r1.state === 'running', 'queued → running 成功')
  assert(typeof r1.startedAt === 'number', 'startedAt 被设置')

  // running → succeeded
  const r2 = registry.transition(task.id, 'succeeded', '任务完成')
  assert(r2.state === 'succeeded', 'running → succeeded 成功')
  assert(typeof r2.finishedAt === 'number', 'finishedAt 被设置')
  assert(r2.summary === '任务完成', 'summary 被设置')
  assert(TERMINAL_STATES.has(r2.state), '处于终止态')

  // 事件检查（state_changes 策略应发送所有事件）
  assert(events.length >= 2, `至少 2 个事件 (实际 ${events.length})`)
  assert(events.some(e => e.type === 'state_changed'), '有 state_changed 事件')
  assert(events.some(e => e.type === 'finished'), '有 finished 事件')

  // 测试 failed 路径
  const task2 = registry.register({ runtime: 'cron', title: 'fail 测试', notificationPolicy: 'state_changes' })
  registry.transition(task2.id, 'running')
  const r3 = registry.transition(task2.id, 'failed', 'LLM 超时')
  assert(r3.state === 'failed', 'running → failed 成功')
  assert(r3.lastError === 'LLM 超时', 'lastError 被设置')

  // 测试 timed_out 路径
  const task3 = registry.register({ runtime: 'manual', title: 'timeout 测试', notificationPolicy: 'state_changes' })
  registry.transition(task3.id, 'running')
  const r4 = registry.transition(task3.id, 'timed_out', '超时 30s')
  assert(r4.state === 'timed_out', 'running → timed_out 成功')

  registry.clear()
}

// ─── T29: 非法迁移被拒绝 ──────────────────────────────────────────────────────

console.log('\n── T29: 非法迁移被拒绝 ──')
{
  const registry = new TaskRegistry()

  // succeeded → running：终止态不可再迁移
  const task1 = registry.register({ runtime: 'manual', title: '非法迁移1' })
  registry.transition(task1.id, 'running')
  registry.transition(task1.id, 'succeeded')
  assertThrows(
    () => registry.transition(task1.id, 'running'),
    'succeeded → running 被拒绝',
  )

  // queued → succeeded：跳过 running
  const task2 = registry.register({ runtime: 'manual', title: '非法迁移2' })
  assertThrows(
    () => registry.transition(task2.id, 'succeeded'),
    'queued → succeeded 被拒绝',
  )

  // queued → failed
  const task3 = registry.register({ runtime: 'manual', title: '非法迁移3' })
  assertThrows(
    () => registry.transition(task3.id, 'failed'),
    'queued → failed 被拒绝',
  )

  // cancelled → running
  const task4 = registry.register({ runtime: 'manual', title: '非法迁移4' })
  registry.transition(task4.id, 'running')
  registry.transition(task4.id, 'cancelled')
  assertThrows(
    () => registry.transition(task4.id, 'running'),
    'cancelled → running 被拒绝',
  )

  // lost → running
  // Note: lost 只能在 restore 流程中产生，但状态迁移表也应保护
  const task5 = registry.register({ runtime: 'manual', title: '非法迁移5' })
  registry.transition(task5.id, 'running')
  registry.transition(task5.id, 'lost')
  assertThrows(
    () => registry.transition(task5.id, 'running'),
    'lost → running 被拒绝',
  )

  // 不存在的 taskId
  assertThrows(
    () => registry.transition('nonexistent-id', 'running'),
    '不存在的 taskId 抛错',
  )

  // 验证原状态不变
  const latest = registry.get(task1.id)
  assert(latest?.state === 'succeeded', '拒绝后状态不变')

  registry.clear()
}

// ─── T30: 启动恢复时 running → lost ──────────────────────────────────────────

console.log('\n── T30: 启动恢复时 running → lost ──')
{
  const store = new InMemoryTaskStore()

  // 模拟上次运行留下的快照：一个 running、一个 succeeded
  const oldRecords: TaskRecord[] = [
    {
      id: 'task-running-1',
      runtime: 'subagent',
      state: 'running',
      title: '上次崩溃时运行中的子任务',
      createdAt: Date.now() - 60_000,
      startedAt: Date.now() - 50_000,
      notificationPolicy: 'done_only',
    },
    {
      id: 'task-done-1',
      runtime: 'cron',
      state: 'succeeded',
      title: '上次已完成的 cron 任务',
      createdAt: Date.now() - 120_000,
      startedAt: Date.now() - 110_000,
      finishedAt: Date.now() - 100_000,
      notificationPolicy: 'done_only',
    },
    {
      id: 'task-queued-1',
      runtime: 'manual',
      state: 'queued',
      title: '上次排队中的任务',
      createdAt: Date.now() - 30_000,
      notificationPolicy: 'done_only',
    },
  ]
  await store.save(oldRecords)

  // 新建 registry 并恢复
  const registry = new TaskRegistry({ store })
  const count = await registry.restore()

  assert(count === 3, `恢复了 3 个任务 (实际 ${count})`)

  // running → lost
  const t1 = registry.get('task-running-1')
  assert(t1?.state === 'lost', 'running 任务被标记为 lost')
  assert(typeof t1?.finishedAt === 'number', 'lost 任务有 finishedAt')

  // succeeded 不变
  const t2 = registry.get('task-done-1')
  assert(t2?.state === 'succeeded', 'succeeded 任务保持不变')

  // queued 不变（未进入 running 过，不标记 lost）
  const t3 = registry.get('task-queued-1')
  assert(t3?.state === 'queued', 'queued 任务保持不变')

  // 验证 store 持久化被调度（debounce）
  // 等待 debounce 写盘
  await new Promise(r => setTimeout(r, 300))
  const snapshot = store.getSnapshot()
  assert(snapshot.length === 3, '快照已刷新')
  const snapshotRunning = snapshot.find(r => r.id === 'task-running-1')
  assert(snapshotRunning?.state === 'lost', '快照中 running 也变为 lost')

  registry.clear()
}

// ─── T31: cancelTask() 将任务置为 cancelled ──────────────────────────────────

console.log('\n── T31: cancelTask 生效 ──')
{
  const events: TaskEvent[] = []
  const registry = new TaskRegistry()
  registry.events.on(e => events.push(e))

  const task = registry.register({
    runtime: 'manual',
    title: '可取消任务',
    notificationPolicy: 'state_changes',
  })
  registry.transition(task.id, 'running')

  // cancel
  const result = registry.cancel(task.id)
  assert(result.state === 'cancelled', 'cancel 后状态为 cancelled')
  assert(typeof result.finishedAt === 'number', 'finishedAt 被设置')

  // 取消事件
  assert(events.some(e => e.type === 'cancelled'), '有 cancelled 事件')

  // 取消后不可再迁移
  assertThrows(
    () => registry.transition(task.id, 'running'),
    'cancelled 后不可再 transition',
  )

  // 对 queued 任务不能直接 cancel（queued 的合法迁移只有 running）
  const task2 = registry.register({ runtime: 'manual', title: '排队任务' })
  assertThrows(
    () => registry.cancel(task2.id),
    'queued 任务不能直接 cancel',
  )

  registry.clear()
}

// ─── T32: steerTask() 将消息投递到目标任务 ───────────────────────────────────

console.log('\n── T32: steerTask 投递消息 ──')
{
  const events: TaskEvent[] = []
  const registry = new TaskRegistry()
  registry.events.on(e => events.push(e))

  const task = registry.register({
    runtime: 'subagent',
    title: 'steering 测试',
    notificationPolicy: 'state_changes',
  })
  registry.transition(task.id, 'running')

  // 获取 steering queue
  const queue = registry.getSteeringQueue(task.id)
  assert(Array.isArray(queue), 'getSteeringQueue 返回数组')
  assert(queue.length === 0, '初始 steering queue 为空')

  // steer
  registry.steer(task.id, '不要继续改代码，先只收集错误日志')
  assert(queue.length === 1, 'steer 后 queue 有 1 条消息')
  assert(queue[0] === '不要继续改代码，先只收集错误日志', '消息内容正确')

  // 多次 steer
  registry.steer(task.id, '第二条方向调整')
  assert(queue.length === 2, '第二次 steer 后 queue 有 2 条消息')

  // steer 事件
  assert(events.filter(e => e.type === 'steer').length >= 2, '有 steer 事件')

  // 对已结束的任务 steer 应失败
  registry.transition(task.id, 'succeeded')
  assertThrows(
    () => registry.steer(task.id, '晚了'),
    'succeeded 任务不可 steer',
  )

  // 对不存在的任务 steer 应失败
  assertThrows(
    () => registry.steer('nonexistent-id', '消息'),
    '不存在的 taskId steer 抛错',
  )

  // 通知策略测试：silent 任务不发事件（除了 steer）
  const silentTask = registry.register({
    runtime: 'manual',
    title: 'silent 任务',
    notificationPolicy: 'silent',
  })
  const eventsBefore = events.length
  registry.transition(silentTask.id, 'running')
  const eventsAfter = events.length
  assert(eventsAfter === eventsBefore, 'silent 策略不发 state_changed 事件')

  // 但 steer 仍发
  registry.steer(silentTask.id, 'silent 也能 steer')
  assert(events.length > eventsAfter, 'silent 任务的 steer 事件仍发送')

  registry.clear()
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Phase E1 — TaskRegistry: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)

if (failed > 0) process.exit(1)
