/**
 * agent/subtask-manager.ts — 子任务 管理器
 *
 * Phase E3 (GAP-8) + Phase N2: spawn / list / steer / kill / spawnParallel / cascade kill
 *
 * 核心设计：
 * - 每个子任务 运行在独立 child session 中
 * - 所有子任务注册到统一 TaskRegistry
 * - N2: 可配置深度限制（maxDepth）、全局上限（maxTotalAgents）、并行 spawn
 */

import type { TaskRegistry } from '../tasks/index.js'
import type {
  ParallelSpawnItem,
  SpawnSubtaskParams,
  SubtaskInfo,
  SubtaskManagerConfig,
  SubtaskResult,
} from './subtask-types.js'
import { DEFAULT_SUBTASK_CONFIG, MAX_SUBTASK_LIFETIME_MS } from './subtask-types.js'
import type { RunAttemptParams, RunAttemptResult } from './runner.js'
import type { ToolRegistry } from '../tools/index.js'
import type { LLMProvider } from '../providers/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/** 运行中子任务 的元数据 */
interface LiveSubtask {
  taskId: string
  sessionKey: string
  parentSessionKey: string
  abortController: AbortController
  resultPromise: Promise<RunAttemptResult | null>
}

export type RunAttemptFn = (params: RunAttemptParams) => Promise<RunAttemptResult>

export interface SubtaskManagerDeps {
  taskRegistry: TaskRegistry
  /** runAttempt 函数引用（避免循环 import） */
  runAttempt: RunAttemptFn
  /** 根据 providerId + modelId 创建 LLMProvider 实例 */
  createProvider?: (providerId: string, modelId: string) => LLMProvider | null
  /** 子任务 默认继承的参数 */
  defaults?: {
    workspaceDir?: string
    sandboxEnabled?: boolean
    toolRegistry?: ToolRegistry
    skills?: RunAttemptParams['skills']
    beforeToolCall?: RunAttemptParams['beforeToolCall']
    contextEngine?: RunAttemptParams['contextEngine']
  }
  /** N2: 可配置限制参数 */
  config?: Partial<SubtaskManagerConfig>
}

// ─── SubtaskManager ────────────────────────────────────────────────────────

export class SubtaskManager {
  private deps: SubtaskManagerDeps
  private liveAgents = new Map<string, LiveSubtask>()
  private readonly config: SubtaskManagerConfig

  private housekeepingTimer?: ReturnType<typeof setInterval>

  constructor(deps: SubtaskManagerDeps) {
    this.deps = deps
    this.config = { ...DEFAULT_SUBTASK_CONFIG, ...deps.config }

    // 安全阀：每 5 分钟清理超过 MAX_SUBTASK_LIFETIME 的僵尸任务
    this.housekeepingTimer = setInterval(() => this.housekeeping(), 5 * 60 * 1000)
  }

  private housekeeping(): void {
    const now = Date.now()
    for (const [taskId, live] of this.liveAgents) {
      const task = this.deps.taskRegistry.get(taskId)
      if (task && (now - task.createdAt) > MAX_SUBTASK_LIFETIME_MS) {
        console.warn(`[SubtaskManager] 安全阀：子任务 ${taskId} 超过 ${MAX_SUBTASK_LIFETIME_MS / 60000} 分钟，强制终止`)
        live.abortController.abort()
        try {
          this.deps.taskRegistry.transition(taskId, 'timed_out', `安全阀: 超过最大存活时间 ${MAX_SUBTASK_LIFETIME_MS / 60000}min`)
        } catch { /* 可能已处于终止态 */ }
      }
    }
  }

  // ─── spawn ──────────────────────────────────────────────────────────────

  async spawn(
    parentSessionKey: string,
    params: SpawnSubtaskParams,
    opts?: { depth?: number; onComplete?: (result: SubtaskResult) => void },
  ): Promise<SubtaskResult> {
    const depth = opts?.depth ?? 0

    // N2: 可配置深度限制（替代 V1 的 depth>=1 硬限）
    if (depth >= this.config.maxDepth) {
      return {
        taskId: '',
        success: false,
        summary: `超过最大嵌套深度限制 (depth=${depth}, maxDepth=${this.config.maxDepth})`,
      }
    }

    // N2: 全局子任务 数量限制
    if (this.liveAgents.size >= this.config.maxTotalAgents) {
      return {
        taskId: '',
        success: false,
        summary: `达到全局子任务上限 (${this.config.maxTotalAgents})`,
      }
    }

    const registry = this.deps.taskRegistry

    // 注册任务
    const task = registry.register({
      runtime: 'subtask',
      title: params.goal ?? params.prompt.slice(0, 80),
      parentSessionKey,
      notificationPolicy: 'state_changes',
      timeoutMs: params.timeoutMs,
    })

    const childSessionKey = `${parentSessionKey}::task::${task.id}`
    const abortController = new AbortController()
    const steeringQueue = registry.getSteeringQueue(task.id)

    // 迁移到 running
    registry.transition(task.id, 'running')

    // 启动子 runAttempt（非阻塞）
    const resultPromise = this.executeChild(task.id, childSessionKey, params, abortController, steeringQueue, parentSessionKey)

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

    const subtaskResult: SubtaskResult = {
      taskId: task.id,
      success: taskRecord?.state === 'succeeded',
      summary,
    }

    // N2: onComplete 回调
    opts?.onComplete?.(subtaskResult)

    return subtaskResult
  }

  // ─── spawnParallel (N2.2.1) ───────────────────────────────────────────

  /**
   * 并行启动多个子任务。
   * - 使用 Promise.allSettled 确保不因单个失败而全部中断
   * - 内部维护并发信号量
   * - 每个子任务 完成后立即触发 onComplete
   * - 返回所有结果（顺序与 items 一致）
   */
  async spawnParallel(
    parentSessionKey: string,
    items: ParallelSpawnItem[],
    opts?: { depth?: number; maxConcurrent?: number },
  ): Promise<SubtaskResult[]> {
    if (items.length === 0) return []

    const depth = opts?.depth ?? 0
    const maxConcurrent = opts?.maxConcurrent ?? this.config.maxConcurrent
    const results: SubtaskResult[] = new Array(items.length)

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
        const failResult: SubtaskResult = {
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
    params: SpawnSubtaskParams,
    abortController: AbortController,
    steeringQueue: string[],
    parentSessionKey?: string,
  ): Promise<RunAttemptResult | null> {
    const registry = this.deps.taskRegistry

    try {
      // 设置超时（0 或 undefined 表示不限制，受全局安全阀保护）
      let timer: ReturnType<typeof setTimeout> | undefined
      if (params.timeoutMs && params.timeoutMs > 0) {
        timer = setTimeout(() => {
          abortController.abort()
          try {
            registry.transition(taskId, 'timed_out', `超时 ${params.timeoutMs}ms`)
          } catch { /* 可能已处于终止态 */ }
        }, params.timeoutMs)
      }

      // 解析父会话的 Provider（继承用户模型选择）
      let parentProvider: LLMProvider | undefined
      if (params.parentProviderInfo && this.deps.createProvider) {
        const p = this.deps.createProvider(params.parentProviderInfo.providerId, params.parentProviderInfo.modelId)
        if (p) parentProvider = p
      }

      // 通过 TaskEventBus 广播子任务 进度事件，让前端实时感知
      const emitProgress = (detail: string) => {
        try {
          registry.events.emit({
            type: 'subtask_progress',
            taskId,
            state: 'running',
            runtime: 'subtask',
            timestamp: Date.now(),
            detail,
            parentSessionKey,
          })
        } catch { /* 事件广播失败不影响子 agent 执行 */ }
      }

      const result = await this.deps.runAttempt({
        sessionKey: childSessionKey,
        userMessage: params.prompt,
        abortSignal: abortController.signal,
        ...(parentProvider ? { provider: parentProvider } : {}),
        toolRegistry: this.deps.defaults?.toolRegistry,
        allowedTools: params.allowedTools,
        steeringQueue,
        workspaceDir: this.deps.defaults?.workspaceDir,
        sandboxEnabled: this.deps.defaults?.sandboxEnabled,
        skills: this.deps.defaults?.skills,
        beforeToolCall: this.deps.defaults?.beforeToolCall,
        contextEngine: this.deps.defaults?.contextEngine,
        onToolStart: (info) => emitProgress(`tool_start:${info.name}`),
        onToolResult: (info) => emitProgress(`tool_done:${info.name}${info.isError ? '(error)' : ''}`),
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

  list(parentSessionKey: string): SubtaskInfo[] {
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
          sessionKey: live?.sessionKey ?? `${parentSessionKey}::task::${t.id}`,
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
  get managerConfig(): Readonly<SubtaskManagerConfig> {
    return this.config
  }
}