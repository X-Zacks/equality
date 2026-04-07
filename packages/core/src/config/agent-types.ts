/**
 * config/agent-types.ts — Agent 配置类型定义
 *
 * Phase I2 (GAP-24): 多 Agent 作用域配置。
 */

import type { ToolProfileId } from '../tools/catalog.js'

// ─── Agent Entry（配置文件原始格式）────────────────────────────────────────

export interface AgentEntry {
  /** Agent 唯一标识（会被 normalize 为 lowercase） */
  id: string
  /** 显示名称 */
  name?: string
  /** 是否为默认 Agent */
  default?: boolean
  /** 工作目录 */
  workspace?: string
  /** 首选模型 */
  model?: string
  /** 工具配置 */
  tools?: {
    profile?: ToolProfileId
    allow?: string[]
    deny?: string[]
  }
  /** 自定义身份说明（注入到 system prompt） */
  identity?: string
}

// ─── Resolved Agent Config（解析后的配置）────────────────────────────────

export interface ResolvedAgentConfig {
  name?: string
  workspace?: string
  model?: string
  toolProfile?: ToolProfileId
  identity?: string
}

// ─── Equality Config（顶层配置文件格式）──────────────────────────────────

export interface EqualityConfig {
  agents?: {
    defaults?: {
      model?: string
      workspace?: string
    }
    list?: AgentEntry[]
  }
}

export const DEFAULT_AGENT_ID = 'default'
