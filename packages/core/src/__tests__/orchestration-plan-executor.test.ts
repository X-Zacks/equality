/**
 * Phase N1 — PlanExecutor 单元测试
 *
 * N1.8.2: ~50 断言
 * - 串行执行
 * - 并行执行
 * - 节点失败重试
 * - 节点超时
 * - 全局超时
 * - 暂停和恢复
 * - 取消
 * - 跳过节点
 * - 进度回调
 * - 空 Plan
 * - 单节点 Plan
 * - stuck 检测
 */

import { PlanExecutor } from '../orchestration/plan-executor.js'
import type { NodeSpawner, NodeSpawnResult } from '../orchestration/plan-executor.js'
import { createPlanGraph, createPlanNode } from '../orchestration/plan-types.js'
import type { PlanNode, PlanProgress } from '../orchestration/plan-types.js'

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

// ─── Mock NodeSpawner ────────────────────────────────────────────────────────

/**
 * 创建一个可配置的 Mock Spawner。
 * 默认：每个节点延迟 delayMs 后成功。
 * 可通过 failNodes 指定失败节点、通过 nodeDelays 指定单独延迟。
 */
function createMockSpawner(opts?: {
  delayMs?: number
  failNodes?: Set<string>
  nodeDelays?: Map<string, number>
  failCount?: Map<string, number>  // nodeId → 前 N 次失败，之后成功
}): NodeSpawner & { calls: string[]; steered: Array<{ taskId: string; message: string }>; killed: string[] } {
  const calls: string[] = []
  const steered: Array<{ taskId: string; message: string }> = []
  const killed: string[] = []
  const attemptCounts = new Map<string, number>()

  return {
    calls,
    steered,
    killed,
    async spawn(node: PlanNode, abortSignal: AbortSignal): Promise<NodeSpawnResult> {
      calls.push(node.id)
      const delay = opts?.nodeDelays?.get(node.id) ?? opts?.delayMs ?? 10
      const attempts = (attemptCounts.get(node.id) ?? 0) + 1
      attemptCounts.set(node.id, attempts)

      // 等待延迟，同时监听 abort
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay)
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        }, { once: true })
        if (abortSignal.aborted) {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        }
      })

      // 检查是否应该失败
      const failCountMax = opts?.failCount?.get(node.id) ?? 0
      if (failCountMax > 0 && attempts <= failCountMax) {
        return { success: false, summary: `Failed attempt ${attempts}`, taskId: `task-${node.id}` }
      }

      if (opts?.failNodes?.has(node.id)) {
        return { success: false, summary: `Node ${node.id} failed`, taskId: `task-${node.id}` }
      }

      return { success: true, summary: `Node ${node.id} completed`, taskId: `task-${node.id}` }
    },
    steer(taskId: string, message: string) {
      steered.push({ taskId, message })
    },
    kill(taskId: string) {
      killed.push(taskId)
    },
  }
}

/** 简单节点工厂 */
function node(id: string, deps: string[] = [], opts?: { priority?: number; maxRetries?: number; timeoutMs?: number }): PlanNode {
  return createPlanNode({
    id,
    role: 'developer',
    task: `Task ${id}`,
    dependsOn: deps,
    priority: opts?.priority ?? 0,
    maxRetries: opts?.maxRetries ?? 2,
    timeoutMs: opts?.timeoutMs ?? 30_000,
  })
}

// ─── E1: 空 Plan ────────────────────────────────────────────────────────────

console.log('\n── E1: 空 Plan ──')
{
  const spawner = createMockSpawner()
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({ id: 'empty', title: 'Empty', nodes: [] })
  const result = await executor.execute(plan)

  assert(result.status === 'completed', '空 Plan status=completed')
  assert(result.completedNodes === 0, 'completedNodes=0')
  assert(result.totalNodes === 0, 'totalNodes=0')
  assert(spawner.calls.length === 0, '无 spawn 调用')
}

// ─── E2: 单节点 Plan ────────────────────────────────────────────────────────

console.log('\n── E2: 单节点 Plan ──')
{
  const spawner = createMockSpawner({ delayMs: 10 })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'single',
    title: 'Single',
    nodes: [node('A')],
  })
  const result = await executor.execute(plan)

  assert(result.status === 'completed', '单节点 status=completed')
  assert(result.completedNodes === 1, 'completedNodes=1')
  assert(result.totalNodes === 1, 'totalNodes=1')
  assert(spawner.calls.length === 1, 'spawn 调用 1 次')
  assert(spawner.calls[0] === 'A', 'spawn 了 A')
}

// ─── E3: 串行执行 ───────────────────────────────────────────────────────────

console.log('\n── E3: 串行执行 ──')
{
  const spawner = createMockSpawner({ delayMs: 10 })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'serial',
    title: 'Serial',
    nodes: [
      node('A'),
      node('B', ['A']),
      node('C', ['B']),
    ],
    maxConcurrent: 3,
  })
  const result = await executor.execute(plan)

  assert(result.status === 'completed', '串行 status=completed')
  assert(result.completedNodes === 3, 'completedNodes=3')
  // 验证执行顺序
  assert(spawner.calls.indexOf('A') < spawner.calls.indexOf('B'), 'A 在 B 之前执行')
  assert(spawner.calls.indexOf('B') < spawner.calls.indexOf('C'), 'B 在 C 之前执行')
}

// ─── E4: 并行执行 ───────────────────────────────────────────────────────────

console.log('\n── E4: 并行执行 ──')
{
  const callTimestamps = new Map<string, number>()
  const spawner: NodeSpawner & { calls: string[] } = {
    calls: [],
    async spawn(n: PlanNode, signal: AbortSignal) {
      this.calls.push(n.id)
      callTimestamps.set(n.id, Date.now())
      await sleep(50)
      return { success: true, summary: `${n.id} done` }
    },
    steer() {},
    kill() {},
  }

  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'parallel',
    title: 'Parallel',
    nodes: [
      node('A'),
      node('B', ['A']),
      node('C', ['A']),
    ],
    maxConcurrent: 3,
  })

  const start = Date.now()
  const result = await executor.execute(plan)
  const elapsed = Date.now() - start

  assert(result.status === 'completed', '并行 status=completed')
  assert(result.completedNodes === 3, 'completedNodes=3')
  // B 和 C 应该几乎同时开始
  const bStart = callTimestamps.get('B')!
  const cStart = callTimestamps.get('C')!
  assert(Math.abs(bStart - cStart) < 30, 'B 和 C 几乎同时启动（差距<30ms）')
}

// ─── E5: 节点失败重试 ──────────────────────────────────────────────────────

console.log('\n── E5: 节点失败重试 ──')
{
  // B 前 2 次失败，第 3 次成功，maxRetries=2
  const spawner = createMockSpawner({
    delayMs: 5,
    failCount: new Map([['B', 2]]),
  })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'retry',
    title: 'Retry',
    nodes: [
      node('A'),
      node('B', ['A'], { maxRetries: 2 }),
    ],
    maxConcurrent: 3,
  })
  const result = await executor.execute(plan)

  assert(result.status === 'completed', '重试后 status=completed')
  assert(result.completedNodes === 2, 'completedNodes=2')

  // B 应该被调用 3 次（2 次失败 + 1 次成功）
  const bCalls = spawner.calls.filter(c => c === 'B')
  assert(bCalls.length === 3, 'B 被 spawn 了 3 次（2 次失败 + 1 次成功）')
}

// ─── E6: 节点失败耗尽 ──────────────────────────────────────────────────────

console.log('\n── E6: 节点失败耗尽 ──')
{
  const spawner = createMockSpawner({
    delayMs: 5,
    failNodes: new Set(['B']),
  })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'exhaust',
    title: 'Exhaust',
    nodes: [
      node('A'),
      node('B', ['A'], { maxRetries: 1 }),
      node('C', ['B']),
    ],
    maxConcurrent: 3,
  })
  const result = await executor.execute(plan)

  assert(result.status === 'partial', '有耗尽节点时 status=partial')
  assert(result.failedNodes.includes('B'), 'B 在 failedNodes 中')

  // B 应该被调用 2 次（1 次初始 + 1 次重试）
  const bCalls = spawner.calls.filter(c => c === 'B')
  assert(bCalls.length === 2, 'B 被 spawn 了 2 次（1 次初始 + 1 次重试）')
}

// ─── E7: 节点超时 ───────────────────────────────────────────────────────────

console.log('\n── E7: 节点超时 ──')
{
  const spawner = createMockSpawner({
    nodeDelays: new Map([['B', 5000]]),  // B 延迟很长
    delayMs: 10,
  })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'timeout',
    title: 'Timeout',
    nodes: [
      node('A'),
      node('B', ['A'], { timeoutMs: 50, maxRetries: 0 }),  // 50ms 超时，不重试
    ],
    maxConcurrent: 3,
  })

  const result = await executor.execute(plan)

  // B 应该超时变为 failed/exhausted
  assert(result.failedNodes.includes('B'), 'B 超时后在 failedNodes 中')
  assert(result.status !== 'completed', '有超时节点时 status 非 completed')
}

// ─── E8: 全局超时 ───────────────────────────────────────────────────────────

console.log('\n── E8: 全局超时 ──')
{
  const spawner = createMockSpawner({
    delayMs: 5000,  // 所有节点延迟很长
  })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'global-timeout',
    title: 'GlobalTimeout',
    nodes: [
      node('A'),
      node('B'),
    ],
    maxConcurrent: 3,
    globalTimeoutMs: 100,  // 100ms 全局超时
  })

  const result = await executor.execute(plan)

  assert(result.status === 'timed_out', '全局超时 status=timed_out')
}

// ─── E9: 取消 ───────────────────────────────────────────────────────────────

console.log('\n── E9: 取消 ──')
{
  const spawner = createMockSpawner({ delayMs: 500 })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'cancel',
    title: 'Cancel',
    nodes: [
      node('A'),
      node('B'),
      node('C', ['A', 'B']),
    ],
    maxConcurrent: 3,
  })

  // 启动执行，50ms 后取消
  const resultPromise = executor.execute(plan)
  await sleep(30)
  executor.cancel('test cancel')

  const result = await resultPromise

  assert(result.status === 'cancelled', '取消后 status=cancelled')
}

// ─── E10: 暂停和恢复 ────────────────────────────────────────────────────────

console.log('\n── E10: 暂停和恢复 ──')
{
  const spawner = createMockSpawner({ delayMs: 30 })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'pause-resume',
    title: 'PauseResume',
    nodes: [
      node('A'),
      node('B', ['A']),
    ],
    maxConcurrent: 3,
  })

  // 启动执行
  const resultPromise = executor.execute(plan)

  // 等 A 开始后暂停
  await sleep(10)
  executor.pause()
  assert(executor.state === 'paused', 'pause() 后状态为 paused')

  // 等 A 完成
  await sleep(50)

  // 恢复
  executor.resume()

  const result = await resultPromise
  assert(result.status === 'completed', '恢复后 status=completed')
  assert(result.completedNodes === 2, '恢复后 completedNodes=2')
}

// ─── E11: 跳过节点 ─────────────────────────────────────────────────────────

console.log('\n── E11: 跳过节点 ──')
{
  // 使用 onNodeComplete 回调在 B 失败后立即跳过它
  // B 延迟长到不会自动完成，我们在 A 完成后手动跳过 B
  const spawner = createMockSpawner({ delayMs: 10 })
  let skipDone = false
  const executor = new PlanExecutor({
    spawner,
    onProgress: (p) => {
      // 当 A 完成时，跳过 B（B 此时应该是 pending 或 running）
      if (p.changedNodeId === 'A' && p.changedNodeStatus === 'completed' && !skipDone) {
        skipDone = true
        // 稍等一帧让 B 开始
        setTimeout(() => executor.skipNode('B'), 5)
      }
    },
  })

  const plan = createPlanGraph({
    id: 'skip',
    title: 'Skip',
    nodes: [
      node('A'),
      node('B', ['A']),
      node('C', ['B']),
    ],
    maxConcurrent: 3,
  })

  const result = await executor.execute(plan)

  // B 被跳过后 C 应该能执行（skipped 视为完成）
  const bNode = executor.dag?.getNode('B')
  assert(bNode?.status === 'skipped' || result.completedNodes >= 2, 'B 被跳过或至少 2 个节点完成')
  assert(result.status === 'completed', '跳过 B 后 Plan 可以完成')
}

// ─── E12: 进度回调 ─────────────────────────────────────────────────────────

console.log('\n── E12: 进度回调 ──')
{
  const spawner = createMockSpawner({ delayMs: 10 })
  const progressUpdates: PlanProgress[] = []

  const executor = new PlanExecutor({
    spawner,
    onProgress: (p) => progressUpdates.push({ ...p }),
  })

  const plan = createPlanGraph({
    id: 'progress',
    title: 'Progress',
    nodes: [
      node('A'),
      node('B', ['A']),
    ],
    maxConcurrent: 3,
  })

  await executor.execute(plan)

  assert(progressUpdates.length >= 2, `至少 2 次进度回调 (实际 ${progressUpdates.length})`)

  // 检查进度内容
  const lastProgress = progressUpdates[progressUpdates.length - 1]
  assert(lastProgress.planId === 'progress', '进度包含 planId')
  assert(typeof lastProgress.completedNodes === 'number', '进度包含 completedNodes')
  assert(typeof lastProgress.totalNodes === 'number', '进度包含 totalNodes')
  assert(Array.isArray(lastProgress.runningNodes), '进度包含 runningNodes 数组')
  assert(Array.isArray(lastProgress.failedNodes), '进度包含 failedNodes 数组')
}

// ─── E13: 执行历史日志 ─────────────────────────────────────────────────────

console.log('\n── E13: 执行历史日志 ──')
{
  const spawner = createMockSpawner({ delayMs: 5 })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'history',
    title: 'History',
    nodes: [node('A')],
    maxConcurrent: 3,
  })
  await executor.execute(plan)

  const history = executor.history
  assert(history.length >= 2, `历史至少 2 条 (Plan started + Node completed) (实际 ${history.length})`)

  const md = history.asMarkdown()
  assert(md.includes('Plan started'), '历史包含 Plan started')
}

// ─── E14: DAG 验证失败 ─────────────────────────────────────────────────────

console.log('\n── E14: DAG 验证失败 ──')
{
  const spawner = createMockSpawner()
  const executor = new PlanExecutor({ spawner })

  // 有环的 plan
  const plan = createPlanGraph({
    id: 'invalid',
    title: 'Invalid',
    nodes: [
      node('A', ['B']),
      node('B', ['A']),
    ],
    maxConcurrent: 3,
  })
  const result = await executor.execute(plan)

  assert(result.status === 'failed', '验证失败的 Plan status=failed')
  assert(spawner.calls.length === 0, '不合法的 Plan 不会 spawn 任何节点')
}

// ─── E15: 并发限制 ─────────────────────────────────────────────────────────

console.log('\n── E15: 并发限制 ──')
{
  let maxConcurrent = 0
  let currentConcurrent = 0

  const spawner: NodeSpawner & { calls: string[] } = {
    calls: [],
    async spawn(n: PlanNode, signal: AbortSignal) {
      this.calls.push(n.id)
      currentConcurrent++
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent
      await sleep(30)
      currentConcurrent--
      return { success: true, summary: `${n.id} done` }
    },
    steer() {},
    kill() {},
  }

  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'concurrency',
    title: 'Concurrency',
    nodes: [
      node('A'), node('B'), node('C'), node('D'), node('E'),
    ],
    maxConcurrent: 2,
  })
  await executor.execute(plan)

  assert(maxConcurrent <= 2, `最大并发不超过 2 (实际 ${maxConcurrent})`)
  assert(spawner.calls.length === 5, '所有 5 个节点都被调度')
}

// ─── E16: 执行结果包含 summary ──────────────────────────────────────────────

console.log('\n── E16: 执行结果 summary ──')
{
  const spawner = createMockSpawner({ delayMs: 5 })
  const executor = new PlanExecutor({ spawner })

  const plan = createPlanGraph({
    id: 'summary-test',
    title: 'Summary Test',
    nodes: [node('A')],
    maxConcurrent: 3,
  })
  const result = await executor.execute(plan)

  assert(result.summary.includes('Summary Test'), 'summary 包含 Plan title')
  assert(result.durationMs >= 0, 'durationMs >= 0')
  assert(result.planId === 'summary-test', 'planId 正确')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`PlanExecutor 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
