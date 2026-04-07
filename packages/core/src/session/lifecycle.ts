/**
 * session/lifecycle.ts — Session 生命周期事件
 *
 * Phase J (GAP-35): 在 session 关键时刻发射结构化事件，
 * 供 UI、日志、hooks 等消费。
 *
 * 事件类型：
 *   - session:created   — 新 session 首次创建
 *   - session:restored  — 从磁盘恢复 session
 *   - session:persisted — session 写入磁盘
 *   - session:destroyed — session 被删除
 *   - session:reaped    — session 因空闲超时被回收
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SessionEventType =
  | 'session:created'
  | 'session:restored'
  | 'session:persisted'
  | 'session:destroyed'
  | 'session:reaped'

export interface SessionEvent {
  type: SessionEventType
  sessionKey: string
  timestamp: number
  /** 附加数据（如 messageCount） */
  data?: Record<string, unknown>
}

export type SessionEventHandler = (event: SessionEvent) => void

// ─── Constants ──────────────────────────────────────────────────────────────

/** 单个事件类型的监听器上限 */
const MAX_LISTENERS_PER_TYPE = 100

/** 合法事件类型列表 */
export const SESSION_EVENT_TYPES: readonly SessionEventType[] = [
  'session:created',
  'session:restored',
  'session:persisted',
  'session:destroyed',
  'session:reaped',
]

// ─── Singleton Registry ─────────────────────────────────────────────────────

const listeners = new Map<SessionEventType, Set<SessionEventHandler>>()

function getListeners(type: SessionEventType): Set<SessionEventHandler> {
  let set = listeners.get(type)
  if (!set) {
    set = new Set()
    listeners.set(type, set)
  }
  return set
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 注册 session 生命周期事件监听器。
 */
export function onSessionEvent(type: SessionEventType, handler: SessionEventHandler): void {
  const set = getListeners(type)
  if (set.size >= MAX_LISTENERS_PER_TYPE) {
    console.warn(`[session-lifecycle] 监听器已达上限 (${MAX_LISTENERS_PER_TYPE}) for "${type}"`)
  }
  set.add(handler)
}

/**
 * 移除 session 生命周期事件监听器。
 */
export function offSessionEvent(type: SessionEventType, handler: SessionEventHandler): boolean {
  const set = listeners.get(type)
  if (!set) return false
  return set.delete(handler)
}

/**
 * 获取指定类型的监听器数量。
 */
export function listenerCount(type: SessionEventType): number {
  return listeners.get(type)?.size ?? 0
}

/**
 * 发射 session 生命周期事件。
 * 同步调用所有监听器，单个 handler 异常不影响其余。
 */
export function emitSessionEvent(
  type: SessionEventType,
  sessionKey: string,
  data?: Record<string, unknown>,
): void {
  const set = listeners.get(type)
  if (!set || set.size === 0) return

  const event: SessionEvent = {
    type,
    sessionKey,
    timestamp: Date.now(),
    data,
  }

  for (const handler of set) {
    try {
      handler(event)
    } catch (err) {
      console.warn(`[session-lifecycle] handler error for "${type}":`, err)
    }
  }
}

/**
 * 清除所有监听器（测试用）。
 */
export function clearAllSessionListeners(): void {
  listeners.clear()
}
