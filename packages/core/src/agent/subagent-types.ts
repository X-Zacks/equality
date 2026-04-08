/**
 * agent/subagent-types.ts — 子 Agent 类型定义
 *
 * Phase E3 (GAP-8) + Phase N2 (N2.4.1)
 */

export interface SpawnSubagentParams {
  /** 子任务的初始 prompt */
  prompt: string
  /** 子任务目标描述（可选，用于 title） */
  goal?: string
  /** 子任务可用的工具白名单 */
  allowedTools?: string[]
  /** 子任务使用的模型 */
  model?: string
  /** 子任务超时时间（ms） */
  timeoutMs?: number
}

export interface SubagentInfo {
  taskId: string
  title: string
  state: string
  sessionKey: string
  createdAt: number
}

export interface SubagentResult {
  taskId: string
  success: boolean
  summary: string
}

// ─── Phase N2 新增类型 ──────────────────────────────────────────────────────

/** SubagentManager 配置 */
export interface SubagentManagerConfig {
  /** 最大嵌套深度（默认 3）。主 Agent=depth0, 子=depth1, 孙=depth2 */
  maxDepth: number
  /** 全局子 Agent 数量上限（默认 20） */
  maxTotalAgents: number
  /** 单次 spawnParallel 的并行上限（默认 5） */
  maxConcurrent: number
}

/** spawnParallel 的单个 item */
export interface ParallelSpawnItem {
  params: SpawnSubagentParams
  onComplete?: (result: SubagentResult) => void
}

/** SubagentManagerConfig 的默认值 */
export const DEFAULT_SUBAGENT_CONFIG: SubagentManagerConfig = {
  maxDepth: 3,
  maxTotalAgents: 20,
  maxConcurrent: 5,
}
