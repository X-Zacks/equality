/**
 * MemoryDB — SQLite + FTS5 长期记忆存储
 *
 * Phase 12: 使用 better-sqlite3 + FTS5 全文检索实现跨 Session 的长期记忆。
 * Phase K2: 增加 embedding BLOB 列 + 混合搜索支持。
 * 存储路径：%APPDATA%\Equality\memory.db
 */

import Database from 'better-sqlite3'
import { getDbOptions } from '../db-loader.js'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createDefaultEmbeddingProvider } from './embeddings.js'

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
      session_key TEXT,
      embedding   BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_mem_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_mem_created ON memories(created_at);
  `)

  // 迁移：给旧数据库添加 embedding 列（K2）
  try {
    _db.exec(`ALTER TABLE memories ADD COLUMN embedding BLOB`)
  } catch {
    // 列已存在，忽略
  }

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
 * 保存一条记忆（K2: 同时计算并存储 embedding 向量）
 */
export function memorySave(
  text: string,
  category = 'general',
  importance = 5,
  sessionKey?: string,
): MemoryEntry {
  const id = randomUUID()
  const createdAt = Date.now()

  // K2: 计算 embedding 并存储
  let embeddingBuf: Buffer | null = null
  try {
    embeddingBuf = computeEmbeddingBuffer(text.trim())
  } catch (err) {
    console.warn('[memory] embedding 计算失败，降级为纯文本存储:', err)
  }

  db().prepare(`
    INSERT INTO memories (id, text, category, importance, created_at, session_key, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, text.trim(), category, importance, createdAt, sessionKey ?? null, embeddingBuf)

  console.log(`[memory] 保存: "${text.slice(0, 60)}..." (${category}, importance=${importance}, hasEmbedding=${!!embeddingBuf})`)
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

// ─── K2: Embedding 辅助 ──────────────────────────────────────────────────────

/** 缓存的 embedding provider 实例 */
let _embedder: ReturnType<typeof createDefaultEmbeddingProvider> | null = null
function getEmbedder() {
  if (!_embedder) _embedder = createDefaultEmbeddingProvider()
  return _embedder
}

/**
 * 同步计算单条文本的 embedding 并返回 Buffer。
 * SimpleEmbeddingProvider.embed() 内部是纯同步计算（Promise 包装），
 * 这里用同步的等价逻辑直接获取向量。
 */
function computeEmbeddingBuffer(text: string): Buffer {
  const embedder = getEmbedder()
  const dims = embedder.dimensions
  const vec = new Float32Array(dims)
  const lower = text.toLowerCase()

  // 字符 bigram + trigram hashing（与 SimpleEmbeddingProvider.embedOne 一致）
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= lower.length - n; i++) {
      const gram = lower.slice(i, i + n)
      let h = 0x811c9dc5
      for (let j = 0; j < gram.length; j++) {
        h ^= gram.charCodeAt(j)
        h = Math.imul(h, 0x01000193)
      }
      h = h | 0
      const idx = Math.abs(h) % dims
      vec[idx] += h > 0 ? 1 : -1
    }
  }

  // L2 normalize
  let norm = 0
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < dims; i++) vec[i] /= norm
  }

  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
}

/**
 * K2: 获取所有带有 embedding 的记忆记录（用于 hybrid search 的向量检索端）。
 * 返回 MemoryRecord[] 兼容 hybrid-search.ts 的输入格式。
 */
export function getAllMemoriesWithEmbedding(): Array<{
  id: string
  text: string
  category: string
  embedding: Float32Array | null
}> {
  const rows = db().prepare(`
    SELECT id, text, category, embedding
    FROM memories
    WHERE embedding IS NOT NULL
  `).all() as Array<{
    id: string
    text: string
    category: string
    embedding: Buffer | null
  }>

  return rows.map(r => ({
    id: r.id,
    text: r.text,
    category: r.category,
    embedding: r.embedding
      ? new Float32Array(new Uint8Array(r.embedding).buffer)
      : null,
  }))
}

/**
 * K2: 回填旧记忆的 embedding（启动时异步调用）。
 * 扫描 embedding IS NULL 的记录，逐条计算并更新。
 * 返回回填数量。
 */
export function backfillEmbeddings(): number {
  const rows = db().prepare(`
    SELECT id, text FROM memories WHERE embedding IS NULL
  `).all() as Array<{ id: string; text: string }>

  if (rows.length === 0) return 0

  console.log(`[memory] 开始回填 ${rows.length} 条旧记忆的 embedding...`)

  const updateStmt = db().prepare(`
    UPDATE memories SET embedding = ? WHERE id = ?
  `)

  let count = 0
  const txn = db().transaction(() => {
    for (const row of rows) {
      try {
        const buf = computeEmbeddingBuffer(row.text)
        updateStmt.run(buf, row.id)
        count++
      } catch (err) {
        console.warn(`[memory] 回填 ${row.id} 失败:`, err)
      }
    }
  })
  txn()

  console.log(`[memory] 回填完成: ${count}/${rows.length} 条`)
  return count
}

/**
 * K2: 获取默认的 EmbeddingProvider 实例（供外部 hybrid search 使用）。
 */
export function getDefaultEmbedder() {
  return getEmbedder()
}
