/**
 * agent/subtask-types.ts — 子任务 类型定义
 *
 * Phase E3 (GAP-8) + Phase N2 (N2.4.1)
 */

export interface SpawnSubtaskParams {
  /** 子任务的初始 prompt */
  prompt: string
  /** 子任务目标描述（可选，用于 title） */
  goal?: string
  /** 子任务可用的工具白名单 */
  allowedTools?: string[]
  /** 父会话的 Provider 信息（子任务继承用户选择的模型） */
  parentProviderInfo?: { providerId: string; modelId: string }
  /** 子任务超时时间（ms）。0 或 undefined 表示不限制（受全局安全阀保护） */
  timeoutMs?: number
}

export interface SubtaskInfo {
  taskId: string
  title: string
  state: string
  sessionKey: string
  createdAt: number
}

export interface SubtaskResult {
  taskId: string
  success: boolean
  summary: string
}

// ─── Phase N2 新增类型 ──────────────────────────────────────────────────────

/** SubtaskManager 配置 */
export interface SubtaskManagerConfig {
  /** 最大嵌套深度（默认 3）。主 Agent=depth0, 子=depth1, 孙=depth2 */
  maxDepth: number
  /** 全局子任务 数量上限（默认 20） */
  maxTotalAgents: number
  /** 单次 spawnParallel 的并行上限（默认 5） */
  maxConcurrent: number
}

/** spawnParallel 的单个 item */
export interface ParallelSpawnItem {
  params: SpawnSubtaskParams
  onComplete?: (result: SubtaskResult) => void
}

/** 全局安全阀：子任务最大存活时间 30 分钟 */
export const MAX_SUBTASK_LIFETIME_MS = 30 * 60 * 1000

/** SubtaskManagerConfig 的默认值 */
export const DEFAULT_SUBTASK_CONFIG: SubtaskManagerConfig = {
  maxDepth: 3,
  maxTotalAgents: 20,
  maxConcurrent: 5,
}
