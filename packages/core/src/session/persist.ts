import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Session } from './types.js'
import { truncateForPersistence } from './persist-guard.js'

function sessionsDir(): string {
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  return join(appData, 'Equality', 'sessions')
}

function sessionFile(key: string): string {
  const safe = encodeURIComponent(key)
  return join(sessionsDir(), `${safe}.json`)
}

export async function persist(session: Session): Promise<void> {
  const dir = sessionsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  // Phase H4: 持久化前截断超大 tool result（只截断副本，不修改内存中的 session）
  const { messages, truncatedCount, savedChars } = truncateForPersistence(session.messages)
  if (truncatedCount > 0) {
    console.log(
      `[persist-guard] 截断 ${truncatedCount} 条 tool result, 节省 ${savedChars} 字符`,
    )
  }

  const payload = JSON.stringify({
    key: session.key,
    title: session.title,
    messages,
    costLines: session.costLines,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    frozenMemorySnapshot: session.frozenMemorySnapshot,
  })
  await writeFile(sessionFile(session.key), payload, 'utf8')
}

export async function load(key: string): Promise<Pick<Session, 'messages' | 'costLines' | 'createdAt' | 'title' | 'frozenMemorySnapshot'> | null> {
  const file = sessionFile(key)
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 列出所有持久化的会话摘要 */
export async function listSessions(): Promise<Array<{ key: string; title?: string; createdAt: number; lastActiveAt: number; messageCount: number }>> {
  const dir = sessionsDir()
  if (!existsSync(dir)) return []

  const files = await readdir(dir)
  const sessions: Array<{ key: string; title?: string; createdAt: number; lastActiveAt: number; messageCount: number }> = []

  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await readFile(join(dir, file), 'utf8')
      const data = JSON.parse(raw)
      sessions.push({
        key: data.key ?? decodeURIComponent(file.replace('.json', '')),
        title: data.title,
        createdAt: data.createdAt ?? 0,
        lastActiveAt: data.lastActiveAt ?? 0,
        messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
      })
    } catch { /* skip corrupt files */ }
  }

  // 按最后活跃时间降序
  return sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
}

/** 删除一个持久化的会话 */
export async function deleteSession(key: string): Promise<boolean> {
  const file = sessionFile(key)
  if (!existsSync(file)) return false
  try {
    await unlink(file)
    return true
  } catch {
    return false
  }
}
