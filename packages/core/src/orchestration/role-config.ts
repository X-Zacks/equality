/**
 * orchestration/role-config.ts — 角色 Agent 配置
 *
 * Phase N5 (N5.1.1): 借鉴 claw-code ToolPool + ToolPermissionContext
 * - AgentRoleConfig 类型
 * - 5 个预置角色配置
 * - 角色配置加载函数
 */

import type { AgentRole } from './plan-types.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type ToolProfile = 'coding' | 'minimal' | 'readonly'

export interface AgentRoleConfig {
  /** 角色标识 */
  role: AgentRole
  /** 显示名称 */
  displayName: string
  /** system prompt 核心身份描述 */
  identity: string
  /** 覆盖默认模型（可选） */
  model?: string
  /** 工具集类型 */
  toolProfile: ToolProfile
  /** 工具白名单（如果指定，仅保留这些工具） */
  toolAllow?: string[]
  /** 工具黑名单——精确名称 */
  toolDeny?: string[]
  /** 工具黑名单——前缀匹配 [claw-code: ToolPermissionContext] */
  toolDenyPrefixes?: string[]
  /** 加载的 Skill 列表 */
  skills?: string[]
  /** 工具循环上限 */
  maxToolLoops?: number
  /** context token 预算 */
  contextBudget?: number
}

// ─── 预置角色配置 ─────────────────────────────────────────────────────────────

export const DEFAULT_ROLE_CONFIGS: Record<AgentRole, AgentRoleConfig> = {
  supervisor: {
    role: 'supervisor',
    displayName: '项目监管',
    identity:
      '你是项目监管 Agent。你负责需求澄清、任务拆分、进度监控和最终汇总。' +
      '你不直接编写代码，而是通过 subagent_spawn 委派给专业角色。' +
      '你关注全局进度、阻塞问题和跨模块协调。',
    toolProfile: 'minimal',
    toolAllow: [
      'subagent_spawn', 'subagent_list', 'subagent_steer', 'subagent_kill',
      'read_file', 'write_file', 'list_dir', 'glob',
      'memory_save', 'memory_search', 'codebase_search',
    ],
    toolDeny: ['bash', 'edit_file', 'apply_patch'],
    skills: ['supervisor-workflow', 'openspec-skill'],
    maxToolLoops: 100,
  },

  architect: {
    role: 'architect',
    displayName: '架构师',
    identity:
      '你是架构师 Agent。你负责技术选型、模块划分、接口设计。' +
      '你输出 design.md 和模块 spec.md。' +
      '你可以读取代码但不应该直接修改生产代码，只写设计文档。',
    toolProfile: 'coding',
    toolDeny: ['bash'],
    toolDenyPrefixes: ['subagent_'],
    skills: ['openspec-skill'],
    maxToolLoops: 50,
  },

  developer: {
    role: 'developer',
    displayName: '开发者',
    identity:
      '你是开发 Agent。你严格按照 Spec 和 design.md 编写代码、运行测试、修复 bug。' +
      '你遵循 tasks.md 中分配给你的具体任务，不偏离范围。' +
      '完成后更新 tasks.md 标记进度。',
    toolProfile: 'coding',
    toolDenyPrefixes: ['subagent_'],
    skills: ['project-dev-workflow'],
    maxToolLoops: 80,
  },

  tester: {
    role: 'tester',
    displayName: '测试者',
    identity:
      '你是测试 Agent。你编写测试用例、执行测试、验证覆盖率、报告 bug。' +
      '你关注边界情况、错误处理和回归测试。' +
      '发现问题后写明确的 bug 描述到 tasks.md。',
    toolProfile: 'coding',
    toolDenyPrefixes: ['subagent_'],
    skills: ['testing-workflow'],
    maxToolLoops: 60,
  },

  reviewer: {
    role: 'reviewer',
    displayName: '审查者',
    identity:
      '你是代码审查 Agent。你审查代码质量、Spec 一致性、安全性。' +
      '你只读代码，输出审查报告到 reviews/ 目录。你不修改任何代码文件。',
    toolProfile: 'coding',
    toolDeny: ['write_file', 'edit_file', 'apply_patch', 'bash'],
    toolDenyPrefixes: ['subagent_'],
    skills: ['review-workflow'],
    maxToolLoops: 40,
  },
}

// ─── 加载函数 ─────────────────────────────────────────────────────────────────

/**
 * 获取角色配置。
 * 如果提供了 overrides，会合并到默认配置上。
 */
export function getRoleConfig(
  role: AgentRole,
  overrides?: Partial<AgentRoleConfig>,
): AgentRoleConfig {
  const base = DEFAULT_ROLE_CONFIGS[role]
  if (!base) {
    throw new Error(`Unknown role: ${role}`)
  }
  if (!overrides) return { ...base }
  return {
    ...base,
    ...overrides,
    // 数组字段：override 替换而非合并
    toolAllow: overrides.toolAllow ?? base.toolAllow,
    toolDeny: overrides.toolDeny ?? base.toolDeny,
    toolDenyPrefixes: overrides.toolDenyPrefixes ?? base.toolDenyPrefixes,
    skills: overrides.skills ?? base.skills,
  }
}

/**
 * 列出所有预置角色名称。
 */
export function listRoles(): AgentRole[] {
  return Object.keys(DEFAULT_ROLE_CONFIGS) as AgentRole[]
}
