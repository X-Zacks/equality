/**
 * session/session-snapshot.ts — 结构化 Session 快照
 *
 * Phase N6 (N6.3.1): 借鉴 claw-code RuntimeSession
 * - SessionSnapshot 类型
 * - captureSnapshot / restoreFromSnapshot
 * - JSON 序列化安全
 */

import type { BootstrapStage } from '../bootstrap/bootstrap-graph.js'
import type { ProjectManifest } from '../indexer/file-scanner.js'
import type { HistoryEvent } from '../orchestration/history-log.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  /** Session key */
  sessionKey: string
  /** 最后一条用户消息 */
  prompt: string
  /** 项目概览 [claw-code: PortManifest] */
  manifest?: ProjectManifest
  /** 启动阶段状态 [claw-code: SetupReport] */
  bootstrapStages?: BootstrapStage[]
  /** 历史事件 [claw-code: HistoryLog] */
  historyLog?: HistoryEvent[]
  /** 本次 session 使用过的工具名 */
  toolsUsed: string[]
  /** 对话轮次 */
  turnCount: number
  /** Token 消耗 */
  tokenUsage: { input: number; output: number }
  /** 快照时间戳 */
  persistedAt: number
}

// ─── Session 数据接口（简化版，与现有 session 系统对接） ────────────────────

export interface SessionData {
  key: string
  messages: Array<{ role: string; content?: string; [key: string]: unknown }>
  toolCalls?: string[]
  tokenUsage?: { input: number; output: number }
}

// ─── 快照捕获 ─────────────────────────────────────────────────────────────────

/**
 * 从 session 数据中捕获快照。
 */
export function captureSnapshot(
  session: SessionData,
  extras?: {
    manifest?: ProjectManifest
    bootstrapStages?: BootstrapStage[]
    historyLog?: HistoryEvent[]
  },
): SessionSnapshot {
  // 找最后一条 user 消息
  const lastUserMsg = [...session.messages]
    .reverse()
    .find(m => m.role === 'user')
  const prompt = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : ''

  // 计算轮次（每个 user 消息 = 一轮）
  const turnCount = session.messages.filter(m => m.role === 'user').length

  return {
    sessionKey: session.key,
    prompt,
    manifest: extras?.manifest,
    bootstrapStages: extras?.bootstrapStages,
    historyLog: extras?.historyLog,
    toolsUsed: session.toolCalls ? [...new Set(session.toolCalls)] : [],
    turnCount,
    tokenUsage: session.tokenUsage ?? { input: 0, output: 0 },
    persistedAt: Date.now(),
  }
}

/**
 * 从快照恢复 session 数据（部分恢复——快照不保存完整消息历史）。
 */
export function restoreFromSnapshot(snapshot: SessionSnapshot): SessionData {
  return {
    key: snapshot.sessionKey,
    messages: [],  // 完整消息需要从持久化存储恢复
    toolCalls: [...snapshot.toolsUsed],
    tokenUsage: { ...snapshot.tokenUsage },
  }
}

/**
 * 验证快照数据是否合法。
 */
export function isValidSnapshot(data: unknown): data is SessionSnapshot {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.sessionKey === 'string' &&
    typeof obj.prompt === 'string' &&
    typeof obj.turnCount === 'number' &&
    typeof obj.persistedAt === 'number' &&
    Array.isArray(obj.toolsUsed) &&
    typeof obj.tokenUsage === 'object' &&
    obj.tokenUsage !== null
  )
}
