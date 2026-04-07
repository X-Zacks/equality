/**
 * config/agent-scope.ts — Agent 作用域配置解析
 *
 * Phase I2 (GAP-24): 多 Agent 配置解析——每个 Agent 独立 workspace / model / tools / identity。
 *
 * 参考 OpenClaw agent-scope.ts 的设计：
 *   - session key 前缀 `agent:{id}:` 匹配 Agent
 *   - 默认 Agent fallback
 *   - per-agent model / workspace / tools 解析
 */

import type { AgentEntry, ResolvedAgentConfig, EqualityConfig } from './agent-types.js'
import { DEFAULT_AGENT_ID } from './agent-types.js'

// ─── Normalize ──────────────────────────────────────────────────────────────

/** Agent ID 归一化：lowercase + trim */
export function normalizeAgentId(id?: string): string {
  const trimmed = (id ?? '').trim().toLowerCase()
  return trimmed || DEFAULT_AGENT_ID
}

// ─── Session Key Parsing ────────────────────────────────────────────────────

/**
 * 从 session key 解析 agent ID。
 *
 * 格式：`agent:{agentId}:{sessionSuffix}`
 * 普通 key（无 agent: 前缀）→ 返回 DEFAULT_AGENT_ID
 */
export function resolveAgentIdFromSessionKey(sessionKey?: string): string {
  if (!sessionKey) return DEFAULT_AGENT_ID

  const trimmed = sessionKey.trim().toLowerCase()
  if (!trimmed.startsWith('agent:')) return DEFAULT_AGENT_ID

  const parts = trimmed.split(':')
  if (parts.length < 2) return DEFAULT_AGENT_ID

  const agentId = parts[1]
  return normalizeAgentId(agentId)
}

// ─── Config Helpers ─────────────────────────────────────────────────────────

function getAgentList(cfg?: EqualityConfig): AgentEntry[] {
  const list = cfg?.agents?.list
  if (!Array.isArray(list)) return []
  return list.filter((entry): entry is AgentEntry =>
    Boolean(entry && typeof entry === 'object' && entry.id),
  )
}

/**
 * 列出配置中所有 Agent ID（去重）。
 * 无配置时返回 `['default']`。
 */
export function listAgentIds(cfg?: EqualityConfig): string[] {
  const agents = getAgentList(cfg)
  if (agents.length === 0) return [DEFAULT_AGENT_ID]

  const seen = new Set<string>()
  const ids: string[] = []
  for (const entry of agents) {
    const id = normalizeAgentId(entry.id)
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids.length > 0 ? ids : [DEFAULT_AGENT_ID]
}

/**
 * 解析默认 Agent ID。
 * - 优先选择 `default: true` 的 Agent
 * - 多个 default 时选第一个
 * - 无 default 时选列表第一个
 * - 无配置时返回 'default'
 */
export function resolveDefaultAgentId(cfg?: EqualityConfig): string {
  const agents = getAgentList(cfg)
  if (agents.length === 0) return DEFAULT_AGENT_ID

  const defaults = agents.filter((a) => a.default)
  if (defaults.length > 1) {
    console.warn('[agent-scope] 多个 Agent 标记为 default=true，使用第一个')
  }

  const chosen = (defaults[0] ?? agents[0])?.id
  return normalizeAgentId(chosen)
}

/**
 * 根据 Agent ID 查找原始配置条目。
 */
function resolveAgentEntry(cfg: EqualityConfig, agentId: string): AgentEntry | undefined {
  const id = normalizeAgentId(agentId)
  return getAgentList(cfg).find((entry) => normalizeAgentId(entry.id) === id)
}

/**
 * 解析 Agent 的完整配置（合并 entry + defaults）。
 */
export function resolveAgentConfig(
  cfg: EqualityConfig,
  agentId: string,
): ResolvedAgentConfig | undefined {
  const entry = resolveAgentEntry(cfg, agentId)
  if (!entry) return undefined

  return {
    name: entry.name,
    workspace: entry.workspace,
    model: entry.model,
    toolProfile: entry.tools?.profile,
    identity: entry.identity,
  }
}

/**
 * 解析 Agent 的有效模型（agent 配置 > defaults 配置）。
 */
export function resolveAgentEffectiveModel(
  cfg: EqualityConfig,
  agentId: string,
): string | undefined {
  const agentModel = resolveAgentConfig(cfg, agentId)?.model
  if (agentModel) return agentModel
  return cfg?.agents?.defaults?.model
}

/**
 * 解析 Agent 的有效工作目录（agent 配置 > defaults 配置）。
 */
export function resolveAgentWorkspaceDir(
  cfg: EqualityConfig,
  agentId: string,
): string | undefined {
  const agentWs = resolveAgentConfig(cfg, agentId)?.workspace
  if (agentWs) return agentWs
  return cfg?.agents?.defaults?.workspace
}

export { DEFAULT_AGENT_ID }
