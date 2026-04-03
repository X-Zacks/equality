/**
 * agent/subagent-types.ts — 子 Agent 类型定义
 *
 * Phase E3 (GAP-8)
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
