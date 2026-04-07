/**
 * plugins/types.ts — 插件系统类型定义
 *
 * Phase K1 (GAP-32): 轻量插件 SDK。
 */

import type { Logger } from '../diagnostics/logger.js'
import type { HookRegistry } from '../hooks/index.js'

// ─── Plugin Manifest ────────────────────────────────────────────────────────

export type PluginType = 'provider' | 'tool' | 'hook'

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean'
  default?: unknown
  description?: string
}

export interface PluginManifest {
  /** 唯一标识符，如 "equality-plugin-ollama" */
  id: string
  /** 显示名称 */
  name: string
  /** 语义化版本号 */
  version: string
  /** 插件类型 */
  type: PluginType
  /** ESM 入口文件相对路径 */
  entry: string
  /** 可选的配置 schema */
  config?: Record<string, PluginConfigField>
}

// ─── Plugin Context ─────────────────────────────────────────────────────────

export interface PluginContext {
  /** 以插件 id 为 module 的 scoped logger */
  logger: Logger
  /** HookRegistry 实例 */
  hooks: HookRegistry
  /** 用户提供的配置值 */
  config: Record<string, unknown>
}

// ─── Plugin Export ──────────────────────────────────────────────────────────

export interface PluginExport {
  activate(ctx: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}

// ─── Plugin State ───────────────────────────────────────────────────────────

export type PluginState = 'loaded' | 'active' | 'error' | 'unloaded'

export const PLUGIN_STATES: readonly PluginState[] = ['loaded', 'active', 'error', 'unloaded']

export const PLUGIN_TYPES: readonly PluginType[] = ['provider', 'tool', 'hook']

// ─── Plugin Info ────────────────────────────────────────────────────────────

export interface PluginInfo {
  manifest: PluginManifest
  state: PluginState
  error?: string
  activatedAt?: number
}

// ─── Validation ─────────────────────────────────────────────────────────────

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/
const SEMVER_RE = /^\d+\.\d+\.\d+/

export interface ManifestValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 验证 PluginManifest 是否合法。
 */
export function validateManifest(obj: unknown): ManifestValidationResult {
  const errors: string[] = []

  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['manifest must be an object'] }
  }

  const m = obj as Record<string, unknown>

  // 必填字段
  if (typeof m.id !== 'string' || !m.id) errors.push('id is required (string)')
  if (typeof m.name !== 'string' || !m.name) errors.push('name is required (string)')
  if (typeof m.version !== 'string' || !m.version) errors.push('version is required (string)')
  if (typeof m.type !== 'string' || !m.type) errors.push('type is required (string)')
  if (typeof m.entry !== 'string' || !m.entry) errors.push('entry is required (string)')

  // id 格式
  if (typeof m.id === 'string' && m.id && !PLUGIN_ID_RE.test(m.id)) {
    errors.push(`id "${m.id}" must match /^[a-z0-9-]+$/ (lowercase, digits, hyphens)`)
  }

  // version 格式
  if (typeof m.version === 'string' && m.version && !SEMVER_RE.test(m.version)) {
    errors.push(`version "${m.version}" must be semver (e.g. 1.0.0)`)
  }

  // type 枚举
  if (typeof m.type === 'string' && m.type && !PLUGIN_TYPES.includes(m.type as PluginType)) {
    errors.push(`type "${m.type}" must be one of: ${PLUGIN_TYPES.join(', ')}`)
  }

  return { valid: errors.length === 0, errors }
}
