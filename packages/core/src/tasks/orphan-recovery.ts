/**
 * tasks/orphan-recovery.ts — 子 Agent 孤儿恢复
 *
 * Phase H1 (GAP-17): 服务重启后，自动扫描 lost 状态的子任务并恢复执行。
 *
 * 参考 OpenClaw subagent-orphan-recovery.ts 的设计：
 *   1. 启动后延迟执行（等系统就绪）
 *   2. 扫描 lost + subagent 类型的任务
 *   3. 构建合成 resume 消息 → 重新 spawn
 *   4. 失败 → 指数退避重试（最多 3 次）
 *   5. 幂等保护（已恢复的不重复恢复）
 */

import type { TaskRegistry } from './registry.js'
import type { TaskRecord } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrphanRecoveryResult {
  recovered: number
  failed: number
  skipped: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Resume 消息中任务标题的最大长度 */
const MAX_TASK_TITLE_LEN = 2000

/** 默认首次延迟（ms） */
const DEFAULT_DELAY_MS = 3_000

/** 默认最大重试次数 */
const DEFAULT_MAX_RETRIES = 3

/** 重试退避倍数 */
const RETRY_BACKOFF_MULTIPLIER = 2

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * 构建孤儿任务的合成 resume 消息。
 */
export function buildResumeMessage(task: TaskRecord): string {
  const title = task.title.length > MAX_TASK_TITLE_LEN
    ? `${task.title.slice(0, MAX_TASK_TITLE_LEN)}...`
    : task.title

  let message =
    `[System] 你的上一轮执行被服务重启中断。` +
    `你的原始任务是：\n\n${title}\n\n`

  if (task.lastError) {
    message += `中断前的最后状态：${task.lastError}\n\n`
  }

  message += `请从上次停下的地方继续。`
  return message
}

/**
 * 扫描并恢复 lost 状态的子任务。
 *
 * 只恢复 runtime === 'subagent' 的任务。
 * cron/manual 类型的 lost 任务跳过（它们有各自的恢复机制或不需要恢复）。
 */
export async function recoverOrphanTasks(params: {
  taskRegistry: TaskRegistry
  spawnFn: (task: TaskRecord) => Promise<boolean>
  /** 已恢复的 taskId 集合（幂等保护，跨重试保持） */
  recoveredIds?: Set<string>
}): Promise<OrphanRecoveryResult> {
  const result: OrphanRecoveryResult = { recovered: 0, failed: 0, skipped: 0 }
  const recoveredIds = params.recoveredIds ?? new Set<string>()
  const { taskRegistry, spawnFn } = params

  // 扫描所有 lost 状态任务
  const allTasks = taskRegistry.list({})
  const lostTasks: TaskRecord[] = []

  for (const summary of allTasks) {
    if (summary.state !== 'lost') continue
    const full = taskRegistry.get(summary.id)
    if (full) lostTasks.push(full)
  }

  if (lostTasks.length === 0) return result

  for (const task of lostTasks) {
    // 幂等保护
    if (recoveredIds.has(task.id)) {
      result.skipped++
      continue
    }

    // 只恢复 subagent 类型
    if (task.runtime !== 'subagent') {
      result.skipped++
      continue
    }

    try {
      // 状态迁移：lost → queued
      taskRegistry.transition(task.id, 'queued')

      // 调用 spawnFn 重新执行
      const success = await spawnFn(task)

      if (success) {
        recoveredIds.add(task.id)
        result.recovered++
        console.log(`[orphan-recovery] 恢复成功: ${task.id} (${task.title.slice(0, 60)})`)
      } else {
        result.failed++
        console.warn(`[orphan-recovery] spawnFn 返回 false: ${task.id}`)
      }
    } catch (err) {
      result.failed++
      console.warn(`[orphan-recovery] 恢复失败: ${task.id}`, err)
    }
  }

  if (result.recovered > 0 || result.failed > 0) {
    console.log(
      `[orphan-recovery] 完成: recovered=${result.recovered} failed=${result.failed} skipped=${result.skipped}`,
    )
  }

  return result
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

/**
 * 延迟调度孤儿恢复，并支持指数退避重试。
 *
 * 首次延迟 3s（等系统就绪），如有失败则指数退避重试。
 */
export function scheduleOrphanRecovery(params: {
  taskRegistry: TaskRegistry
  spawnFn: (task: TaskRecord) => Promise<boolean>
  delayMs?: number
  maxRetries?: number
}): void {
  const initialDelay = params.delayMs ?? DEFAULT_DELAY_MS
  const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES
  const recoveredIds = new Set<string>()

  const attemptRecovery = (attempt: number, delay: number) => {
    const timer = setTimeout(() => {
      void recoverOrphanTasks({
        taskRegistry: params.taskRegistry,
        spawnFn: params.spawnFn,
        recoveredIds,
      })
        .then((result) => {
          if (result.failed > 0 && attempt < maxRetries) {
            const nextDelay = delay * RETRY_BACKOFF_MULTIPLIER
            console.log(
              `[orphan-recovery] ${result.failed} 个失败, ${nextDelay}ms 后重试 (${attempt + 1}/${maxRetries})`,
            )
            attemptRecovery(attempt + 1, nextDelay)
          }
        })
        .catch((err) => {
          if (attempt < maxRetries) {
            const nextDelay = delay * RETRY_BACKOFF_MULTIPLIER
            console.warn(
              `[orphan-recovery] 调度失败: ${String(err)}, ${nextDelay}ms 后重试 (${attempt + 1}/${maxRetries})`,
            )
            attemptRecovery(attempt + 1, nextDelay)
          } else {
            console.warn(
              `[orphan-recovery] ${maxRetries} 次重试后仍失败: ${String(err)}`,
            )
          }
        })
    }, delay)

    // 不阻止进程退出
    if (timer.unref) timer.unref()
  }

  attemptRecovery(0, initialDelay)
}
