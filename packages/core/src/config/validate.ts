/**
 * config/validate.ts — 配置验证
 *
 * Phase L1 (GAP-33): 类型检查 + 必填检查 + 默认值填充。
 */

import type { ConfigSchema, ConfigFieldType } from './schema.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConfigValidationResult {
  valid: boolean
  errors: Array<{ key: string; message: string }>
  warnings: Array<{ key: string; message: string }>
  applied: Record<string, unknown>
}

// ─── Type Checkers ──────────────────────────────────────────────────────────

function checkType(value: unknown, expectedType: ConfigFieldType): boolean {
  switch (expectedType) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && !Number.isNaN(value)
    case 'boolean': return typeof value === 'boolean'
    case 'string[]': return Array.isArray(value) && value.every(v => typeof v === 'string')
    case 'json': return typeof value === 'string' || typeof value === 'object'
    default: return true
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 验证配置对象并填充默认值。
 */
export function validateConfig(
  raw: Record<string, unknown>,
  schema: ConfigSchema,
): ConfigValidationResult {
  const errors: Array<{ key: string; message: string }> = []
  const warnings: Array<{ key: string; message: string }> = []
  const applied: Record<string, unknown> = { ...raw }

  // 检查 schema 中定义的字段
  for (const [key, field] of Object.entries(schema)) {
    const value = raw[key]

    // deprecated 警告
    if (field.deprecated && value !== undefined) {
      warnings.push({ key, message: `deprecated: ${field.deprecated}` })
    }

    // 必填检查
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push({ key, message: `required field missing` })
      // 填充默认值
      if (field.default !== undefined) applied[key] = field.default
      continue
    }

    // 未设置 → 填充默认值
    if (value === undefined || value === null) {
      if (field.default !== undefined) applied[key] = field.default
      continue
    }

    // 类型检查
    if (!checkType(value, field.type)) {
      errors.push({ key, message: `type mismatch: expected ${field.type}, got ${typeof value}` })
      if (field.default !== undefined) applied[key] = field.default
      continue
    }

    // 自定义验证
    if (field.validate) {
      const result = field.validate(value)
      if (result !== true) {
        const msg = typeof result === 'string' ? result : `validation failed`
        errors.push({ key, message: msg })
        if (field.default !== undefined) applied[key] = field.default
      }
    }
  }

  // 检查未知 key
  for (const key of Object.keys(raw)) {
    if (!(key in schema)) {
      warnings.push({ key, message: 'unknown configuration key' })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    applied,
  }
}
