/**
 * cron/scheduler.ts — 定时任务调度引擎
 *
 * Phase 4: 每分钟 tick，检查到期任务并执行
 */

import { randomUUID } from 'node:crypto'
import { CronExpressionParser } from 'cron-parser'
import { CronStore } from './store.js'
import type { CronJob, CronRunLog, CronSchedulerRef, Payload, Schedule } from './types.js'

// ─── 计算下次触发时间 ────────────────────────────────────────────────────────

export function computeNextRun(schedule: Schedule): string | undefined {
  switch (schedule.kind) {
    case 'cron': {
      try {
        const interval = CronExpressionParser.parse(schedule.expr)
        const next = interval.next()
        return next.toISOString() ?? undefined
      } catch {
        return undefined
      }
    }
    case 'every': {
      return new Date(Date.now() + schedule.intervalMs).toISOString()
    }
    case 'at': {
      const target = new Date(schedule.iso).getTime()
      return target > Date.now() ? schedule.iso : undefined
    }
  }
}

// ─── 执行器类型 ──────────────────────────────────────────────────────────────

export interface CronExecutorDeps {
  /** 通知回调（Core 层不依赖 Tauri，由外部注入） */
  notifier: (title: string, body: string) => void
  /** 向会话注入消息并触发 agent turn */
  runAgentTurn: (sessionKey: string, userMessage: string) => Promise<string>
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

export class CronScheduler implements CronSchedulerRef {
  private store: CronStore
  private timer: ReturnType<typeof setInterval> | null = null
  private deps: CronExecutorDeps

  constructor(deps: CronExecutorDeps) {
    this.store = new CronStore()
    this.deps = deps
  }

  // ─── 生命周期 ─────────────────────────────────────────────────────────────

  async start(): Promise<number> {
    await this.store.load()

    // 刷新所有 job 的 nextRunAt
    for (const job of this.store.list()) {
      if (job.enabled && !job.nextRunAt) {
        this.store.update(job.id, { nextRunAt: computeNextRun(job.schedule) })
      }
    }

    // 立即 tick 一次（恢复可能错过的任务——at 类型过期则清理）
    await this.tick()

    // 每分钟 tick
    this.timer = setInterval(() => {
      this.tick().catch(err => console.error('[CronScheduler] tick error:', err))
    }, 60_000)

    const count = this.store.list().length
    console.log(`[CronScheduler] started, ${count} jobs loaded`)
    return count
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[CronScheduler] stopped')
  }

  get jobCount(): number {
    return this.store.list().length
  }

  // ─── tick（核心调度） ─────────────────────────────────────────────────────

  async tick(): Promise<void> {
    const now = Date.now()

    for (const job of this.store.list()) {
      if (!job.enabled) continue
      if (!job.nextRunAt) {
        // at 类型已过期，清理
        if (job.schedule.kind === 'at') {
          const target = new Date(job.schedule.iso).getTime()
          if (target <= now && job.deleteAfterRun) {
            this.store.remove(job.id)
          }
        }
        continue
      }

      const nextMs = new Date(job.nextRunAt).getTime()
      if (nextMs > now) continue

      // 到点了！执行
      const startTime = Date.now()
      let success = true
      let resultSummary: string | undefined

      try {
        resultSummary = await this.executePayload(job.payload)
      } catch (err) {
        success = false
        resultSummary = err instanceof Error ? err.message : String(err)
      }

      const durationMs = Date.now() - startTime

      // 更新 job 状态
      this.store.update(job.id, {
        lastRunAt: new Date().toISOString(),
        nextRunAt: computeNextRun(job.schedule),
        runCount: job.runCount + 1,
      })

      // 记录运行日志
      this.store.addRun({
        jobId: job.id,
        jobName: job.name,
        ranAt: new Date().toISOString(),
        success,
        resultSummary: resultSummary?.slice(0, 200),
        durationMs,
      })

      // 一次性任务自动删除
      if (job.deleteAfterRun) {
        this.store.remove(job.id)
      }

      console.log(`[CronScheduler] executed "${job.name}" (${success ? '✅' : '❌'}) in ${durationMs}ms`)
    }
  }

  // ─── 执行 Payload ────────────────────────────────────────────────────────

  private async executePayload(payload: Payload): Promise<string> {
    switch (payload.kind) {
      case 'notify': {
        this.deps.notifier(payload.title ?? 'Equality 提醒', payload.text)
        return `已发送通知: ${payload.text}`
      }
      case 'chat': {
        const key = payload.sessionKey ?? 'desktop-default'
        return await this.deps.runAgentTurn(key, payload.message)
      }
      case 'agent': {
        const key = payload.sessionKey ?? 'desktop-default'
        return await this.deps.runAgentTurn(key, payload.prompt)
      }
    }
  }

  // ─── CronSchedulerRef 接口（给 cron 工具用） ─────────────────────────────

  addJob(partial: Omit<CronJob, 'id' | 'createdAt' | 'runCount' | 'nextRunAt' | 'lastRunAt'>): CronJob {
    const job: CronJob = {
      ...partial,
      id: randomUUID().slice(0, 8),
      createdAt: new Date().toISOString(),
      runCount: 0,
      nextRunAt: computeNextRun(partial.schedule),
    }
    this.store.add(job)
    return job
  }

  getJob(id: string): CronJob | undefined {
    return this.store.get(id)
  }

  listJobs(): CronJob[] {
    return this.store.list()
  }

  updateJob(id: string, patch: Partial<Pick<CronJob, 'name' | 'schedule' | 'payload' | 'enabled' | 'deleteAfterRun'>>): boolean {
    const ok = this.store.update(id, patch)
    if (ok && patch.schedule) {
      // schedule 变更时重算 nextRunAt
      this.store.update(id, { nextRunAt: computeNextRun(patch.schedule) })
    }
    return ok
  }

  removeJob(id: string): boolean {
    return this.store.remove(id)
  }

  async runJobNow(id: string): Promise<string> {
    const job = this.store.get(id)
    if (!job) return `错误: 未找到任务 ${id}`

    const startTime = Date.now()
    let success = true
    let result: string

    try {
      result = await this.executePayload(job.payload)
    } catch (err) {
      success = false
      result = err instanceof Error ? err.message : String(err)
    }

    const durationMs = Date.now() - startTime
    this.store.update(id, {
      lastRunAt: new Date().toISOString(),
      runCount: job.runCount + 1,
    })
    this.store.addRun({
      jobId: id,
      jobName: job.name,
      ranAt: new Date().toISOString(),
      success,
      resultSummary: result.slice(0, 200),
      durationMs,
    })

    return result
  }

  getRuns(jobId?: string, limit?: number): CronRunLog[] {
    return this.store.getRuns(jobId, limit)
  }
}
