/**
 * tools/policy.ts — 工具访问策略
 *
 * Phase 2 简化版：全局白名单/黑名单过滤。
 * deny 优先于 allow（安全先行）。
 *
 * Phase 4+ 扩展：per-agent / per-provider / per-group 策略。
 */

import type { ToolDefinition, ToolPolicy } from './types.js'

/**
 * 根据策略过滤工具列表
 *
 * 规则：
 * 1. 无策略 → 全部放行
 * 2. deny 列表匹配 → 直接排除（最高优先级）
 * 3. allow 列表不为空 → 只保留列表中的（白名单模式）
 * 4. allow 为空或不存在 → 全部放行
 */
export function applyToolPolicy(
  tools: ToolDefinition[],
  policy?: ToolPolicy,
): ToolDefinition[] {
  if (!policy) return tools

  let filtered = tools

  // deny 优先：黑名单排除
  if (policy.deny?.length) {
    const denySet = new Set(policy.deny.map(n => n.toLowerCase()))
    filtered = filtered.filter(t => !denySet.has(t.name.toLowerCase()))
  }

  // allow：白名单保留
  if (policy.allow?.length) {
    const allowSet = new Set(policy.allow.map(n => n.toLowerCase()))
    filtered = filtered.filter(t => allowSet.has(t.name.toLowerCase()))
  }

  return filtered
}
