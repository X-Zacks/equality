/**
 * tasks/registry.ts — 任务注册中心
 *
 * Phase E1 (GAP-9): 注册、状态迁移、取消、steer、事件分发
 */

import { randomUUID } from 'node:crypto'
import type {
  TaskRecord,
  TaskState,
  TaskSummary,
  TaskEvent,
  RegisterTaskParams,
} from './types.js'
import { VALID_TRANSITIONS, TERMINAL_STATES } from './types.js'
import { TaskEventBus } from './events.js'
import type { TaskStore } from './store.js'

// ─── Steering 队列（运行时状态，不持久化）──────────────────────────────────

/** taskId → steering message queue */
const steeringQueues = new Map<string, string[]>()

// ─── TaskRegistry ────────────────────────────────────────────────────────────

export class TaskRegistry {
  private tasks = new Map<string, TaskRecord>()
  readonly events = new TaskEventBus()
  private store: TaskStore | undefined
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushDebounceMs: number

  constructor(opts?: { store?: TaskStore; flushDebounceMs?: number }) {
    this.store = opts?.store
    this.flushDebounceMs = opts?.flushDebounceMs ?? 200
  }

  // ─── 注册 ─────────────────────────────────────────────────────────────────

  register(params: RegisterTaskParams): TaskRecord {
    const id = randomUUID()
    const now = Date.now()
    const task: TaskRecord = {
      id,
      runtime: params.runtime,
      state: 'queued',
      title: params.title,
      sessionKey: params.sessionKey,
      parentTaskId: params.parentTaskId,
      parentSessionKey: params.parentSessionKey,
      createdAt: now,
      timeoutMs: params.timeoutMs,
      notificationPolicy: params.notificationPolicy ?? 'done_only',
      metadata: params.metadata,
    }
    this.tasks.set(id, task)

    this.emitEvent(task, 'state_changed')
    this.schedulePersist()
    return task
  }

  // ─── 状态迁移 ─────────────────────────────────────────────────────────────

  transition(taskId: string, newState: TaskState, detail?: string): TaskRecord {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    const allowed = VALID_TRANSITIONS[task.state]
    if (!allowed.includes(newState)) {
      console.warn(
        `[TaskRegistry] 非法状态迁移被拒绝: ${task.state} → ${newState} (task=${taskId})`,
      )
      throw new Error(
        `Invalid transition: ${task.state} → ${newState}`,
      )
    }

    const now = Date.now()
    task.state = newState

    if (newState === 'running' && !task.startedAt) {
      task.startedAt = now
    }
    if (TERMINAL_STATES.has(newState)) {
      task.finishedAt = now
    }
    if (detail) {
      if (newState === 'failed' || newState === 'timed_out') {
        task.lastError = detail
      } else {
        task.summary = detail
      }
    }

    // 确定事件类型
    let eventType: TaskEvent['type'] = 'state_changed'
    if (newState === 'cancelled') eventType = 'cancelled'
    if (TERMINAL_STATES.has(newState) && newState !== 'cancelled') eventType = 'finished'

    this.emitEvent(task, eventType, detail)
    this.schedulePersist()

    // 清理终止态任务的 steering queue
    if (TERMINAL_STATES.has(newState)) {
      steeringQueues.delete(taskId)
    }

    return task
  }

  // ─── 查询 ─────────────────────────────────────────────────────────────────

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId)
  }

  list(filter?: { sessionKey?: string; runtime?: string; parentTaskId?: string }): TaskSummary[] {
    const result: TaskSummary[] = []
    for (const task of this.tasks.values()) {
      if (filter?.sessionKey && task.sessionKey !== filter.sessionKey) continue
      if (filter?.runtime && task.runtime !== filter.runtime) continue
      if (filter?.parentTaskId && task.parentTaskId !== filter.parentTaskId) continue
      result.push({
        id: task.id,
        runtime: task.runtime,
        state: task.state,
        title: task.title,
        createdAt: task.createdAt,
      })
    }
    return result.sort((a, b) => b.createdAt - a.createdAt)
  }

  // ─── 控制面 ───────────────────────────────────────────────────────────────

  cancel(taskId: string): TaskRecord {
    return this.transition(taskId, 'cancelled')
  }

  /**
   * 向运行中任务注入 steering 消息。
   * 返回任务的 steering queue 引用（供 runAttempt 消费）。
   */
  steer(taskId: string, message: string): void {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    if (TERMINAL_STATES.has(task.state)) {
      throw new Error(`Cannot steer a ${task.state} task`)
    }

    let queue = steeringQueues.get(taskId)
    if (!queue) {
      queue = []
      steeringQueues.set(taskId, queue)
    }
    queue.push(message)

    this.emitEvent(task, 'steer', message)
  }

  /**
   * 获取任务的 steering queue 引用（供 runner 绑定）。
   * 每个 task 有自己独立的队列。
   */
  getSteeringQueue(taskId: string): string[] {
    let queue = steeringQueues.get(taskId)
    if (!queue) {
      queue = []
      steeringQueues.set(taskId, queue)
    }
    return queue
  }

  // ─── 启动恢复 ─────────────────────────────────────────────────────────────

  /**
   * 从持久化快照恢复任务。
   * 仍处于 running 状态的任务标记为 lost。
   */
  async restore(): Promise<number> {
    if (!this.store) return 0

    const records = await this.store.load()
    let lostCount = 0

    for (const record of records) {
      // 恢复到内存
      this.tasks.set(record.id, record)

      // running → lost（进程异常中断）
      if (record.state === 'running') {
        record.state = 'lost'
        record.finishedAt = Date.now()
        lostCount++
      }
    }

    if (lostCount > 0) {
      console.log(`[TaskRegistry] 恢复 ${records.length} 个任务, ${lostCount} 个标记为 lost`)
      this.schedulePersist()
    } else if (records.length > 0) {
      console.log(`[TaskRegistry] 恢复 ${records.length} 个任务`)
    }

    return records.length
  }

  // ─── 持久化 ───────────────────────────────────────────────────────────────

  /** 立即刷盘（用于关闭时） */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.store) {
      const records = [...this.tasks.values()]
      await this.store.save(records)
    }
  }

  private schedulePersist(): void {
    if (!this.store) return
    if (this.flushTimer) return // 已有待执行的 debounce
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null
      try {
        const records = [...this.tasks.values()]
        await this.store!.save(records)
      } catch (err) {
        console.warn('[TaskRegistry] 持久化失败:', err)
      }
    }, this.flushDebounceMs)
  }

  // ─── 事件 ─────────────────────────────────────────────────────────────────

  private emitEvent(
    task: TaskRecord,
    type: TaskEvent['type'],
    detail?: string,
  ): void {
    // 静默通知策略：不发 state_changed / finished 事件（steer 仍发）
    if (task.notificationPolicy === 'silent' && type !== 'steer') return
    // done_only 策略：只发终止事件
    if (task.notificationPolicy === 'done_only' && type === 'state_changed') return

    this.events.emit({
      type,
      taskId: task.id,
      state: task.state,
      runtime: task.runtime,
      timestamp: Date.now(),
      detail,
    })
  }

  // ─── 工具方法 ─────────────────────────────────────────────────────────────

  get size(): number {
    return this.tasks.size
  }

  /** 清空（测试用） */
  clear(): void {
    this.tasks.clear()
    steeringQueues.clear()
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }
}
