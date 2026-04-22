import { createSession, type Session } from './types.js'
import { load as loadFromDisk, listSessions as listFromDisk, deleteSession as deleteFromDisk } from './persist.js'
import { emitSessionEvent } from './lifecycle.js'

const MAX_SESSIONS = 5000
const IDLE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

const store = new Map<string, Session>()

export async function getOrCreate(key: string): Promise<Session> {
  let session = store.get(key)
  if (!session) {
    if (store.size >= MAX_SESSIONS) {
      throw new Error('SessionStore capacity exceeded (5000)')
    }
    // 尝试从磁盘恢复
    const saved = await loadFromDisk(key)
    session = createSession(key)
    if (saved) {
      session.messages = saved.messages ?? []
      session.costLines = saved.costLines ?? {}
      session.createdAt = saved.createdAt ?? Date.now()
      session.title = saved.title
      session.frozenMemorySnapshot = saved.frozenMemorySnapshot
      session.purpose = saved.purpose
      session.mode = saved.mode ?? 'chat'
      session.crewId = saved.crewId
      // J2: 发射 session:restored 事件
      emitSessionEvent('session:restored', key, { messageCount: session.messages.length })
    } else {
      // J2: 发射 session:created 事件
      emitSessionEvent('session:created', key)
    }
    store.set(key, session)
  }
  session.lastActiveAt = Date.now()
  return session
}

export function get(key: string): Session | undefined {
  return store.get(key)
}

export function cancel(key: string): void {
  const session = store.get(key)
  if (session?.runningAbort) {
    session.runningAbort.abort()
    session.runningAbort = null
  }
}

export function reap(): number {
  const cutoff = Date.now() - IDLE_TTL_MS
  let removed = 0
  for (const [key, session] of store) {
    if (session.lastActiveAt < cutoff && !session.runningAbort) {
      store.delete(key)
      // J2: 发射 session:reaped 事件
      emitSessionEvent('session:reaped', key, { idleMs: Date.now() - session.lastActiveAt })
      removed++
    }
  }
  return removed
}

export function size(): number {
  return store.size
}

/**
 * M1 T16: 清空所有活跃 session 的冻结记忆快照。
 * 当记忆被编辑/删除/添加时调用，强制下次 assemble 重新 Recall。
 */
export function invalidateMemorySnapshots(): number {
  let count = 0
  for (const session of store.values()) {
    if (session.frozenMemorySnapshot) {
      session.frozenMemorySnapshot = undefined
      count++
    }
  }
  if (count > 0) {
    console.log(`[session] 已清空 ${count} 个 session 的冻结记忆快照`)
  }
  return count
}
