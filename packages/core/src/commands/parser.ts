/**
 * commands/parser.ts — Chat Command 解析器
 *
 * Phase Q: 解析 "/command arg1 arg2" 格式。
 */

import type { ParsedChatCommand } from './types.js'

// ─── Constants ──────────────────────────────────────────────────────────────

/** 指令名正则：字母数字中划线 */
const COMMAND_NAME_RE = /^[a-z][a-z0-9-]*$/

/** 单个参数最大长度 */
const MAX_ARG_LENGTH = 200

/** 最大参数数量 */
const MAX_ARGS = 10

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 判断输入是否为 Chat Command（以 / 开头）。
 */
export function isChatCommand(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return false
  // 排除 "//" 开头（可能是 URL）
  if (trimmed.startsWith('//')) return false
  // 至少有一个字母跟在 / 后面
  return /^\/[a-z]/i.test(trimmed)
}

/**
 * 解析 Chat Command 输入。
 *
 * @returns 解析结果，或 null（无效指令格式）
 */
export function parseChatCommand(input: string): ParsedChatCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  // 去掉前导 /
  const rest = trimmed.slice(1)
  if (!rest) return null

  // 按空格拆分
  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null

  const name = parts[0].toLowerCase()

  // 验证指令名
  if (!COMMAND_NAME_RE.test(name)) return null

  // 提取参数（截断到限制）
  const args = parts.slice(1, MAX_ARGS + 1).map(arg =>
    arg.length > MAX_ARG_LENGTH ? arg.slice(0, MAX_ARG_LENGTH) : arg,
  )

  return { name, args, raw: trimmed }
}
