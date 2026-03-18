/**
 * cron/store.ts — 定时任务持久化存储
 *
 * Phase 4: JSON 文件存储 + CRUD
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CronJob, CronRunLog } from './types.js'

const MAX_RUNS = 200

function dataDir(): string {
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  return join(appData, 'Equality')
}

function jobsFile(): string {
  return join(dataDir(), 'cron-jobs.json')
}

function runsFile(): string {
  return join(dataDir(), 'cron-runs.json')
}

export class CronStore {
  private jobs = new Map<string, CronJob>()
  private runs: CronRunLog[] = []
  private saving: Promise<void> = Promise.resolve()

  // ─── 持久化 ───────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    // 加载 jobs
    try {
      if (existsSync(jobsFile())) {
        const raw = await readFile(jobsFile(), 'utf8')
        const arr: CronJob[] = JSON.parse(raw)
        if (Array.isArray(arr)) {
          this.jobs.clear()
          for (const job of arr) {
            this.jobs.set(job.id, job)
          }
        }
      }
    } catch (err) {
      console.warn('[CronStore] 加载 jobs 失败，已重置:', err)
      // 损坏的文件直接覆盖为空数组
      await writeFile(jobsFile(), '[]', 'utf8').catch(() => {})
    }

    // 加载 runs
    try {
      if (existsSync(runsFile())) {
        const raw = await readFile(runsFile(), 'utf8')
        const arr = JSON.parse(raw)
        this.runs = Array.isArray(arr) ? arr : []
      }
    } catch (err) {
      console.warn('[CronStore] 加载 runs 失败，已重置:', err)
      await writeFile(runsFile(), '[]', 'utf8').catch(() => {})
    }
  }

  async save(): Promise<void> {
    // 序列化写入，防止并发写同一文件导致数据损坏
    this.saving = this.saving.then(() => this.doSave()).catch(() => {})
    return this.saving
  }

  private async doSave(): Promise<void> {
    const dir = dataDir()
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const jobsArr = [...this.jobs.values()]
    await writeFile(jobsFile(), JSON.stringify(jobsArr, null, 2), 'utf8')
    await writeFile(runsFile(), JSON.stringify(this.runs, null, 2), 'utf8')
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  add(job: CronJob): void {
    this.jobs.set(job.id, job)
    this.save().catch(() => {})
  }

  get(id: string): CronJob | undefined {
    return this.jobs.get(id)
  }

  update(id: string, patch: Partial<CronJob>): boolean {
    const job = this.jobs.get(id)
    if (!job) return false
    Object.assign(job, patch)
    this.save().catch(() => {})
    return true
  }

  remove(id: string): boolean {
    const ok = this.jobs.delete(id)
    if (ok) this.save().catch(() => {})
    return ok
  }

  list(): CronJob[] {
    return [...this.jobs.values()]
  }

  // ─── 运行日志 ─────────────────────────────────────────────────────────────

  addRun(log: CronRunLog): void {
    this.runs.push(log)
    // FIFO 淘汰
    if (this.runs.length > MAX_RUNS) {
      this.runs = this.runs.slice(-MAX_RUNS)
    }
    this.save().catch(() => {})
  }

  getRuns(jobId?: string, limit = 20): CronRunLog[] {
    let filtered = jobId ? this.runs.filter(r => r.jobId === jobId) : this.runs
    return filtered.slice(-limit)
  }
}
