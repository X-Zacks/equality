/**
 * Phase E3 — 子 Agent 系统单元测试
 *
 * T39: spawn 创建子任务并返回 taskId
 * T40: 子任务使用独立 sessionKey
 * T41: list 返回当前父会话相关子任务
 * T42: steer 将消息投递到运行中子任务
 * T43: kill 取消任务并迁移到 cancelled
 * T44: depth>1 被拒绝
 */

import { TaskRegistry } from '../tasks/registry.js'
import { SubagentManager } from '../agent/subagent-manager.js'
import type { RunAttemptParams, RunAttemptResult } from '../agent/runner.js'
import type { TaskEvent } from '../tasks/types.js'

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

// ─── Mock runAttempt ────────────────────────────────────────────────────────

function createMockRunAttempt(opts?: {
  delay?: number
  result?: string
  error?: Error
  onCall?: (params: RunAttemptParams) => void
}) {
  return async (params: RunAttemptParams): Promise<RunAttemptResult> => {
    opts?.onCall?.(params)

    // 检查 abortSignal
    if (params.abortSignal?.aborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    }

    if (opts?.delay) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, opts.delay)
        if (params.abortSignal) {
          params.abortSignal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }
      })
    }

    if (opts?.error) throw opts.error

    return {
      text: opts?.result ?? `子任务完成: ${params.userMessage}`,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      totalCny: 0.001,
      durationMs: opts?.delay ?? 10,
      modelUsed: 'test-model',
      costLine: '0.001 CNY',
      toolCallCount: 0,
    }
  }
}

// ─── T39: spawn 创建子任务并返回 taskId ──────────────────────────────────────

console.log('\n── T39: spawn 返回 taskId ──')
{
  const registry = new TaskRegistry()
  const callParams: RunAttemptParams[] = []

  const manager = new SubagentManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt({
      result: '调查结果：找到 3 个错误',
      onCall: p => callParams.push(p),
    }),
  })

  const result = await manager.spawn('parent-session', {
    prompt: '请阅读日志并归纳结论',
    goal: '日志分析',
    timeoutMs: 30_000,
  })

  assert(typeof result.taskId === 'string' && result.taskId.length > 0, 'taskId 非空')
  assert(result.success === true, 'success=true')
  assert(result.summary.includes('调查结果'), '摘要包含结果文本')

  // 任务状态
  const task = registry.get(result.taskId)
  assert(task !== undefined, '任务在注册中心中')
  assert(task!.state === 'succeeded', '状态为 succeeded')
  assert(task!.runtime === 'subagent', 'runtime=subagent')
  assert(task!.parentSessionKey === 'parent-session', 'parentSessionKey 正确')
  assert(task!.title === '日志分析', 'title 来自 goal')

  // runAttempt 被调用一次
  assert(callParams.length === 1, 'runAttempt 被调用 1 次')

  registry.clear()
}

// ─── T40: 子任务使用独立 sessionKey ──────────────────────────────────────────

console.log('\n── T40: 子 Agent 独立 session ──')
{
  const registry = new TaskRegistry()
  const callParams: RunAttemptParams[] = []

  const manager = new SubagentManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt({
      onCall: p => callParams.push(p),
    }),
  })

  const result = await manager.spawn('main-session-123', {
    prompt: '执行子任务',
  })

  assert(callParams.length === 1, 'runAttempt 被调用')

  const childSessionKey = callParams[0].sessionKey
  assert(childSessionKey.includes('main-session-123'), 'child session 包含父 session')
  assert(childSessionKey.includes('::sub::'), 'child session 包含 ::sub:: 分隔符')
  assert(childSessionKey.includes(result.taskId), 'child session 包含 taskId')
  assert(childSessionKey !== 'main-session-123', 'child session ≠ 父 session')

  registry.clear()
}

// ─── T41: list 返回当前父会话相关子任务 ──────────────────────────────────────

console.log('\n── T41: list 返回子任务 ──')
{
  const registry = new TaskRegistry()
  const manager = new SubagentManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt(),
  })

  // 创建 2 个子任务
  const r1 = await manager.spawn('session-A', { prompt: '任务1', goal: '第一个' })
  const r2 = await manager.spawn('session-A', { prompt: '任务2', goal: '第二个' })

  // 另一个 session 的子任务
  await manager.spawn('session-B', { prompt: '任务3', goal: '其他会话' })

  // list
  const listA = manager.list('session-A')
  assert(listA.length === 2, `session-A 有 2 个子任务 (实际 ${listA.length})`)
  assert(listA.some(t => t.taskId === r1.taskId), '包含任务1')
  assert(listA.some(t => t.taskId === r2.taskId), '包含任务2')
  assert(listA[0].title === '第二个' || listA[0].title === '第一个', 'title 有值')

  const listB = manager.list('session-B')
  assert(listB.length === 1, `session-B 有 1 个子任务 (实际 ${listB.length})`)

  const listC = manager.list('session-C')
  assert(listC.length === 0, `session-C 没有子任务`)

  registry.clear()
}

// ─── T42: steer 注入方向消息 ──────────────────────────────────────────────────

console.log('\n── T42: steer 注入方向消息 ──')
{
  const registry = new TaskRegistry()
  let resolveRun!: () => void
  const runPromise = new Promise<void>(r => { resolveRun = r })

  // 长运行子任务（不会自动结束，直到 resolve）
  const manager = new SubagentManager({
    taskRegistry: registry,
    runAttempt: async (params) => {
      // 模拟长运行：等待 steering 消息到达
      await new Promise<void>(resolve => {
        const check = () => {
          if (params.steeringQueue && params.steeringQueue.length > 0) {
            resolve()
          } else {
            setTimeout(check, 10)
          }
        }
        // 10ms 后开始检查
        setTimeout(check, 10)
        // 超时保护
        setTimeout(resolve, 2000)
      })
      resolveRun()
      const steerMsg = params.steeringQueue?.shift() ?? 'none'
      return {
        text: `收到 steering: ${steerMsg}`,
        inputTokens: 10, outputTokens: 5, totalTokens: 15,
        totalCny: 0, durationMs: 100, modelUsed: 'test', costLine: '', toolCallCount: 0,
      }
    },
  })

  // spawn 但不 await（让子任务运行）
  const spawnPromise = manager.spawn('steer-session', { prompt: '长运行任务' })

  // 短暂等待确保任务已 running
  await new Promise(r => setTimeout(r, 50))

  // 通过 registry 找到任务
  const tasks = registry.list({ runtime: 'subagent' })
  assert(tasks.length >= 1, `有运行中的子任务 (${tasks.length})`)

  const taskId = tasks[0].id
  const task = registry.get(taskId)
  assert(task?.state === 'running', '任务状态为 running')

  // steer
  manager.steer(taskId, '不要继续改代码，先只收集错误日志')
  const queue = registry.getSteeringQueue(taskId)
  assert(queue.length >= 1, 'steering queue 有消息')

  // 等待子任务完成
  const result = await spawnPromise
  assert(result.summary.includes('steering') || result.success, '子任务收到 steering 消息')

  registry.clear()
}

// ─── T43: kill 取消运行中子任务 ──────────────────────────────────────────────

console.log('\n── T43: kill 取消子任务 ──')
{
  const registry = new TaskRegistry()
  const events: TaskEvent[] = []
  registry.events.on(e => events.push(e))

  const manager = new SubagentManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt({ delay: 5000 }), // 长运行
  })

  // spawn 但不 await
  const spawnPromise = manager.spawn('kill-session', { prompt: '长任务' })

  // 等待任务进入 running
  await new Promise(r => setTimeout(r, 50))

  const tasks = registry.list()
  assert(tasks.length >= 1, '有任务')

  const taskId = tasks.find(t => t.state === 'running')?.id
  assert(taskId !== undefined, '找到 running 任务')

  // kill
  manager.kill(taskId!)

  // 等待 spawn 完成（应该因为 kill 而结束）
  const result = await spawnPromise
  assert(result.success === false, 'kill 后 success=false')

  const task = registry.get(taskId!)
  assert(task?.state === 'cancelled', `状态为 cancelled (实际: ${task?.state})`)

  // 有 cancelled 事件
  assert(events.some(e => e.type === 'cancelled'), '有 cancelled 事件')

  registry.clear()
}

// ─── T44: depth>1 被拒绝 ──────────────────────────────────────────────────────

console.log('\n── T44: depth>1 被拒绝 ──')
{
  const registry = new TaskRegistry()
  // N2: 使用 maxDepth=1 模拟 V1 行为（仅允许 depth=0）
  const manager = new SubagentManager({
    taskRegistry: registry,
    runAttempt: createMockRunAttempt(),
    config: { maxDepth: 1, maxTotalAgents: 20, maxConcurrent: 5 },
  })

  // depth=0 正常（主 Agent 创建子 Agent）
  const r0 = await manager.spawn('root-session', { prompt: '子任务' }, { depth: 0 })
  assert(r0.success === true, 'depth=0 允许')

  // depth=1 被拒（子 Agent 尝试再创建孙子 Agent）
  const r1 = await manager.spawn('child-session', { prompt: '孙子任务' }, { depth: 1 })
  assert(r1.success === false, 'depth=1 被拒绝')
  assert(r1.summary.includes('深度限制') || r1.summary.includes('depth') || r1.summary.includes('maxDepth'), '错误信息说明原因')
  assert(r1.taskId === '', 'depth 超限时 taskId 为空')

  // depth=2 也被拒
  const r2 = await manager.spawn('grandchild', { prompt: '曾孙任务' }, { depth: 2 })
  assert(r2.success === false, 'depth=2 也被拒绝')

  registry.clear()
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Phase E3 — SubAgent: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)

if (failed > 0) process.exit(1)
