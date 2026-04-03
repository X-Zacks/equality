/**
 * agent/subagent-manager.ts — 子 Agent 管理器
 *
 * Phase E3 (GAP-8): spawn / list / steer / kill 子 Agent
 *
 * 核心设计：
 * - 每个子 Agent 运行在独立 child session 中
 * - 所有子任务注册到统一 TaskRegistry
 * - V1 仅允许单层（depth=1），禁止孙子 Agent
 */

import type { TaskRegistry } from '../tasks/index.js'
import type { SpawnSubagentParams, SubagentInfo, SubagentResult } from './subagent-types.js'
import type { RunAttemptParams, RunAttemptResult } from './runner.js'

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
    skills?: RunAttemptParams['skills']
    beforeToolCall?: RunAttemptParams['beforeToolCall']
    contextEngine?: RunAttemptParams['contextEngine']
  }
}

// ─── SubagentManager ────────────────────────────────────────────────────────

export class SubagentManager {
  private deps: SubagentManagerDeps
  private liveAgents = new Map<string, LiveSubagent>()

  constructor(deps: SubagentManagerDeps) {
    this.deps = deps
  }

  // ─── spawn ──────────────────────────────────────────────────────────────

  async spawn(
    parentSessionKey: string,
    params: SpawnSubagentParams,
    opts?: { depth?: number },
  ): Promise<SubagentResult> {
    const depth = opts?.depth ?? 0

    // V1: 仅允许 depth=1
    if (depth >= 1) {
      return {
        taskId: '',
        success: false,
        summary: '暂不支持多层子 Agent（当前限制 depth=1）',
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

    return {
      taskId: task.id,
      success: taskRecord?.state === 'succeeded',
      summary,
    }
  }

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

  // ─── kill ─────────────────────────────────────────────────────────────

  kill(taskId: string): void {
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

  // ─── 工具方法 ─────────────────────────────────────────────────────────

  get activeCount(): number {
    return this.liveAgents.size
  }
}
