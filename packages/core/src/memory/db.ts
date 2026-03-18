/**
 * MemoryDB — SQLite + FTS5 长期记忆存储
 *
 * Phase 12: 使用 better-sqlite3 + FTS5 全文检索实现跨 Session 的长期记忆。
 * 存储路径：%APPDATA%\Equality\memory.db
 */

import Database from 'better-sqlite3'
import { getDbOptions } from '../db-loader.js'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string
  text: string
  category: string
  importance: number
  createdAt: number
  sessionKey?: string
}

export interface MemorySearchResult {
  entry: MemoryEntry
  rank: number
}

// ─── DB Singleton ─────────────────────────────────────────────────────────────

let _db: Database.Database | null = null

function db(): Database.Database {
  if (_db) return _db
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  const dir = join(appData, 'Equality')
  mkdirSync(dir, { recursive: true })

  _db = new Database(join(dir, 'memory.db'), getDbOptions())
  _db.pragma('journal_mode = WAL')

  _db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      text        TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'general',
      importance  INTEGER NOT NULL DEFAULT 5,
      created_at  INTEGER NOT NULL,
      session_key TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mem_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_mem_created ON memories(created_at);
  `)

  // FTS5 虚拟表（外部内容表模式，避免数据冗余）
  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      text,
      content=memories,
      content_rowid=rowid,
      tokenize='unicode61'
    );
  `)

  // 自动同步触发器：INSERT / DELETE / UPDATE 时同步 FTS
  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', old.rowid, old.text);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', old.rowid, old.text);
      INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
  `)

  return _db
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * 保存一条记忆
 */
export function memorySave(
  text: string,
  category = 'general',
  importance = 5,
  sessionKey?: string,
): MemoryEntry {
  const id = randomUUID()
  const createdAt = Date.now()

  db().prepare(`
    INSERT INTO memories (id, text, category, importance, created_at, session_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, text.trim(), category, importance, createdAt, sessionKey ?? null)

  console.log(`[memory] 保存: "${text.slice(0, 60)}..." (${category}, importance=${importance})`)
  return { id, text: text.trim(), category, importance, createdAt, sessionKey }
}

/**
 * FTS5 BM25 全文检索
 */
export function memorySearch(query: string, limit = 5): MemorySearchResult[] {
  if (!query.trim()) return []

  // FTS5 查询语法：用 * 后缀匹配前缀
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map(w => `"${w.replace(/"/g, '')}"`)
    .join(' OR ')

  const rows = db().prepare(`
    SELECT m.id, m.text, m.category, m.importance, m.created_at, m.session_key,
           rank
    FROM memories_fts fts
    JOIN memories m ON m.rowid = fts.rowid
    WHERE memories_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(ftsQuery, limit) as Array<{
    id: string
    text: string
    category: string
    importance: number
    created_at: number
    session_key: string | null
    rank: number
  }>

  return rows.map(r => ({
    entry: {
      id: r.id,
      text: r.text,
      category: r.category,
      importance: r.importance,
      createdAt: r.created_at,
      sessionKey: r.session_key ?? undefined,
    },
    rank: r.rank,
  }))
}

/**
 * 列出最近的记忆
 */
export function memoryList(limit = 20): MemoryEntry[] {
  const rows = db().prepare(`
    SELECT id, text, category, importance, created_at, session_key
    FROM memories
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string
    text: string
    category: string
    importance: number
    created_at: number
    session_key: string | null
  }>

  return rows.map(r => ({
    id: r.id,
    text: r.text,
    category: r.category,
    importance: r.importance,
    createdAt: r.created_at,
    sessionKey: r.session_key ?? undefined,
  }))
}

/**
 * 删除记忆
 */
export function memoryDelete(id: string): boolean {
  const result = db().prepare('DELETE FROM memories WHERE id = ?').run(id)
  return result.changes > 0
}

/**
 * 统计
 */
export function memoryCount(): number {
  const row = db().prepare('SELECT COUNT(*) as cnt FROM memories').get() as { cnt: number }
  return row.cnt
}
