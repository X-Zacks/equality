/**
 * tools/policy-pipeline.ts — 多层工具策略管道（Phase C.3）
 *
 * 替代 policy.ts 中单层全局策略，支持 profile → providerProfile → agentProfile 三层合并。
 *
 * 设计原则：
 * 1. deny 优先：任一层的 deniedTools 命中即拒绝，不可被更深层覆盖
 * 2. allow 覆盖：更深层的 allowedTools 覆盖浅层
 * 3. 无策略 = 全部放行：空 PolicyContext → allowed=true（向后兼容）
 * 4. 与 C1 整合：写操作自动标记 risk='high'
 *
 * 影响范围：
 * - 纯函数模块，无副作用
 * - 不改动 runner.ts、index.ts、types.ts
 * - policy.ts 内部委托本模块（签名不变）
 */

import { classifyMutation, MutationType } from './mutation.js'

// ─── 数据结构 ─────────────────────────────────────────────────────────────────

/** 单层策略 */
export interface PolicyLevel {
  /** 白名单：只允许列出的工具（空或不设 = 全部允许） */
  allowedTools?: string[]
  /** 黑名单：禁止列出的工具（优先于白名单，不可被更深层覆盖） */
  deniedTools?: string[]
  /** 每个工具的选项 */
  toolOptions?: Record<string, {
    requiresApproval?: boolean
    risk?: 'low' | 'medium' | 'high'
  }>
}

/** 多层策略上下文 */
export interface PolicyContext {
  /** 全局基础策略 */
  profile?: PolicyLevel
  /** Provider 特定策略（如 OpenAI 禁用某些工具） */
  providerProfile?: PolicyLevel
  /** Agent 特定策略（最高优先级） */
  agentProfile?: PolicyLevel
}

/** 策略决策结果 */
export interface PolicyDecision {
  /** 是否允许执行 */
  allowed: boolean
  /** 是否需要审批（高危操作） */
  requiresApproval: boolean
  /** 风险等级 */
  risk: 'low' | 'medium' | 'high'
  /** 做出决策的层级（用于审计日志） */
  decidedBy: string
}

// ─── 层级名称 ─────────────────────────────────────────────────────────────────

const LAYER_NAMES: (keyof PolicyContext)[] = ['profile', 'providerProfile', 'agentProfile']

// ─── 核心函数 ─────────────────────────────────────────────────────────────────

/**
 * 解析多层策略，返回单个工具的策略决策
 *
 * @param toolName - 工具名称
 * @param ctx      - 多层策略上下文
 * @returns 策略决策
 */
export function resolvePolicyForTool(toolName: string, ctx: PolicyContext): PolicyDecision {
  const lowerName = toolName.toLowerCase()

  // 默认值：全部放行
  let allowed = true
  let requiresApproval = false
  let risk: PolicyDecision['risk'] = 'low'
  let decidedBy = 'default'

  // 遍历层级：profile → providerProfile → agentProfile
  for (const layerName of LAYER_NAMES) {
    const layer = ctx[layerName]
    if (!layer) continue

    // 1. deny 检查（最高优先级，不可被更深层覆盖）
    if (layer.deniedTools?.length) {
      const denySet = new Set(layer.deniedTools.map(n => n.toLowerCase()))
      if (denySet.has(lowerName)) {
        return {
          allowed: false,
          requiresApproval: false,
          risk: 'high',
          decidedBy: `${layerName}.deny`,
        }
      }
    }

    // 2. allow 检查（白名单模式：非空且不包含 → 拒绝）
    if (layer.allowedTools?.length) {
      const allowSet = new Set(layer.allowedTools.map(n => n.toLowerCase()))
      if (!allowSet.has(lowerName)) {
        allowed = false
        decidedBy = `${layerName}.allow`
      } else {
        // 更深层的 allow 可以覆盖浅层的 deny（但不能覆盖 deny 列表）
        allowed = true
        decidedBy = `${layerName}.allow`
      }
    }

    // 3. toolOptions 合并（更深层覆盖浅层）
    const opts = layer.toolOptions?.[toolName] ?? layer.toolOptions?.[lowerName]
    if (opts) {
      if (opts.requiresApproval !== undefined) {
        requiresApproval = opts.requiresApproval
      }
      if (opts.risk !== undefined) {
        risk = opts.risk
      }
    }
  }

  // 4. 与 C1 整合：写操作自动标记 risk='high'（若未被 toolOptions 显式设定）
  if (allowed) {
    const mutation = classifyMutation(toolName)
    if (mutation.type === MutationType.WRITE && risk === 'low') {
      risk = 'high'
    }
  }

  return { allowed, requiresApproval, risk, decidedBy }
}
