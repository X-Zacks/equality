/**
 * agent/subagent-manager.ts — 子 Agent 管理器
 *
 * Phase E3 (GAP-8) + Phase N2: spawn / list / steer / kill / spawnParallel / cascade kill
 *
 * 核心设计：
 * - 每个子 Agent 运行在独立 child session 中
 * - 所有子任务注册到统一 TaskRegistry
 * - N2: 可配置深度限制（maxDepth）、全局上限（maxTotalAgents）、并行 spawn
 */

import type { TaskRegistry } from '../tasks/index.js'
import type {
  ParallelSpawnItem,
  SpawnSubagentParams,
  SubagentInfo,
  SubagentManagerConfig,
  SubagentResult,
} from './subagent-types.js'
import { DEFAULT_SUBAGENT_CONFIG } from './subagent-types.js'
import type { RunAttemptParams, RunAttemptResult } from './runner.js'
import type { ToolRegistry } from '../tools/index.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/** 运行中子 Agent 的元数据 */
interface LiveSubagent {
  taskId: string
  sessionKey: string
  parentSessionKey: string
  abortController: AbortController
  resultPromise: Promise<RunAttemptResult | null>
}

export type RunAttemptFn = (params: RunAttemptParams) => Promise<RunAttemptResult>

export interface SubagentManagerDeps {
  taskRegistry: TaskRegistry
  /** runAttempt 函数引用（避免循环 import） */
  runAttempt: RunAttemptFn
  /** 子 Agent 默认继承的参数 */
  defaults?: {
    workspaceDir?: string
    toolRegistry?: ToolRegistry
    skills?: RunAttemptParams['skills']
    beforeToolCall?: RunAttemptParams['beforeToolCall']
    contextEngine?: RunAttemptParams['contextEngine']
  }
  /** N2: 可配置限制参数 */
  config?: Partial<SubagentManagerConfig>
}

// ─── SubagentManager ────────────────────────────────────────────────────────

export class SubagentManager {
  private deps: SubagentManagerDeps
  private liveAgents = new Map<string, LiveSubagent>()
  private readonly config: SubagentManagerConfig

  constructor(deps: SubagentManagerDeps) {
    this.deps = deps
    this.config = { ...DEFAULT_SUBAGENT_CONFIG, ...deps.config }
  }

  // ─── spawn ──────────────────────────────────────────────────────────────

  async spawn(
    parentSessionKey: string,
    params: SpawnSubagentParams,
    opts?: { depth?: number; onComplete?: (result: SubagentResult) => void },
  ): Promise<SubagentResult> {
    const depth = opts?.depth ?? 0

    // N2: 可配置深度限制（替代 V1 的 depth>=1 硬限）
    if (depth >= this.config.maxDepth) {
      return {
        taskId: '',
        success: false,
        summary: `超过最大嵌套深度限制 (depth=${depth}, maxDepth=${this.config.maxDepth})`,
      }
    }

    // N2: 全局子 Agent 数量限制
    if (this.liveAgents.size >= this.config.maxTotalAgents) {
      return {
        taskId: '',
        success: false,
        summary: `达到全局子Agent上限 (${this.config.maxTotalAgents})`,
      }
    }

    const registry = this.deps.taskRegistry

    // 注册任务
    const task = registry.register({
      runtime: 'subagent',
      title: params.goal ?? params.prompt.slice(0, 80),
      parentSessionKey,
      notificationPolicy: 'state_changes',
      timeoutMs: params.timeoutMs,
    })

    const childSessionKey = `${parentSessionKey}::sub::${task.id}`
    const abortController = new AbortController()
    const steeringQueue = registry.getSteeringQueue(task.id)

    // 迁移到 running
    registry.transition(task.id, 'running')

    // 启动子 runAttempt（非阻塞）
    const resultPromise = this.executeChild(task.id, childSessionKey, params, abortController, steeringQueue)

    // 注册到 live agents
    this.liveAgents.set(task.id, {
      taskId: task.id,
      sessionKey: childSessionKey,
      parentSessionKey,
      abortController,
      resultPromise,
    })

    // 等待子任务完成
    const result = await resultPromise
    this.liveAgents.delete(task.id)

    const taskRecord = registry.get(task.id)
    const summary = taskRecord?.summary ?? result?.text?.slice(0, 500) ?? '子任务无输出'

    const subagentResult: SubagentResult = {
      taskId: task.id,
      success: taskRecord?.state === 'succeeded',
      summary,
    }

    // N2: onComplete 回调
    opts?.onComplete?.(subagentResult)

    return subagentResult
  }

  // ─── spawnParallel (N2.2.1) ───────────────────────────────────────────

  /**
   * 并行启动多个子 Agent。
   * - 使用 Promise.allSettled 确保不因单个失败而全部中断
   * - 内部维护并发信号量
   * - 每个子 Agent 完成后立即触发 onComplete
   * - 返回所有结果（顺序与 items 一致）
   */
  async spawnParallel(
    parentSessionKey: string,
    items: ParallelSpawnItem[],
    opts?: { depth?: number; maxConcurrent?: number },
  ): Promise<SubagentResult[]> {
    if (items.length === 0) return []

    const depth = opts?.depth ?? 0
    const maxConcurrent = opts?.maxConcurrent ?? this.config.maxConcurrent
    const results: SubagentResult[] = new Array(items.length)

    // 并发信号量
    let running = 0
    let nextIndex = 0
    const waitQueue: Array<() => void> = []

    const acquireSemaphore = (): Promise<void> => {
      if (running < maxConcurrent) {
        running++
        return Promise.resolve()
      }
      return new Promise<void>(resolve => waitQueue.push(resolve))
    }

    const releaseSemaphore = (): void => {
      running--
      const next = waitQueue.shift()
      if (next) {
        running++
        next()
      }
    }

    // 创建所有任务的 promise
    const promises = items.map(async (item, index) => {
      await acquireSemaphore()

      try {
        const result = await this.spawn(parentSessionKey, item.params, {
          depth,
          onComplete: item.onComplete,
        })
        results[index] = result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const failResult: SubagentResult = {
          taskId: '',
          success: false,
          summary: msg,
        }
        results[index] = failResult
        item.onComplete?.(failResult)
      } finally {
        releaseSemaphore()
      }
    })

    await Promise.allSettled(promises)

    return results
  }

  // ─── executeChild (内部) ──────────────────────────────────────────────

  private async executeChild(
    taskId: string,
    childSessionKey: string,
    params: SpawnSubagentParams,
    abortController: AbortController,
    steeringQueue: string[],
  ): Promise<RunAttemptResult | null> {
    const registry = this.deps.taskRegistry

    try {
      // 设置超时
      let timer: ReturnType<typeof setTimeout> | undefined
      if (params.timeoutMs) {
        timer = setTimeout(() => {
          abortController.abort()
          try {
            registry.transition(taskId, 'timed_out', `超时 ${params.timeoutMs}ms`)
          } catch { /* 可能已处于终止态 */ }
        }, params.timeoutMs)
      }

      const result = await this.deps.runAttempt({
        sessionKey: childSessionKey,
        userMessage: params.prompt,
        abortSignal: abortController.signal,
        toolRegistry: this.deps.defaults?.toolRegistry,
        allowedTools: params.allowedTools,
        steeringQueue,
        workspaceDir: this.deps.defaults?.workspaceDir,
        skills: this.deps.defaults?.skills,
        beforeToolCall: this.deps.defaults?.beforeToolCall,
        contextEngine: this.deps.defaults?.contextEngine,
      })

      if (timer) clearTimeout(timer)

      // 检查是否已被 cancel/timeout 迁移
      const current = registry.get(taskId)
      if (current && current.state === 'running') {
        registry.transition(taskId, 'succeeded', result.text.slice(0, 500))
      }

      return result
    } catch (err) {
      const current = registry.get(taskId)
      if (current && current.state === 'running') {
        const msg = err instanceof Error ? err.message : String(err)
        // AbortError 可能是 cancel 或 timeout 导致
        if (err instanceof Error && err.name === 'AbortError') {
          if (current.state === 'running') {
            registry.transition(taskId, 'cancelled', msg)
          }
        } else {
          registry.transition(taskId, 'failed', msg)
        }
      }
      return null
    }
  }

  // ─── list ─────────────────────────────────────────────────────────────

  list(parentSessionKey: string): SubagentInfo[] {
    return this.deps.taskRegistry
      .list({ parentTaskId: undefined })
      .filter(t => {
        const full = this.deps.taskRegistry.get(t.id)
        return full?.parentSessionKey === parentSessionKey
      })
      .map(t => {
        const live = this.liveAgents.get(t.id)
        return {
          taskId: t.id,
          title: t.title,
          state: t.state,
          sessionKey: live?.sessionKey ?? `${parentSessionKey}::sub::${t.id}`,
          createdAt: t.createdAt,
        }
      })
  }

  // ─── steer ────────────────────────────────────────────────────────────

  steer(taskId: string, message: string): void {
    this.deps.taskRegistry.steer(taskId, message)
  }

  // ─── kill (N2.3.1: cascade 支持) ─────────────────────────────────────

  kill(taskId: string, opts?: { cascade?: boolean }): void {
    if (opts?.cascade) {
      // 递归终止所有后代（深度优先：先终止最深层）
      const children = this._findChildTasks(taskId)
      for (const childId of children) {
        this.kill(childId, { cascade: true })
      }
    }

    // 终止当前任务
    const live = this.liveAgents.get(taskId)
    if (live) {
      live.abortController.abort()
    }
    // cancel 会在 executeChild 的 catch 中处理状态迁移
    // 但如果任务仍然 running，直接迁移
    const task = this.deps.taskRegistry.get(taskId)
    if (task && task.state === 'running') {
      this.deps.taskRegistry.cancel(taskId)
    }
  }

  /**
   * 查找某个 taskId 的直接子任务。
   * 通过 TaskRegistry.list 过滤 parentTaskId。
   */
  private _findChildTasks(parentTaskId: string): string[] {
    return this.deps.taskRegistry
      .list({ parentTaskId })
      .map(t => t.id)
  }

  // ─── 工具方法 ─────────────────────────────────────────────────────────

  get activeCount(): number {
    return this.liveAgents.size
  }

  /** N2: 暴露配置（只读） */
  get managerConfig(): Readonly<SubagentManagerConfig> {
    return this.config
  }
}