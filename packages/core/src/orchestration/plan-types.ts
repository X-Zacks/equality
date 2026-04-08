/**
 * orchestration/plan-types.ts — Plan DAG 编排引擎核心类型
 *
 * Phase N1 (N1.1.1): 多角色 Agent 协作的 DAG 调度类型系统
 *
 * 类型定义:
 * - AgentRole: 5 种角色
 * - PlanNodeStatus: 8 种节点状态
 * - PlanNode: DAG 节点
 * - PlanGraph: DAG 图
 * - PlanExecutionResult: 执行结果
 * - PlanProgress: 进度回调载体
 * - PlanValidationResult: 图验证结果
 */

// ─── 角色 ─────────────────────────────────────────────────────────────────────

/** Agent 角色：supervisor 统筹、architect 设计、developer 编码、tester 测试、reviewer 审查 */
export type AgentRole = 'supervisor' | 'architect' | 'developer' | 'tester' | 'reviewer'

/** 全部合法角色集合 */
export const AGENT_ROLES: ReadonlySet<AgentRole> = new Set([
  'supervisor',
  'architect',
  'developer',
  'tester',
  'reviewer',
])

// ─── 节点状态 ─────────────────────────────────────────────────────────────────

/**
 * 节点状态流转:
 * pending → ready（前置全部完成时自动流转，由 DAG 计算）
 * ready → running（被 executor 调度时）
 * running → completed | failed | exhausted | cancelled
 * failed → pending（重试，retryCount++）
 * pending/ready → skipped（手动跳过，下游视为完成）
 * pending/ready → cancelled（取消）
 * exhausted: failed 且超过 maxRetries，终止态
 */
export type PlanNodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'exhausted'
  | 'skipped'
  | 'cancelled'

/** 终止态集合：这些状态的节点不会再被调度 */
export const PLAN_TERMINAL_STATUSES: ReadonlySet<PlanNodeStatus> = new Set([
  'completed',
  'failed',
  'exhausted',
  'skipped',
  'cancelled',
])

/** "视为完成"的状态集合：下游节点可以开始 */
export const PLAN_DONE_STATUSES: ReadonlySet<PlanNodeStatus> = new Set([
  'completed',
  'skipped',
])

// ─── Plan 节点 ────────────────────────────────────────────────────────────────

export interface PlanNode {
  /** UUID，全局唯一 */
  id: string
  /** 执行角色 */
  role: AgentRole
  /** 任务描述 */
  task: string
  /** 前置节点 ID 列表 */
  dependsOn: string[]
  /** 当前状态 */
  status: PlanNodeStatus
  /** 已重试次数（初始 0） */
  retryCount: number
  /** 最大重试次数（默认 2） */
  maxRetries: number
  /** 单节点超时 ms（默认 300000 = 5min） */
  timeoutMs: number
  /** 优先级（0=最高），就绪节点按此升序排序 */
  priority: number
  /** 映射到 TaskRegistry 的 taskId */
  assignedTaskId?: string
  /** 产出路径/摘要 */
  output?: string
  /** 扩展元数据 */
  metadata?: Record<string, unknown>
}

// ─── Plan 图 ──────────────────────────────────────────────────────────────────

export interface PlanGraph {
  /** UUID */
  id: string
  /** Plan 标题 */
  title: string
  /** 所有节点 */
  nodes: PlanNode[]
  /** 创建时间戳 */
  createdAt: number
  /** 最后更新时间戳 */
  updatedAt: number
  /** 全局超时 ms（默认 3600000 = 1h） */
  globalTimeoutMs: number
  /** 最大并行节点数（默认 3） */
  maxConcurrent: number
  /** 节点数上限（默认 50） */
  maxTotalNodes: number
}

// ─── 执行结果 ─────────────────────────────────────────────────────────────────

export type PlanExecutionStatus =
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'timed_out'

export interface PlanExecutionResult {
  /** 关联的 PlanGraph id */
  planId: string
  /** 整体执行状态 */
  status: PlanExecutionStatus
  /** 已完成节点数 */
  completedNodes: number
  /** 总节点数 */
  totalNodes: number
  /** 失败的节点 ID 列表 */
  failedNodes: string[]
  /** 总耗时 ms */
  durationMs: number
  /** 执行摘要 */
  summary: string
}

// ─── 进度回调 ─────────────────────────────────────────────────────────────────

export interface PlanProgress {
  /** Plan ID */
  planId: string
  /** 已完成 */
  completedNodes: number
  /** 总节点数 */
  totalNodes: number
  /** 运行中节点 ID */
  runningNodes: string[]
  /** 失败节点 ID */
  failedNodes: string[]
  /** 当前发生状态变化的节点 ID */
  changedNodeId: string
  /** 变化后的状态 */
  changedNodeStatus: PlanNodeStatus
}

// ─── 验证结果 ─────────────────────────────────────────────────────────────────

export interface PlanValidationResult {
  /** 是否合法 */
  valid: boolean
  /** 错误列表 */
  errors: string[]
}

// ─── 工厂函数 ─────────────────────────────────────────────────────────────────

/** 创建 PlanNode 的默认值 */
export function createPlanNode(partial: {
  id: string
  role: AgentRole
  task: string
  dependsOn?: string[]
  priority?: number
  maxRetries?: number
  timeoutMs?: number
  metadata?: Record<string, unknown>
}): PlanNode {
  return {
    id: partial.id,
    role: partial.role,
    task: partial.task,
    dependsOn: partial.dependsOn ?? [],
    status: 'pending',
    retryCount: 0,
    maxRetries: partial.maxRetries ?? 2,
    timeoutMs: partial.timeoutMs ?? 300_000,
    priority: partial.priority ?? 0,
    metadata: partial.metadata,
  }
}

/** 创建 PlanGraph 的默认值 */
export function createPlanGraph(partial: {
  id: string
  title: string
  nodes: PlanNode[]
  maxConcurrent?: number
  maxTotalNodes?: number
  globalTimeoutMs?: number
}): PlanGraph {
  const now = Date.now()
  return {
    id: partial.id,
    title: partial.title,
    nodes: partial.nodes,
    createdAt: now,
    updatedAt: now,
    globalTimeoutMs: partial.globalTimeoutMs ?? 3_600_000,
    maxConcurrent: partial.maxConcurrent ?? 3,
    maxTotalNodes: partial.maxTotalNodes ?? 50,
  }
}
