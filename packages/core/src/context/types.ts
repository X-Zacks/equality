/**
 * Context Engine 类型定义 — Phase 12.1
 *
 * 可插拔的上下文管理接口：在 token 预算内组装给 LLM 的消息列表。
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { LLMProvider } from '../providers/types.js'
import type { Skill } from '../skills/types.js'

// ─── assemble() ───────────────────────────────────────────────────────────────

export interface AssembleParams {
  sessionKey: string
  provider: LLMProvider
  /** 当前工作目录 */
  workspaceDir?: string
  /** 已加载的 Skills */
  skills?: Skill[]
  /** 用户通过 @ 指定的高优先级 Skill */
  activeSkill?: Skill
  /** 用户本轮消息（用于 memory recall） */
  userMessage: string
  /** AbortSignal */
  abortSignal?: AbortSignal
  /** Compaction 回调 */
  onCompaction?: (summary: string) => void
}

export interface AssembleResult {
  /** 准备好直接传给 LLM API 的有序消息列表 */
  messages: ChatCompletionMessageParam[]
  /** 是否触发了 Compaction */
  wasCompacted: boolean
  /** 自动 Recall 的记忆条数 */
  recalledMemories: number
}

// ─── afterTurn() ──────────────────────────────────────────────────────────────

export interface AfterTurnParams {
  sessionKey: string
  assistantMessage: string
  /** 费用信息行，单独存储，不混入 LLM 上下文 */
  costLine?: string
}

// ─── ContextEngine 接口 ──────────────────────────────────────────────────────

export interface ContextEngine {
  readonly engineId: string

  /**
   * 核心方法：在 token 预算内组装消息列表。
   * 内部处理 system prompt、memory recall、history、compaction、trim。
   */
  assemble(params: AssembleParams): Promise<AssembleResult>

  /**
   * 对话完成后调用：持久化 session。
   */
  afterTurn(params: AfterTurnParams): Promise<void>

  /**
   * 资源清理（可选）
   */
  dispose?(): Promise<void>
}
