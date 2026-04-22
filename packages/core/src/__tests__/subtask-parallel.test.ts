/**
 * Phase N2 — SubtaskManager 深度增强 + 并行 spawn 单元测试
 *
 * N2.5.1: ~35 断言
 * - 可配置深度限制
 * - depth=2 三层嵌套
 * - 全局数量限制
 * - spawnParallel 基本功能
 * - spawnParallel 并发限制
 * - spawnParallel 部分失败
 * - spawnParallel 空 items
 * - onComplete 回调
 * - 级联终止
 * - 非级联终止（默认）
 */

import { SubtaskManager } from '../agent/subtask-manager.js'
import type { RunAttemptFn, SubtaskManagerDeps } from '../agent/subtask-manager.js'
import type { SubtaskResult } from '../agent/subtask-types.js'
import { TaskRegistry } from '../tasks/registry.js'
import type { RunAttemptResult } from '../agent/runner.js'

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Mock runAttempt：延迟 delayMs 后返回成功结果 */
function createMockRunAttempt(opts?: {
  delayMs?: number
  failForSession?: Set<string>
}): RunAttemptFn {
  return async (params) => {
    const delay = opts?.delayMs ?? 10
    await sleep(delay)
    if (params.abortSignal?.aborted) throw new Error('Aborted')
    if (opts?.failForSession?.has(params.sessionKey)) {
      throw new Error(`Mock failure for ${params.sessionKey}`)
    }
    return { text: `完成: ${params.userMessage.slice(0, 50)}`, toolCalls: [] } as any as RunAttemptResult
  }
}

function createDeps(overrides?: {
  delayMs?: number
  failForSession?: Set<string>
  config?: Partial<SubtaskManagerDeps['config']>
}): { registry: TaskRegistry; manager: SubtaskManager } {
  const registry = new TaskRegistry()
  const manager = new SubtaskManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt({
      delayMs: overrides?.delayMs,
      failForSession: overrides?.failForSession,
    }),
    config: overrides?.config as any,
  })
  return { registry, manager }
}

// ─── N2-1: 可配置深度限制——默认 maxDepth=3 ─────────────────────────────────

console.log('\n── N2-1: 默认 maxDepth=3 ──')
{
  const { registry, manager } = createDeps()

  // depth=0: 允许
  const r0 = await manager.spawn('root', { prompt: '任务0' }, { depth: 0 })
  assert(r0.success === true, 'depth=0 允许（默认 maxDepth=3）')

  // depth=1: 允许
  const r1 = await manager.spawn('root::task::x', { prompt: '任务1' }, { depth: 1 })
  assert(r1.success === true, 'depth=1 允许')

  // depth=2: 允许
  const r2 = await manager.spawn('root::task::x::task::y', { prompt: '任务2' }, { depth: 2 })
  assert(r2.success === true, 'depth=2 允许')

  // depth=3: 拒绝
  const r3 = await manager.spawn('deep', { prompt: '任务3' }, { depth: 3 })
  assert(r3.success === false, 'depth=3 被拒绝（maxDepth=3）')
  assert(r3.summary.includes('depth') || r3.summary.includes('深度'), '错误信息说明深度原因')
  assert(r3.taskId === '', '超限时 taskId 为空')

  registry.clear()
}

// ─── N2-2: 自定义 maxDepth=5 ───────────────────────────────────────────────

console.log('\n── N2-2: 自定义 maxDepth=5 ──')
{
  const { registry, manager } = createDeps({ config: { maxDepth: 5 } })

  const r4 = await manager.spawn('deep', { prompt: '任务4' }, { depth: 4 })
  assert(r4.success === true, 'depth=4 允许（maxDepth=5）')

  const r5 = await manager.spawn('deeper', { prompt: '任务5' }, { depth: 5 })
  assert(r5.success === false, 'depth=5 被拒绝')

  registry.clear()
}

// ─── N2-3: 全局数量限制 ────────────────────────────────────────────────────

console.log('\n── N2-3: 全局数量限制 ──')
{
  const { registry, manager } = createDeps({ config: { maxTotalAgents: 2 }, delayMs: 200 })

  // 启动 2 个并行（不 await，占满名额）
  const p1 = manager.spawn('root', { prompt: 'agent1' })
  const p2 = manager.spawn('root', { prompt: 'agent2' })

  // 等一下让两个 spawn 注册到 liveAgents
  await sleep(20)

  // 第 3 个应该被拒绝
  const r3 = await manager.spawn('root', { prompt: 'agent3' })
  assert(r3.success === false, '第 3 个 spawn 被拒绝（maxTotalAgents=2）')
  assert(r3.summary.includes('上限'), '错误信息提到上限')

  // 等待前两个完成
  await Promise.all([p1, p2])
  registry.clear()
}

// ─── N2-4: spawnParallel 基本功能 ──────────────────────────────────────────

console.log('\n── N2-4: spawnParallel 基本功能 ──')
{
  const { registry, manager } = createDeps({ delayMs: 10 })

  const results = await manager.spawnParallel('root', [
    { params: { prompt: '并行任务1' } },
    { params: { prompt: '并行任务2' } },
    { params: { prompt: '并行任务3' } },
  ])

  assert(results.length === 3, 'spawnParallel 返回 3 个结果')
  assert(results.every(r => r.success), '所有结果成功')
  assert(results.every(r => r.taskId.length > 0), '每个结果有 taskId')

  registry.clear()
}

// ─── N2-5: spawnParallel 空 items ──────────────────────────────────────────

console.log('\n── N2-5: spawnParallel 空 items ──')
{
  const { registry, manager } = createDeps()

  const results = await manager.spawnParallel('root', [])
  assert(results.length === 0, '空 items 返回空数组')

  registry.clear()
}

// ─── N2-6: spawnParallel 并发限制 ──────────────────────────────────────────

console.log('\n── N2-6: spawnParallel 并发限制 ──')
{
  let maxConcurrent = 0
  let currentConcurrent = 0

  const registry = new TaskRegistry()
  const manager = new SubtaskManager({
    taskRegistry: registry,
    runAttempt: async (params) => {
      currentConcurrent++
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent
      await sleep(30)
      currentConcurrent--
      if (params.abortSignal?.aborted) throw new Error('Aborted')
      return { text: '完成', toolCalls: [] } as any as RunAttemptResult
    },
    config: { maxTotalAgents: 20, maxDepth: 3, maxConcurrent: 5 },
  })

  const items = Array.from({ length: 5 }, (_, i) => ({
    params: { prompt: `任务${i}` },
  }))

  await manager.spawnParallel('root', items, { maxConcurrent: 2 })

  assert(maxConcurrent <= 2, `spawnParallel 最大并发不超过 2 (实际 ${maxConcurrent})`)

  registry.clear()
}

// ─── N2-7: spawnParallel 部分失败 ──────────────────────────────────────────

console.log('\n── N2-7: spawnParallel 部分失败 ──')
{
  let spawnIndex = 0
  const registry = new TaskRegistry()
  const manager = new SubtaskManager({
    taskRegistry: registry,
    runAttempt: async (params) => {
      await sleep(10)
      if (params.abortSignal?.aborted) throw new Error('Aborted')
      // 通过 session key 里的 sub:: 后缀来区分第几个
      // 但更简单的办法：按 prompt 内容区分
      if (params.userMessage.includes('FAIL')) {
        throw new Error('Deliberate failure')
      }
      return { text: '成功', toolCalls: [] } as any as RunAttemptResult
    },
  })

  const results = await manager.spawnParallel('root', [
    { params: { prompt: '任务OK1' } },
    { params: { prompt: '任务FAIL' } },
    { params: { prompt: '任务OK2' } },
  ])

  assert(results.length === 3, '部分失败仍返回 3 个结果')
  assert(results[0].success === true, '第 1 个成功')
  assert(results[1].success === false, '第 2 个失败')
  assert(results[2].success === true, '第 3 个成功')

  registry.clear()
}

// ─── N2-8: onComplete 回调 ─────────────────────────────────────────────────

console.log('\n── N2-8: onComplete 回调 ──')
{
  const { registry, manager } = createDeps({ delayMs: 10 })

  const completions: SubtaskResult[] = []

  const results = await manager.spawnParallel('root', [
    {
      params: { prompt: '回调任务1' },
      onComplete: (r) => completions.push(r),
    },
    {
      params: { prompt: '回调任务2' },
      onComplete: (r) => completions.push(r),
    },
  ])

  assert(completions.length === 2, 'onComplete 被调用 2 次')
  assert(completions.every(c => c.success), '回调中所有结果成功')
  assert(completions.every(c => c.taskId.length > 0), '回调中有 taskId')

  registry.clear()
}

// ─── N2-9: 单个 spawn onComplete 回调 ─────────────────────────────────────

console.log('\n── N2-9: 单个 spawn onComplete ──')
{
  const { registry, manager } = createDeps({ delayMs: 10 })

  let callbackResult: SubtaskResult | null = null
  const result = await manager.spawn('root', { prompt: '单个回调' }, {
    onComplete: (r) => { callbackResult = r },
  })

  assert(callbackResult !== null, 'onComplete 被调用')
  assert(callbackResult!.taskId === result.taskId, 'onComplete 结果与返回值一致')

  registry.clear()
}

// ─── N2-10: 级联终止 ──────────────────────────────────────────────────────

console.log('\n── N2-10: 级联终止 ──')
{
  const registry = new TaskRegistry()

  // 手动构建任务层级（不通过实际 spawn，直接注册）
  const parentTask = registry.register({
    runtime: 'subtask',
    title: '父任务',
    notificationPolicy: 'state_changes',
  })
  registry.transition(parentTask.id, 'running')

  const childTask = registry.register({
    runtime: 'subtask',
    title: '子任务',
    parentTaskId: parentTask.id,
    notificationPolicy: 'state_changes',
  })
  registry.transition(childTask.id, 'running')

  const grandchildTask = registry.register({
    runtime: 'subtask',
    title: '孙任务',
    parentTaskId: childTask.id,
    notificationPolicy: 'state_changes',
  })
  registry.transition(grandchildTask.id, 'running')

  const manager = new SubtaskManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt(),
  })

  // 级联终止父任务
  manager.kill(parentTask.id, { cascade: true })

  const parent = registry.get(parentTask.id)
  const child = registry.get(childTask.id)
  const grandchild = registry.get(grandchildTask.id)

  assert(parent?.state === 'cancelled', '父任务被终止')
  assert(child?.state === 'cancelled', '子任务被级联终止')
  assert(grandchild?.state === 'cancelled', '孙任务被级联终止')

  registry.clear()
}

// ─── N2-11: 非级联终止 ────────────────────────────────────────────────────

console.log('\n── N2-11: 非级联终止（默认）──')
{
  const registry = new TaskRegistry()

  const parentTask = registry.register({
    runtime: 'subtask',
    title: '父任务',
    notificationPolicy: 'state_changes',
  })
  registry.transition(parentTask.id, 'running')

  const childTask = registry.register({
    runtime: 'subtask',
    title: '子任务',
    parentTaskId: parentTask.id,
    notificationPolicy: 'state_changes',
  })
  registry.transition(childTask.id, 'running')

  const manager = new SubtaskManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt(),
  })

  // 非级联终止（默认）
  manager.kill(parentTask.id)

  const parent = registry.get(parentTask.id)
  const child = registry.get(childTask.id)

  assert(parent?.state === 'cancelled', '父任务被终止')
  assert(child?.state === 'running', '子任务继续运行（未级联）')

  registry.clear()
}

// ─── N2-12: managerConfig 只读 ────────────────────────────────────────────

console.log('\n── N2-12: managerConfig ──')
{
  const { manager } = createDeps({ config: { maxDepth: 5, maxTotalAgents: 10 } })

  assert(manager.managerConfig.maxDepth === 5, 'config.maxDepth=5')
  assert(manager.managerConfig.maxTotalAgents === 10, 'config.maxTotalAgents=10')
  assert(manager.managerConfig.maxConcurrent === 5, 'config.maxConcurrent 使用默认值 5')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Phase N2 — SubtaskManager 深度增强: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)

if (failed > 0) process.exit(1)
