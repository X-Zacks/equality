/**
 * tasks/types.ts — 任务注册中心核心类型
 *
 * Phase E1 (GAP-9): TaskRecord / TaskState / TaskRuntime
 */

// ─── 任务运行时来源 ──────────────────────────────────────────────────────────

export type TaskRuntime = 'manual' | 'cron' | 'subagent'

// ─── 任务状态 ────────────────────────────────────────────────────────────────

export type TaskState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'lost'

// ─── 通知策略 ────────────────────────────────────────────────────────────────

export type TaskNotificationPolicy = 'done_only' | 'state_changes' | 'silent'

// ─── 任务记录 ────────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string
  runtime: TaskRuntime
  state: TaskState
  title: string
  sessionKey?: string
  parentTaskId?: string
  parentSessionKey?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  timeoutMs?: number
  notificationPolicy: TaskNotificationPolicy
  lastError?: string
  summary?: string
  metadata?: Record<string, unknown>
}

// ─── 任务摘要（list 返回的轻量对象）────────────────────────────────────────

export interface TaskSummary {
  id: string
  runtime: TaskRuntime
  state: TaskState
  title: string
  createdAt: number
}

// ─── 任务事件 ────────────────────────────────────────────────────────────────

export type TaskEventType = 'state_changed' | 'finished' | 'cancelled' | 'steer'

export interface TaskEvent {
  type: TaskEventType
  taskId: string
  state: TaskState
  runtime: TaskRuntime
  timestamp: number
  detail?: string
}

// ─── 状态迁移表（合法迁移白名单）────────────────────────────────────────────

/**
 * 合法迁移：
 *   queued   → running
 *   running  → succeeded | failed | timed_out | cancelled
 *   running  → lost  (仅限启动恢复阶段)
 *
 * 其他迁移一律非法（如 succeeded → running）
 */
export const VALID_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  queued: ['running'],
  running: ['succeeded', 'failed', 'timed_out', 'cancelled', 'lost'],
  succeeded: [],
  failed: [],
  timed_out: [],
  cancelled: [],
  lost: [],
}

/** 终止态（不可再迁移） */
export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
  'lost',
])

// ─── 任务注册参数 ────────────────────────────────────────────────────────────

export interface RegisterTaskParams {
  runtime: TaskRuntime
  title: string
  sessionKey?: string
  parentTaskId?: string
  parentSessionKey?: string
  timeoutMs?: number
  notificationPolicy?: TaskNotificationPolicy
  metadata?: Record<string, unknown>
}
