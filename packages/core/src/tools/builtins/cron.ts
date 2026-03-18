/**
 * tools/builtins/cron.ts — 定时任务工具
 *
 * Phase 4: LLM 可调用的 cron 管理工具
 * actions: add / list / update / remove / run / runs
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { CronSchedulerRef, Schedule, Payload } from '../../cron/types.js'

// ─── 全局 scheduler 引用（由 index.ts 注入） ─────────────────────────────────

let _scheduler: CronSchedulerRef | null = null

export function setCronScheduler(ref: CronSchedulerRef): void {
  _scheduler = ref
}

function getScheduler(ctx: ToolContext): CronSchedulerRef {
  const ref = (ctx as unknown as Record<string, unknown>).cronScheduler as CronSchedulerRef | undefined ?? _scheduler
  if (!ref) throw new Error('CronScheduler 未初始化')
  return ref
}

// ─── 工具定义 ────────────────────────────────────────────────────────────────

export const cronTool: ToolDefinition = {
  name: 'cron',
  description: `管理定时任务。支持创建、查看、修改、删除和手动执行定时任务。
调度类型: cron（cron 表达式如 "0 17 * * *"）、every（固定间隔毫秒数）、at（一次性 ISO 时间）。
执行类型: notify（桌面系统通知）、chat（向会话注入消息触发 AI 回复）、agent（执行完整 AI 任务）。
常用 cron 表达式: "0 9 * * *"=每天9点, "0 9 * * 1-5"=工作日9点, "0 */2 * * *"=每2小时, "30 17 * * *"=每天17:30`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '操作: add(创建) / list(列出) / update(修改) / remove(删除) / run(立即执行) / runs(查看日志)',
        enum: ['add', 'list', 'update', 'remove', 'run', 'runs'],
      },
      name: {
        type: 'string',
        description: '任务名称（add/update），如 "每天写日报提醒"',
      },
      schedule_kind: {
        type: 'string',
        description: '调度类型: cron / every / at',
        enum: ['cron', 'every', 'at'],
      },
      schedule_value: {
        type: 'string',
        description: 'cron: 表达式如 "0 17 * * *"; every: 毫秒数如 "3600000"; at: ISO 时间如 "2026-03-15T09:00:00"',
      },
      payload_kind: {
        type: 'string',
        description: '执行类型: notify(桌面通知) / chat(注入消息) / agent(AI任务)',
        enum: ['notify', 'chat', 'agent'],
      },
      payload_text: {
        type: 'string',
        description: '通知文本 / 消息内容 / AI 指令',
      },
      delete_after_run: {
        type: 'string',
        description: '执行一次后自动删除 (true/false)，一次性 at 任务推荐 true',
      },
      job_id: {
        type: 'string',
        description: '任务 ID（remove/run/update/runs 时使用）',
      },
      enabled: {
        type: 'string',
        description: '启用/禁用 (true/false)',
      },
    },
    required: ['action'],
  },

  execute: async (input, ctx): Promise<ToolResult> => {
    const scheduler = getScheduler(ctx)
    const action = input.action as string

    try {
      switch (action) {
        case 'add':
          return handleAdd(scheduler, input, ctx)
        case 'list':
          return handleList(scheduler)
        case 'update':
          return handleUpdate(scheduler, input)
        case 'remove':
          return handleRemove(scheduler, input)
        case 'run':
          return await handleRun(scheduler, input)
        case 'runs':
          return handleRuns(scheduler, input)
        default:
          return { content: `未知操作: ${action}`, isError: true }
      }
    } catch (err) {
      return { content: `cron 操作失败: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  },
}

// ─── Action 实现 ────────────────────────────────────────────────────────────

function handleAdd(scheduler: CronSchedulerRef, input: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const name = input.name as string
  if (!name) return { content: '请提供 name（任务名称）', isError: true }

  const scheduleKind = input.schedule_kind as string
  const scheduleValue = input.schedule_value as string
  if (!scheduleKind || !scheduleValue) {
    return { content: '请提供 schedule_kind 和 schedule_value', isError: true }
  }

  const payloadKind = (input.payload_kind as string) ?? 'notify'
  const payloadText = input.payload_text as string
  if (!payloadText) return { content: '请提供 payload_text', isError: true }

  // 构造 Schedule
  let schedule: Schedule
  switch (scheduleKind) {
    case 'cron':
      schedule = { kind: 'cron', expr: scheduleValue }
      break
    case 'every':
      schedule = { kind: 'every', intervalMs: parseInt(scheduleValue, 10) }
      break
    case 'at':
      schedule = { kind: 'at', iso: scheduleValue }
      break
    default:
      return { content: `未知 schedule_kind: ${scheduleKind}`, isError: true }
  }

  // 构造 Payload
  let payload: Payload
  switch (payloadKind) {
    case 'notify':
      payload = { kind: 'notify', text: payloadText }
      break
    case 'chat':
      payload = { kind: 'chat', message: payloadText }
      break
    case 'agent':
      payload = { kind: 'agent', prompt: payloadText }
      break
    default:
      return { content: `未知 payload_kind: ${payloadKind}`, isError: true }
  }

  const deleteAfterRun = input.delete_after_run === 'true' || (scheduleKind === 'at')

  const job = scheduler.addJob({
    name,
    schedule,
    payload,
    enabled: true,
    deleteAfterRun,
    createdBySession: ctx.sessionKey,
  })

  const scheduleDesc = formatSchedule(job.schedule)
  return {
    content: `✅ 已创建定时任务 "${job.name}"
ID: ${job.id}
调度: ${scheduleDesc}
执行: ${formatPayload(job.payload)}
下次执行: ${job.nextRunAt ?? '（已过期）'}
${job.deleteAfterRun ? '（一次性任务，执行后自动删除）' : ''}`,
  }
}

function handleList(scheduler: CronSchedulerRef): ToolResult {
  const jobs = scheduler.listJobs()
  if (jobs.length === 0) {
    return { content: '当前没有定时任务。' }
  }

  const lines = jobs.map(j => {
    const status = j.enabled ? '✅' : '⏸️'
    const origin = j.createdBySession ? `\n   来源: 会话 ${j.createdBySession.slice(0, 8)}` : ''
    return `${status} [${j.id}] ${j.name}
   调度: ${formatSchedule(j.schedule)}
   执行: ${formatPayload(j.payload)}
   下次: ${j.nextRunAt ?? '—'}
   已执行: ${j.runCount} 次${j.lastRunAt ? `，上次: ${j.lastRunAt}` : ''}${origin}`
  })

  return { content: `定时任务列表（共 ${jobs.length} 个）：\n\n${lines.join('\n\n')}` }
}

function handleUpdate(scheduler: CronSchedulerRef, input: Record<string, unknown>): ToolResult {
  const id = input.job_id as string
  if (!id) return { content: '请提供 job_id', isError: true }

  const patch: Record<string, unknown> = {}
  if (input.name) patch.name = input.name
  if (input.enabled !== undefined) patch.enabled = input.enabled === 'true'

  if (input.schedule_kind && input.schedule_value) {
    const kind = input.schedule_kind as string
    const value = input.schedule_value as string
    switch (kind) {
      case 'cron': patch.schedule = { kind: 'cron', expr: value }; break
      case 'every': patch.schedule = { kind: 'every', intervalMs: parseInt(value, 10) }; break
      case 'at': patch.schedule = { kind: 'at', iso: value }; break
    }
  }

  if (input.payload_kind && input.payload_text) {
    const kind = input.payload_kind as string
    const text = input.payload_text as string
    switch (kind) {
      case 'notify': patch.payload = { kind: 'notify', text }; break
      case 'chat': patch.payload = { kind: 'chat', message: text }; break
      case 'agent': patch.payload = { kind: 'agent', prompt: text }; break
    }
  }

  if (Object.keys(patch).length === 0) {
    return { content: '没有需要更新的字段', isError: true }
  }

  const ok = scheduler.updateJob(id, patch as any)
  if (!ok) return { content: `未找到任务 ${id}`, isError: true }

  const job = scheduler.getJob(id)
  return { content: `✅ 已更新任务 "${job?.name ?? id}"` }
}

function handleRemove(scheduler: CronSchedulerRef, input: Record<string, unknown>): ToolResult {
  const id = input.job_id as string
  if (!id) return { content: '请提供 job_id', isError: true }

  const job = scheduler.getJob(id)
  const ok = scheduler.removeJob(id)
  if (!ok) return { content: `未找到任务 ${id}`, isError: true }

  return { content: `✅ 已删除任务 "${job?.name ?? id}"` }
}

async function handleRun(scheduler: CronSchedulerRef, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.job_id as string
  if (!id) return { content: '请提供 job_id', isError: true }

  const job = scheduler.getJob(id)
  if (!job) return { content: `未找到任务 ${id}`, isError: true }

  const result = await scheduler.runJobNow(id)
  return { content: `✅ 已手动执行 "${job.name}"：\n${result}` }
}

function handleRuns(scheduler: CronSchedulerRef, input: Record<string, unknown>): ToolResult {
  const jobId = input.job_id as string | undefined
  const runs = scheduler.getRuns(jobId, 10)

  if (runs.length === 0) {
    return { content: '暂无执行记录。' }
  }

  const lines = runs.map(r => {
    const status = r.success ? '✅' : '❌'
    return `${status} ${r.ranAt} — ${r.jobName} (${r.durationMs}ms)${r.resultSummary ? `\n   ${r.resultSummary}` : ''}`
  })

  return { content: `执行记录（最近 ${runs.length} 条）：\n\n${lines.join('\n')}` }
}

// ─── 格式化辅助 ─────────────────────────────────────────────────────────────

function formatSchedule(s: Schedule): string {
  switch (s.kind) {
    case 'cron': return `cron "${s.expr}"`
    case 'every': {
      const ms = s.intervalMs
      if (ms >= 86400000) return `每 ${Math.round(ms / 86400000)} 天`
      if (ms >= 3600000) return `每 ${Math.round(ms / 3600000)} 小时`
      if (ms >= 60000) return `每 ${Math.round(ms / 60000)} 分钟`
      return `每 ${ms}ms`
    }
    case 'at': return `一次性 ${s.iso}`
  }
}

function formatPayload(p: Payload): string {
  switch (p.kind) {
    case 'notify': return `通知: "${p.text}"`
    case 'chat': return `消息: "${p.message}"`
    case 'agent': return `AI 任务: "${p.prompt}"`
  }
}
