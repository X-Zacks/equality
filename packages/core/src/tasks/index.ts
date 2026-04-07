/**
 * tasks/index.ts — 任务注册中心模块导出
 *
 * Phase E1 (GAP-9)
 */

export { TaskRegistry } from './registry.js'
export { TaskEventBus } from './events.js'
export { JsonTaskStore, InMemoryTaskStore } from './store.js'
export { SqliteTaskStore } from './sqlite-store.js'
export type { TaskStore } from './store.js'
export type {
  TaskRecord,
  TaskState,
  TaskRuntime,
  TaskSummary,
  TaskEvent,
  TaskEventType,
  TaskNotificationPolicy,
  RegisterTaskParams,
} from './types.js'
export { VALID_TRANSITIONS, TERMINAL_STATES } from './types.js'
