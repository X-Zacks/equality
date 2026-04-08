/**
 * orchestration/index.ts — 编排引擎统一导出
 *
 * Phase N1 (N1.7.1)
 */

// ─── 类型系统 ─────────────────────────────────────────────────────────────────

export {
  AGENT_ROLES,
  PLAN_DONE_STATUSES,
  PLAN_TERMINAL_STATUSES,
  createPlanGraph,
  createPlanNode,
} from './plan-types.js'

export type {
  AgentRole,
  PlanExecutionResult,
  PlanExecutionStatus,
  PlanGraph,
  PlanNode,
  PlanNodeStatus,
  PlanProgress,
  PlanValidationResult,
} from './plan-types.js'

// ─── DAG 引擎 ─────────────────────────────────────────────────────────────────

export { PlanDAG } from './plan-dag.js'

// ─── 执行器 ───────────────────────────────────────────────────────────────────

export { PlanExecutor } from './plan-executor.js'
export type {
  NodeSpawnResult,
  NodeSpawner,
  PlanExecutorConfig,
} from './plan-executor.js'

// ─── 序列化 ───────────────────────────────────────────────────────────────────

export { PlanSerializer } from './plan-serializer.js'

// ─── Parity Audit ─────────────────────────────────────────────────────────────

export { ParityAuditor } from './parity-audit.js'
export type {
  ParityAuditResult,
  ParityAuditorConfig,
  SpecRequirement,
  TestMapping,
} from './parity-audit.js'

// ─── History Log ──────────────────────────────────────────────────────────────

export { HistoryLog } from './history-log.js'
export type {
  HistoryEvent,
  HistoryLogSnapshot,
} from './history-log.js'
