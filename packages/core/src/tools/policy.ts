/**
 * tools/policy.ts — 工具访问策略
 *
 * Phase 2 签名保留：applyToolPolicy(tools, policy?) → filtered tools
 * Phase C.3 内部升级：委托 policy-pipeline.ts 的 resolvePolicyForTool()
 *
 * deny 优先于 allow（安全先行）。
 */

import type { ToolDefinition, ToolPolicy } from './types.js'
import { resolvePolicyForTool } from './policy-pipeline.js'
import type { PolicyContext } from './policy-pipeline.js'

/**
 * 根据策略过滤工具列表
 *
 * 规则（向后兼容）：
 * 1. 无策略 → 全部放行
 * 2. deny 列表匹配 → 直接排除（最高优先级）
 * 3. allow 列表不为空 → 只保留列表中的（白名单模式）
 * 4. allow 为空或不存在 → 全部放行
 *
 * 内部实现：将 ToolPolicy 映射为 PolicyContext.profile，委托 resolvePolicyForTool()
 */
export function applyToolPolicy(
  tools: ToolDefinition[],
  policy?: ToolPolicy,
): ToolDefinition[] {
  if (!policy) return tools

  // 将旧 ToolPolicy 映射为 PolicyContext.profile
  const ctx: PolicyContext = {
    profile: {
      allowedTools: policy.allow,
      deniedTools: policy.deny,
    },
  }

  return tools.filter(t => resolvePolicyForTool(t.name, ctx).allowed)
}
