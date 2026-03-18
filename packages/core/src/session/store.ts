import { createSession, type Session } from './types.js'
import { load as loadFromDisk, listSessions as listFromDisk, deleteSession as deleteFromDisk } from './persist.js'

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
      removed++
    }
  }
  return removed
}

export function size(): number {
  return store.size
}
