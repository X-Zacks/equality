/**
 * session/search-db.ts — Phase O4: 历史会话全文索引
 *
 * 使用 SQLite FTS5 索引历史会话内容，支持跨会话全文搜索。
 * 数据库位置：%APPDATA%\Equality\session-search.db
 */

import Database from 'better-sqlite3'
import { getDbOptions } from '../db-loader.js'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SessionSearchResult {
  sessionKey: string
  turnIndex: number
  role: string
  snippet: string
  rank: number
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** tool_result 内容截断长度 */
const CONTENT_TRUNCATE_LENGTH = 200

// ─── DB Singleton ─────────────────────────────────────────────────────────────

let _db: Database.Database | null = null

function dataDir(): string {
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  return join(appData, 'Equality')
}

function ensureDb(): Database.Database {
  if (_db) return _db

  const dir = dataDir()
  mkdirSync(dir, { recursive: true })

  _db = new Database(join(dir, 'session-search.db'), getDbOptions())
  _db.pragma('journal_mode = WAL')

  // 主表
  _db.exec(`
    CREATE TABLE IF NOT EXISTS session_turns (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key  TEXT NOT NULL,
      turn_index   INTEGER NOT NULL,
      role         TEXT NOT NULL,
      content_text TEXT NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_st_session ON session_turns(session_key);
    CREATE INDEX IF NOT EXISTS idx_st_turn ON session_turns(session_key, turn_index);
  `)

  // FTS5 全文索引
  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS session_turns_fts USING fts5(
      content_text,
      content=session_turns,
      content_rowid=id,
      tokenize='unicode61'
    );
  `)

  // 同步触发器
  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS st_ai AFTER INSERT ON session_turns BEGIN
      INSERT INTO session_turns_fts(rowid, content_text) VALUES (new.id, new.content_text);
    END;

    CREATE TRIGGER IF NOT EXISTS st_ad AFTER DELETE ON session_turns BEGIN
      INSERT INTO session_turns_fts(session_turns_fts, rowid, content_text)
        VALUES('delete', old.id, old.content_text);
    END;
  `)

  console.log('[session-search-db] 初始化完成')
  return _db
}

// ─── 公共 API ─────────────────────────────────────────────────────────────────

/**
 * 索引一轮对话的消息。
 * tool_result 类内容超过 CONTENT_TRUNCATE_LENGTH 时自动截断。
 */
export function indexTurn(
  sessionKey: string,
  turnIndex: number,
  role: string,
  contentText: string,
): void {
  const db = ensureDb()

  // 截断超长内容
  let text = contentText
  if (text.length > CONTENT_TRUNCATE_LENGTH) {
    text = text.slice(0, CONTENT_TRUNCATE_LENGTH) + '...(truncated)'
  }

  db.prepare(`
    INSERT INTO session_turns (session_key, turn_index, role, content_text)
    VALUES (?, ?, ?, ?)
  `).run(sessionKey, turnIndex, role, text)
}

/**
 * 批量索引多条消息。
 */
export function indexTurns(
  sessionKey: string,
  turns: Array<{ turnIndex: number; role: string; contentText: string }>,
): void {
  const db = ensureDb()
  const stmt = db.prepare(`
    INSERT INTO session_turns (session_key, turn_index, role, content_text)
    VALUES (?, ?, ?, ?)
  `)

  const tx = db.transaction(() => {
    for (const turn of turns) {
      let text = turn.contentText
      if (text.length > CONTENT_TRUNCATE_LENGTH) {
        text = text.slice(0, CONTENT_TRUNCATE_LENGTH) + '...(truncated)'
      }
      stmt.run(sessionKey, turn.turnIndex, turn.role, text)
    }
  })
  tx()
}

/**
 * FTS5 全文搜索历史会话。
 * 返回按 BM25 排名的结果。
 */
export function searchSessions(query: string, limit = 10): SessionSearchResult[] {
  if (!query.trim()) return []
  const db = ensureDb()

  // 构造 FTS5 查询
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map(w => `"${w.replace(/"/g, '')}"`)
    .join(' OR ')

  try {
    const rows = db.prepare(`
      SELECT st.session_key, st.turn_index, st.role, st.content_text,
             rank
      FROM session_turns_fts fts
      JOIN session_turns st ON st.id = fts.rowid
      WHERE session_turns_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Array<{
      session_key: string
      turn_index: number
      role: string
      content_text: string
      rank: number
    }>

    return rows.map(r => ({
      sessionKey: r.session_key,
      turnIndex: r.turn_index,
      role: r.role,
      snippet: highlightQuery(r.content_text, query),
      rank: r.rank,
    }))
  } catch (err) {
    console.warn('[session-search-db] 搜索失败:', err)
    return []
  }
}

/**
 * 删除指定会话的所有索引记录。
 */
export function deleteSessionIndex(sessionKey: string): number {
  const db = ensureDb()
  const result = db.prepare('DELETE FROM session_turns WHERE session_key = ?').run(sessionKey)
  return result.changes
}

/**
 * 获取索引统计信息。
 */
export function getIndexStats(): { totalTurns: number; totalSessions: number } {
  const db = ensureDb()
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM session_turns').get() as { cnt: number }).cnt
  const sessions = (db.prepare('SELECT COUNT(DISTINCT session_key) as cnt FROM session_turns').get() as { cnt: number }).cnt
  return { totalTurns: total, totalSessions: sessions }
}

/**
 * 关闭数据库连接（用于测试清理）。
 */
export function closeSearchDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/**
 * 简单的搜索词高亮：用 ** 包裹匹配词。
 */
function highlightQuery(text: string, query: string): string {
  const words = query.trim().split(/\s+/).filter(w => w.length > 0)
  let result = text
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'gi'), '**$&**')
  }
  return result
}
