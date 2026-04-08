/**
 * orchestration/plan-executor.ts — Plan DAG 执行器
 *
 * Phase N1 (N1.3.1): 调度循环、暂停/恢复、取消、重试、跳过、steer、进度查询
 *
 * 设计要点:
 * - 通过 NodeSpawner 接口与 SubagentManager 解耦
 * - 事件驱动的调度循环（非轮询）
 * - 支持暂停/恢复、取消、重试、跳过
 * - 节点超时 + 全局超时
 * - 进度回调
 */

import { PlanDAG } from './plan-dag.js'
import type {
  PlanExecutionResult,
  PlanExecutionStatus,
  PlanGraph,
  PlanNode,
  PlanProgress,
} from './plan-types.js'
import { PLAN_TERMINAL_STATUSES } from './plan-types.js'
import { HistoryLog } from './history-log.js'

// ─── NodeSpawner 接口 ─────────────────────────────────────────────────────────

/**
 * 节点执行器抽象接口。
 * PlanExecutor 通过这个接口与实际的 SubagentManager 解耦。
 * 测试时可提供 mock 实现。
 */
export interface NodeSpawner {
  /**
   * 启动一个节点的执行。
   * 返回一个 Promise，resolve 时节点执行完成。
   * @param node 要执行的 PlanNode
   * @param abortSignal 取消信号
   * @returns { success: boolean; summary: string; taskId?: string }
   */
  spawn(
    node: PlanNode,
    abortSignal: AbortSignal,
  ): Promise<NodeSpawnResult>

  /**
   * 向正在运行的节点注入消息（steer）。
   * @param taskId 任务 ID
   * @param message 消息内容
   */
  steer(taskId: string, message: string): void

  /**
   * 终止运行中的节点。
   * @param taskId 任务 ID
   */
  kill(taskId: string): void
}

export interface NodeSpawnResult {
  success: boolean
  summary: string
  taskId?: string
}

// ─── Executor 配置 ────────────────────────────────────────────────────────────

export interface PlanExecutorConfig {
  /** 节点执行器 */
  spawner: NodeSpawner
  /** 进度回调 */
  onProgress?: (progress: PlanProgress) => void
  /** 单个节点完成回调 */
  onNodeComplete?: (nodeId: string, success: boolean, summary: string) => void
}

// ─── Executor 状态 ────────────────────────────────────────────────────────────

type ExecutorState = 'idle' | 'running' | 'paused' | 'cancelled' | 'completed'

interface RunningNodeInfo {
  nodeId: string
  taskId?: string
  abortController: AbortController
  promise: Promise<void>
  timeoutTimer?: ReturnType<typeof setTimeout>
}

// ─── PlanExecutor 类 ──────────────────────────────────────────────────────────

export class PlanExecutor {
  private readonly _config: PlanExecutorConfig
  private _dag: PlanDAG | null = null
  private _state: ExecutorState = 'idle'
  private _runningNodes = new Map<string, RunningNodeInfo>()
  private _history = new HistoryLog()
  private _cancelReason?: string

  /** resolve 函数，用于唤醒调度循环 */
  private _wakeup: (() => void) | null = null

  /** 全局超时计时器 */
  private _globalTimer?: ReturnType<typeof setTimeout>

  /** 执行开始时间 */
  private _startTime = 0

  constructor(config: PlanExecutorConfig) {
    this._config = config
  }

  // ─── 主执行 ───────────────────────────────────────────────────────────────

  /**
   * 执行一个 Plan。
   * 阻塞直到 Plan 完成/失败/取消/超时。
   * 同一时间只能执行一个 Plan。
   */
  async execute(plan: PlanGraph): Promise<PlanExecutionResult> {
    if (this._state === 'running' || this._state === 'paused') {
      throw new Error('PlanExecutor is already running')
    }

    this._dag = new PlanDAG(plan)
    this._state = 'running'
    this._history = new HistoryLog()
    this._runningNodes.clear()
    this._cancelReason = undefined
    this._startTime = Date.now()

    this._history.add('Plan started', `Plan "${plan.title}" with ${plan.nodes.length} nodes`)

    // 空 Plan 直接返回
    if (plan.nodes.length === 0) {
      this._state = 'completed'
      return this._buildResult('completed')
    }

    // 验证 DAG
    const validation = this._dag.validate()
    if (!validation.valid) {
      this._state = 'completed'
      this._history.add('Validation failed', validation.errors.join('; '))
      return this._buildResult('failed')
    }

    // 标记初始就绪节点
    this._refreshReadyNodes()

    // 设置全局超时
    if (plan.globalTimeoutMs > 0) {
      this._globalTimer = setTimeout(() => {
        this._handleGlobalTimeout()
      }, plan.globalTimeoutMs)
    }

    // 调度循环
    try {
      await this._schedulingLoop()
    } finally {
      if (this._globalTimer) {
        clearTimeout(this._globalTimer)
        this._globalTimer = undefined
      }
    }

    return this._buildResult(this._computeFinalStatus())
  }

  // ─── 调度循环 ─────────────────────────────────────────────────────────────

  private async _schedulingLoop(): Promise<void> {
    while (true) {
      // 检查终止条件
      if (this._state === 'cancelled') break
      if (this._dag!.isTerminated()) break
      if (this._dag!.isStuck()) {
        this._history.add('Stuck detected', 'No ready nodes and no running nodes')
        break
      }

      // 暂停时等待唤醒
      if (this._state === 'paused') {
        await this._waitForWakeup()
        continue
      }

      // 调度就绪节点
      const running = this._runningNodes.size
      const schedulable = this._dag!.getSchedulableNodes(running, this._dag!.graph.maxConcurrent)

      for (const node of schedulable) {
        this._launchNode(node)
      }

      // 如果有运行中节点，等待任意一个完成
      if (this._runningNodes.size > 0) {
        await this._waitForAnyCompletion()
      } else if (schedulable.length === 0) {
        // 无运行节点也无可调度节点 —— 终止
        break
      }
    }
  }

  // ─── 节点启动 ─────────────────────────────────────────────────────────────

  private _launchNode(node: PlanNode): void {
    const abortController = new AbortController()

    // 更新状态
    this._dag!.updateNodeStatus(node.id, 'running')
    this._emitProgress(node.id, 'running')
    this._history.add('Node started', `Node "${node.id}" [${node.role}]: ${node.task}`, {
      nodeId: node.id,
      role: node.role,
    })

    // 设置节点超时
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined
    if (node.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        this._handleNodeTimeout(node.id)
      }, node.timeoutMs)
    }

    // 启动 spawn
    const promise = this._config.spawner
      .spawn(node, abortController.signal)
      .then(result => {
        this._handleNodeComplete(node.id, result)
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err)
        this._handleNodeComplete(node.id, { success: false, summary: msg })
      })

    this._runningNodes.set(node.id, {
      nodeId: node.id,
      abortController,
      promise,
      timeoutTimer,
    })
  }

  // ─── 节点完成处理 ─────────────────────────────────────────────────────────

  private _handleNodeComplete(nodeId: string, result: NodeSpawnResult): void {
    const info = this._runningNodes.get(nodeId)
    if (info?.timeoutTimer) clearTimeout(info.timeoutTimer)
    this._runningNodes.delete(nodeId)

    const node = this._dag?.getNode(nodeId)
    if (!node) return

    // 如果已经是终止态（例如被 cancel 或 timeout 设置过），跳过
    if (PLAN_TERMINAL_STATUSES.has(node.status)) return

    if (result.success) {
      this._dag!.updateNodeStatus(nodeId, 'completed')
      node.output = result.summary
      node.assignedTaskId = result.taskId
      this._history.add('Node completed', `Node "${nodeId}" succeeded: ${result.summary.slice(0, 200)}`, {
        nodeId,
        role: node.role,
      })
      this._config.onNodeComplete?.(nodeId, true, result.summary)
    } else {
      // 检查是否可以重试
      if (node.retryCount < node.maxRetries) {
        node.retryCount++
        this._dag!.updateNodeStatus(nodeId, 'pending') // 重置为 pending 以便再次调度
        this._history.add(
          'Node retry',
          `Node "${nodeId}" failed, retrying (${node.retryCount}/${node.maxRetries}): ${result.summary.slice(0, 200)}`,
          { nodeId, role: node.role },
        )
      } else {
        this._dag!.updateNodeStatus(nodeId, 'exhausted')
        node.output = result.summary
        this._history.add(
          'Node exhausted',
          `Node "${nodeId}" exhausted after ${node.retryCount} retries: ${result.summary.slice(0, 200)}`,
          { nodeId, role: node.role },
        )
        this._config.onNodeComplete?.(nodeId, false, result.summary)
      }
    }

    // 刷新就绪节点状态
    this._refreshReadyNodes()

    // 发送进度
    this._emitProgress(nodeId, node.status)

    // 唤醒调度循环
    this._wakeupLoop()
  }

  // ─── 超时处理 ─────────────────────────────────────────────────────────────

  private _handleNodeTimeout(nodeId: string): void {
    const info = this._runningNodes.get(nodeId)
    if (!info) return

    info.abortController.abort()
    // 不直接 delete — 让 spawn promise 的 catch 处理
    // 但先设置状态为 failed（可重试）
    const node = this._dag?.getNode(nodeId)
    if (node && node.status === 'running') {
      this._dag!.updateNodeStatus(nodeId, 'failed')
      this._history.add(
        'Node timeout',
        `Node "${nodeId}" timed out after ${node.timeoutMs}ms`,
        { nodeId, role: node.role },
      )
    }
  }

  private _handleGlobalTimeout(): void {
    this._history.add('Global timeout', `Plan timed out after ${this._dag!.graph.globalTimeoutMs}ms`)

    // abort 所有运行中节点
    for (const [, info] of this._runningNodes) {
      info.abortController.abort()
      if (info.timeoutTimer) clearTimeout(info.timeoutTimer)
    }

    // 取消所有 pending 节点
    this._dag!.cancelAllPending()

    // 标记运行中节点为 failed
    for (const [nodeId] of this._runningNodes) {
      const node = this._dag?.getNode(nodeId)
      if (node && node.status === 'running') {
        this._dag!.updateNodeStatus(nodeId, 'failed')
      }
    }

    this._state = 'cancelled'
    this._cancelReason = 'global_timeout'
    this._wakeupLoop()
  }

  // ─── 控制操作 ─────────────────────────────────────────────────────────────

  /**
   * 暂停调度。运行中的节点会继续直到完成，但不会调度新节点。
   */
  pause(): void {
    if (this._state === 'running') {
      this._state = 'paused'
      this._history.add('Paused', 'Plan execution paused')
    }
  }

  /**
   * 恢复调度。
   */
  resume(): void {
    if (this._state === 'paused') {
      this._state = 'running'
      this._history.add('Resumed', 'Plan execution resumed')
      this._wakeupLoop()
    }
  }

  /**
   * 取消整个 Plan。
   * abort 所有运行中节点，cancel 所有 pending 节点。
   */
  cancel(reason?: string): void {
    if (this._state !== 'running' && this._state !== 'paused') return

    this._cancelReason = reason ?? 'user_cancelled'
    this._history.add('Cancelled', `Plan cancelled: ${this._cancelReason}`)

    // abort 运行中节点
    for (const [nodeId, info] of this._runningNodes) {
      info.abortController.abort()
      if (info.timeoutTimer) clearTimeout(info.timeoutTimer)
      const node = this._dag?.getNode(nodeId)
      if (node && node.status === 'running') {
        this._dag!.updateNodeStatus(nodeId, 'cancelled')
      }
    }

    // cancel 所有非终止态节点
    this._dag!.cancelAllPending()

    this._state = 'cancelled'
    this._wakeupLoop()
  }

  /**
   * 重试一个失败/耗尽的节点。
   * 将状态重置为 pending，retryCount 不重置。
   */
  retryFailed(nodeId: string): boolean {
    const node = this._dag?.getNode(nodeId)
    if (!node) return false
    if (node.status !== 'failed' && node.status !== 'exhausted') return false

    node.maxRetries = node.retryCount + 1 // 允许再试一次
    this._dag!.updateNodeStatus(nodeId, 'pending')
    this._refreshReadyNodes()
    this._history.add('Retry requested', `Node "${nodeId}" reset to pending for retry`, { nodeId })
    this._wakeupLoop()
    return true
  }

  /**
   * 跳过一个节点。下游节点可以继续。
   */
  skipNode(nodeId: string): boolean {
    const node = this._dag?.getNode(nodeId)
    if (!node) return false
    if (PLAN_TERMINAL_STATUSES.has(node.status)) return false
    if (node.status === 'running') {
      // 先 kill 运行中的
      const info = this._runningNodes.get(nodeId)
      if (info) {
        info.abortController.abort()
        if (info.timeoutTimer) clearTimeout(info.timeoutTimer)
        this._runningNodes.delete(nodeId)
      }
    }

    this._dag!.updateNodeStatus(nodeId, 'skipped')
    this._refreshReadyNodes()
    this._emitProgress(nodeId, 'skipped')
    this._history.add('Node skipped', `Node "${nodeId}" skipped`, { nodeId })
    this._wakeupLoop()
    return true
  }

  /**
   * 向运行中的节点注入 steer 消息。
   */
  steerNode(nodeId: string, message: string): boolean {
    const info = this._runningNodes.get(nodeId)
    if (!info || !info.taskId) return false
    this._config.spawner.steer(info.taskId, message)
    this._history.add('Node steered', `Steer message sent to "${nodeId}": ${message.slice(0, 100)}`, { nodeId })
    return true
  }

  // ─── 查询 ─────────────────────────────────────────────────────────────────

  /** 当前 executor 状态 */
  get state(): ExecutorState {
    return this._state
  }

  /** 执行历史日志 */
  get history(): HistoryLog {
    return this._history
  }

  /** DAG 引用 */
  get dag(): PlanDAG | null {
    return this._dag
  }

  /** 运行中节点数 */
  get runningCount(): number {
    return this._runningNodes.size
  }

  // ─── 内部辅助 ─────────────────────────────────────────────────────────────

  /** 刷新 pending → ready 状态 */
  private _refreshReadyNodes(): void {
    if (!this._dag) return
    const ready = this._dag.getReadyNodes()
    for (const node of ready) {
      if (node.status === 'pending') {
        // 保持 pending，getReadyNodes 已经保证条件满足
        // ready 状态在 spec 中定义但实际由 getReadyNodes 隐式表达
        // 我们不修改为 'ready'，因为调度循环直接从 getReadyNodes 读取
      }
    }
  }

  /** 等待任意运行中节点完成 */
  private async _waitForAnyCompletion(): Promise<void> {
    const promises = [...this._runningNodes.values()].map(info => info.promise)
    if (promises.length === 0) return

    // 同时监听唤醒信号（pause/resume/cancel 时触发）
    const wakeupPromise = new Promise<void>(resolve => {
      this._wakeup = resolve
    })

    await Promise.race([
      Promise.race(promises),
      wakeupPromise,
    ])
  }

  /** 等待唤醒（pause 状态时） */
  private async _waitForWakeup(): Promise<void> {
    // 即使 paused，也要等待运行中节点完成
    const runningPromises = [...this._runningNodes.values()].map(info => info.promise)
    const wakeupPromise = new Promise<void>(resolve => {
      this._wakeup = resolve
    })

    if (runningPromises.length > 0) {
      await Promise.race([...runningPromises, wakeupPromise])
    } else {
      await wakeupPromise
    }
  }

  /** 唤醒调度循环 */
  private _wakeupLoop(): void {
    if (this._wakeup) {
      const fn = this._wakeup
      this._wakeup = null
      fn()
    }
  }

  /** 发送进度回调 */
  private _emitProgress(changedNodeId: string, changedNodeStatus: string): void {
    if (!this._config.onProgress || !this._dag) return

    const graph = this._dag.graph
    const completedNodes = graph.nodes.filter(
      n => n.status === 'completed' || n.status === 'skipped',
    ).length
    const runningNodes = graph.nodes
      .filter(n => n.status === 'running')
      .map(n => n.id)
    const failedNodes = graph.nodes
      .filter(n => n.status === 'failed' || n.status === 'exhausted')
      .map(n => n.id)

    this._config.onProgress({
      planId: graph.id,
      completedNodes,
      totalNodes: graph.nodes.length,
      runningNodes,
      failedNodes,
      changedNodeId,
      changedNodeStatus: changedNodeStatus as any,
    })
  }

  /** 计算最终执行状态 */
  private _computeFinalStatus(): PlanExecutionStatus {
    if (this._cancelReason === 'global_timeout') return 'timed_out'
    if (this._state === 'cancelled') return 'cancelled'

    const graph = this._dag!.graph
    const allDone = graph.nodes.every(
      n => n.status === 'completed' || n.status === 'skipped',
    )
    if (allDone) return 'completed'

    const anyCompleted = graph.nodes.some(
      n => n.status === 'completed' || n.status === 'skipped',
    )
    if (anyCompleted) return 'partial'

    return 'failed'
  }

  /** 构建执行结果 */
  private _buildResult(status: PlanExecutionStatus): PlanExecutionResult {
    const graph = this._dag?.graph
    const nodes = graph?.nodes ?? []
    const completedNodes = nodes.filter(
      n => n.status === 'completed' || n.status === 'skipped',
    ).length
    const failedNodes = nodes
      .filter(n => n.status === 'failed' || n.status === 'exhausted')
      .map(n => n.id)
    const durationMs = Date.now() - this._startTime

    const summary = `Plan "${graph?.title ?? 'unknown'}": ${status}. ` +
      `${completedNodes}/${nodes.length} nodes completed, ` +
      `${failedNodes.length} failed, ` +
      `${durationMs}ms elapsed.`

    this._state = 'completed'

    return {
      planId: graph?.id ?? '',
      status,
      completedNodes,
      totalNodes: nodes.length,
      failedNodes,
      durationMs,
      summary,
    }
  }
}
