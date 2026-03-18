/**
 * cron/types.ts — 定时任务类型定义
 *
 * Phase 4: Cron / Scheduler
 */

// ─── Schedule 类型 ─────────────────────────────────────────────────────────────

/** cron 表达式：如 "0 17 * * *" = 每天 5PM */
export interface CronSchedule {
  kind: 'cron'
  expr: string
}

/** 固定间隔 */
export interface EverySchedule {
  kind: 'every'
  intervalMs: number
}

/** 一次性定时 */
export interface AtSchedule {
  kind: 'at'
  iso: string
}

export type Schedule = CronSchedule | EverySchedule | AtSchedule

// ─── Payload 类型 ──────────────────────────────────────────────────────────────

/** 桌面通知 */
export interface NotifyPayload {
  kind: 'notify'
  title?: string
  text: string
}

/** 注入消息到会话（可触发 AI 回复） */
export interface ChatPayload {
  kind: 'chat'
  message: string
  sessionKey?: string
}

/** 执行完整 agent turn */
export interface AgentPayload {
  kind: 'agent'
  prompt: string
  sessionKey?: string
}

export type Payload = NotifyPayload | ChatPayload | AgentPayload

// ─── CronJob ───────────────────────────────────────────────────────────────────

export interface CronJob {
  id: string
  name: string
  schedule: Schedule
  payload: Payload
  enabled: boolean
  deleteAfterRun: boolean
  createdAt: string
  /** 创建此任务的会话 key（信息性，定时任务本身仍是全局运行） */
  createdBySession?: string
  lastRunAt?: string
  nextRunAt?: string
  runCount: number
}

// ─── 运行日志 ──────────────────────────────────────────────────────────────────

export interface CronRunLog {
  jobId: string
  jobName: string
  ranAt: string
  success: boolean
  resultSummary?: string
  durationMs: number
}

// ─── Scheduler 引用（注入到 ToolContext） ───────────────────────────────────────

export interface CronSchedulerRef {
  addJob(job: Omit<CronJob, 'id' | 'createdAt' | 'runCount' | 'nextRunAt' | 'lastRunAt'>): CronJob
  getJob(id: string): CronJob | undefined
  listJobs(): CronJob[]
  updateJob(id: string, patch: Partial<Pick<CronJob, 'name' | 'schedule' | 'payload' | 'enabled' | 'deleteAfterRun'>>): boolean
  removeJob(id: string): boolean
  runJobNow(id: string): Promise<string>
  getRuns(jobId?: string, limit?: number): CronRunLog[]
}
