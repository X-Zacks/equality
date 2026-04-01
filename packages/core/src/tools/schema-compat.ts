/**
 * tools/schema-compat.ts — 工具 Schema 跨 Provider 兼容性清洗
 *
 * Phase A.3: Tool Schema Cross-Provider Compatibility
 * Spec: openspec/specs/tools/spec.md「工具 Schema 跨 Provider 兼容」章节
 *
 * 提供 schema 清洗函数，应对不同 provider（Gemini, xAI, OpenAI 等）对
 * JSON Schema 的不同支持程度。核心思路：
 *   - 通用规则：打平 anyOf/oneOf，注入缺失字段，截断长字符串
 *   - Gemini：移除 pattern/examples/maxLength/minLength 等
 *   - xAI：移除 pattern/maxLength/minLength
 *   - 标准（OpenAI/其他）：保持原样
 */

import type { OpenAIToolSchema } from './types.js'

// ─── Types & Constants ─────────────────────────────────────────────────────

type ProviderFamily = 'gemini' | 'xai' | 'standard'

interface JSONSchema {
  [key: string]: any
}

/** Provider ID 到 Family 的映射 */
const PROVIDER_FAMILY_MAP: Record<string, ProviderFamily> = {
  'google-gemini': 'gemini',
  'gemini': 'gemini',
  'xai': 'xai',
  'x-ai': 'xai',
  'openai': 'standard',
  'openai-azure': 'standard',
  'anthropic': 'standard',
  'cohere': 'standard',
  'perplexity': 'standard',
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * 根据 providerId 识别 provider 家族
 */
export function resolveProviderFamily(providerId: string): ProviderFamily {
  return PROVIDER_FAMILY_MAP[providerId.toLowerCase()] ?? 'standard'
}

/**
 * 清洗工具 schema，使其与目标 provider 兼容
 *
 * @param schemas OpenAI 格式的工具 schema 数组
 * @param providerId 目标 provider ID
 * @returns 清洗后的 schema 数组
 */
export function cleanToolSchemas(schemas: OpenAIToolSchema[], providerId: string): OpenAIToolSchema[] {
  const family = resolveProviderFamily(providerId)
  console.log(`[schema-compat] 清洗 ${schemas.length} 个 schema 用于 provider family: ${family}`)

  return schemas.map(schema => cleanSingleSchema(schema, family))
}

// ─── Internal: Single Schema Cleaning ──────────────────────────────────────

/**
 * 清洗单个 schema 对象
 */
function cleanSingleSchema(schema: OpenAIToolSchema, family: ProviderFamily): OpenAIToolSchema {
  const cleaned = JSON.parse(JSON.stringify(schema)) as OpenAIToolSchema

  // 应用通用规则
  const params = cleaned.function.parameters
  if (params) {
    applyUniversalRules(params)

    // 应用 provider 特定规则
    switch (family) {
      case 'gemini':
        applyGeminiRules(params)
        break
      case 'xai':
        applyXAIRules(params)
        break
      case 'standard':
        // 无需特殊处理
        break
    }
  }

  return cleaned
}

// ─── Universal Rules ──────────────────────────────────────────────────────

/**
 * 应用通用规则（所有 provider 都执行）：
 *   - 打平 anyOf/oneOf 为单个 object
 *   - 注入缺失的 type/properties
 *   - 截断超长 description
 */
function applyUniversalRules(schema: JSONSchema): void {
  flattenUnionTypes(schema)
  ensureRequiredFields(schema)
  truncateDescriptions(schema, 500)
}

/**
 * 打平 anyOf/oneOf 为单个 object
 *
 * 策略：若 anyOf/oneOf 中全是 object，将所有 properties 合并到顶层
 */
function flattenUnionTypes(schema: JSONSchema): void {
  if (!schema || typeof schema !== 'object') return

  // 递归处理 properties 中的每个字段
  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        flattenUnionTypes(propSchema as JSONSchema)
      }
    }
  }

  // 处理当前级别的 anyOf/oneOf
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const merged = mergeUnionOptions(schema.anyOf)
    if (merged) {
      delete schema.anyOf
      Object.assign(schema, merged)
    }
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const merged = mergeUnionOptions(schema.oneOf)
    if (merged) {
      delete schema.oneOf
      Object.assign(schema, merged)
    }
  }

  // 递归处理数组的 items
  if (schema.items && typeof schema.items === 'object') {
    flattenUnionTypes(schema.items as JSONSchema)
  }
}

/**
 * 合并 anyOf/oneOf 中的选项为单一 object
 */
function mergeUnionOptions(options: any[]): JSONSchema | null {
  // 若所有选项都是 object 且没有 required，则合并
  const allObjects = options.every(opt => opt && typeof opt === 'object' && (opt.type === 'object' || !opt.type))
  if (!allObjects) return null

  const merged: JSONSchema = {
    type: 'object',
    properties: {},
  }

  for (const opt of options) {
    if (opt.properties && typeof opt.properties === 'object') {
      Object.assign(merged.properties, opt.properties)
    }
  }

  return Object.keys(merged.properties).length > 0 ? merged : null
}

/**
 * 确保 schema 有必要字段（type, properties）
 */
function ensureRequiredFields(schema: JSONSchema): void {
  if (typeof schema !== 'object') return

  // 若没有 type，设为 'object'
  if (!schema.type && schema.properties) {
    schema.type = 'object'
  }

  // 若有 type === 'object' 但没有 properties，初始化为空对象
  if (schema.type === 'object' && !schema.properties) {
    schema.properties = {}
  }

  // 递归处理 properties 和 items
  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        ensureRequiredFields(propSchema as JSONSchema)
      }
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    ensureRequiredFields(schema.items as JSONSchema)
  }
}

/**
 * 截断超长 description
 */
function truncateDescriptions(schema: JSONSchema, maxLen: number): void {
  if (!schema || typeof schema !== 'object') return

  if (typeof schema.description === 'string' && schema.description.length > maxLen) {
    schema.description = schema.description.slice(0, maxLen) + '…'
  }

  // 递归处理 properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        truncateDescriptions(propSchema as JSONSchema, maxLen)
      }
    }
  }

  // 递归处理 items
  if (schema.items && typeof schema.items === 'object') {
    truncateDescriptions(schema.items as JSONSchema, maxLen)
  }
}

// ─── Gemini-Specific Rules ────────────────────────────────────────────────

/**
 * Gemini 专用清洗规则
 * 
 * Gemini API 不支持以下字段：
 *   - pattern, examples, title, default, $schema
 *   - maxLength, minLength, format, minimum, maximum 等验证字段
 */
function applyGeminiRules(schema: JSONSchema): void {
  removeGeminiUnsupported(schema)
  truncateGeminiEnums(schema, 50)
}

function removeGeminiUnsupported(schema: JSONSchema): void {
  if (!schema || typeof schema !== 'object') return

  const unsupportedKeys = ['pattern', 'examples', 'title', 'default', '$schema', 'maxLength', 'minLength', 'format', 'minimum', 'maximum']
  for (const key of unsupportedKeys) {
    delete schema[key]
  }

  // 递归处理 properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        removeGeminiUnsupported(propSchema as JSONSchema)
      }
    }
  }

  // 递归处理 items
  if (schema.items && typeof schema.items === 'object') {
    removeGeminiUnsupported(schema.items as JSONSchema)
  }
}

/**
 * Gemini 对 enum 的元素个数有限制（约 50），超过时截断
 */
function truncateGeminiEnums(schema: JSONSchema, maxEnumSize: number): void {
  if (!schema || typeof schema !== 'object') return

  if (Array.isArray(schema.enum) && schema.enum.length > maxEnumSize) {
    schema.enum = schema.enum.slice(0, maxEnumSize)
  }

  // 递归处理 properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        truncateGeminiEnums(propSchema as JSONSchema, maxEnumSize)
      }
    }
  }

  // 递归处理 items
  if (schema.items && typeof schema.items === 'object') {
    truncateGeminiEnums(schema.items as JSONSchema, maxEnumSize)
  }
}

// ─── xAI-Specific Rules ───────────────────────────────────────────────────

/**
 * xAI 专用清洗规则
 *
 * xAI API 不支持：
 *   - pattern, maxLength, minLength
 */
function applyXAIRules(schema: JSONSchema): void {
  removeXAIUnsupported(schema)
  truncateXAIEnums(schema, 100)
}

function removeXAIUnsupported(schema: JSONSchema): void {
  if (!schema || typeof schema !== 'object') return

  const unsupportedKeys = ['pattern', 'maxLength', 'minLength']
  for (const key of unsupportedKeys) {
    delete schema[key]
  }

  // 递归处理 properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        removeXAIUnsupported(propSchema as JSONSchema)
      }
    }
  }

  // 递归处理 items
  if (schema.items && typeof schema.items === 'object') {
    removeXAIUnsupported(schema.items as JSONSchema)
  }
}

/**
 * xAI 对 enum 的元素个数限制（约 100）
 */
function truncateXAIEnums(schema: JSONSchema, maxEnumSize: number): void {
  if (!schema || typeof schema !== 'object') return

  if (Array.isArray(schema.enum) && schema.enum.length > maxEnumSize) {
    schema.enum = schema.enum.slice(0, maxEnumSize)
  }

  // 递归处理 properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        truncateXAIEnums(propSchema as JSONSchema, maxEnumSize)
      }
    }
  }

  // 递归处理 items
  if (schema.items && typeof schema.items === 'object') {
    truncateXAIEnums(schema.items as JSONSchema, maxEnumSize)
  }
}
