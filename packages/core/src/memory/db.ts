/**
 * MemoryDB — SQLite + FTS5 长期记忆存储
 *
 * Phase 12: 使用 better-sqlite3 + FTS5 全文检索实现跨 Session 的长期记忆。
 * Phase K2: 增加 embedding BLOB 列 + 混合搜索支持。
 * Phase M1: 增加 agent_id / workspace_dir / source / updated_at / archived / pinned +
 *           去重 / 安全扫描 / memoryUpdate / memoryListPaged / memoryStats。
 * 存储路径：%APPDATA%\Equality\memory.db
 */

import Database from 'better-sqlite3'
import { getDbOptions } from '../db-loader.js'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createDefaultEmbeddingProvider, cosineSimilarity } from './embeddings.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string
  text: string
  category: string
  importance: number
  createdAt: number
  sessionKey?: string
  agentId: string
  workspaceDir?: string
  source: 'tool' | 'auto-capture' | 'manual'
  updatedAt?: number
  archived: boolean
  pinned: boolean
}

export interface MemorySaveOptions {
  category?: string
  importance?: number
  sessionKey?: string
  agentId?: string
  workspaceDir?: string
  source?: 'tool' | 'auto-capture' | 'manual'
  pinned?: boolean
}

export interface MemoryListPagedOptions {
  page?: number
  pageSize?: number
  category?: string
  agentId?: string
  workspaceDir?: string
  source?: string
  archived?: boolean
  pinned?: boolean
  search?: string
}

export interface MemoryListPagedResult {
  items: MemoryEntry[]
  total: number
  page: number
  pageSize: number
}

export interface MemoryStats {
  total: number
  byCategory: Record<string, number>
  byAgent: Record<string, number>
  bySource: Record<string, number>
  byWorkspace: Record<string, number>
  archived: number
  pinned: number
  oldestAt: number | null
  newestAt: number | null
  embeddingCoverage: number
}

export interface DuplicateCheckResult {
  duplicate: boolean
  existingId?: string
  existingText?: string
  similarity?: number
}

export interface ThreatScanResult {
  safe: boolean
  type?: string
  pattern?: string
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
      id            TEXT PRIMARY KEY,
      text          TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'general',
      importance    INTEGER NOT NULL DEFAULT 5,
      created_at    INTEGER NOT NULL,
      session_key   TEXT,
      embedding     BLOB,
      agent_id      TEXT NOT NULL DEFAULT 'default',
      workspace_dir TEXT,
      source        TEXT NOT NULL DEFAULT 'tool',
      updated_at    INTEGER,
      archived      INTEGER NOT NULL DEFAULT 0,
      pinned        INTEGER NOT NULL DEFAULT 0
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

  // M1 迁移：添加 agent_id, workspace_dir, source, updated_at, archived, pinned
  const m1Columns: Array<[string, string]> = [
    ['agent_id', "TEXT NOT NULL DEFAULT 'default'"],
    ['workspace_dir', 'TEXT'],
    ['source', "TEXT NOT NULL DEFAULT 'tool'"],
    ['updated_at', 'INTEGER'],
    ['archived', 'INTEGER NOT NULL DEFAULT 0'],
    ['pinned', 'INTEGER NOT NULL DEFAULT 0'],
  ]
  for (const [col, typedef] of m1Columns) {
    try {
      _db.exec(`ALTER TABLE memories ADD COLUMN ${col} ${typedef}`)
    } catch {
      // 列已存在，忽略
    }
  }

  // M1 索引（必须在 ALTER TABLE 迁移之后创建，否则旧数据库中新列尚不存在）
  _db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mem_agent ON memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_mem_archived ON memories(archived);
    CREATE INDEX IF NOT EXISTS idx_mem_pinned ON memories(pinned);
    CREATE INDEX IF NOT EXISTS idx_mem_source ON memories(source);
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

// ─── Row Helper ───────────────────────────────────────────────────────────────

/** SQLite 行 → MemoryEntry 的映射类型 */
interface MemoryRow {
  id: string
  text: string
  category: string
  importance: number
  created_at: number
  session_key: string | null
  agent_id: string
  workspace_dir: string | null
  source: string
  updated_at: number | null
  archived: number
  pinned: number
}

function rowToEntry(r: MemoryRow): MemoryEntry {
  return {
    id: r.id,
    text: r.text,
    category: r.category,
    importance: r.importance,
    createdAt: r.created_at,
    sessionKey: r.session_key ?? undefined,
    agentId: r.agent_id ?? 'default',
    workspaceDir: r.workspace_dir ?? undefined,
    source: (r.source as MemoryEntry['source']) ?? 'tool',
    updatedAt: r.updated_at ?? undefined,
    archived: r.archived === 1,
    pinned: r.pinned === 1,
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * 保存一条记忆（M1: 支持 MemorySaveOptions + 去重 + 安全扫描）
 *
 * 兼容旧调用：memorySave(text, category, importance, sessionKey)
 */
export function memorySave(
  text: string,
  optsOrCategory?: MemorySaveOptions | string,
  importanceArg?: number,
  sessionKeyArg?: string,
): MemoryEntry | { duplicate: true; existingId: string; existingText: string; similarity: number } | { blocked: true; type: string } {
  // 兼容旧签名
  const opts: MemorySaveOptions =
    typeof optsOrCategory === 'string'
      ? { category: optsOrCategory, importance: importanceArg, sessionKey: sessionKeyArg }
      : optsOrCategory ?? {}

  const category = opts.category ?? 'general'
  const importance = opts.importance ?? 5
  const sessionKey = opts.sessionKey
  const agentId = opts.agentId ?? 'default'
  const workspaceDir = opts.workspaceDir ?? null
  const source = opts.source ?? 'tool'
  const pinned = opts.pinned ? 1 : 0
  const trimmed = text.trim()

  // T4: 安全扫描
  const threat = scanMemoryThreats(trimmed)
  if (!threat.safe) {
    if (source === 'manual') {
      return { blocked: true, type: threat.type! }
    }
    console.warn(`[memory] 安全扫描拦截 (${threat.type}): "${trimmed.slice(0, 60)}..."`)
    // 静默拒绝 tool / auto-capture
    return { blocked: true, type: threat.type! }
  }

  // T3: 去重检查
  const dupCheck = checkMemoryDuplicate(trimmed)
  if (dupCheck.duplicate) {
    if (source === 'manual') {
      return { duplicate: true, existingId: dupCheck.existingId!, existingText: dupCheck.existingText!, similarity: dupCheck.similarity! }
    }
    console.log(`[memory] 去重跳过: 与 ${dupCheck.existingId} 相似度 ${dupCheck.similarity!.toFixed(3)}`)
    // 返回已有记录
    const existing = memoryGetById(dupCheck.existingId!)
    if (existing) return existing
  }

  const id = randomUUID()
  const createdAt = Date.now()

  // K2: 计算 embedding 并存储
  let embeddingBuf: Buffer | null = null
  try {
    embeddingBuf = computeEmbeddingBuffer(trimmed)
  } catch (err) {
    console.warn('[memory] embedding 计算失败，降级为纯文本存储:', err)
  }

  db().prepare(`
    INSERT INTO memories (id, text, category, importance, created_at, session_key, embedding,
                          agent_id, workspace_dir, source, updated_at, archived, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)
  `).run(id, trimmed, category, importance, createdAt, sessionKey ?? null, embeddingBuf,
         agentId, workspaceDir, source, pinned)

  console.log(`[memory] 保存: "${trimmed.slice(0, 60)}..." (${category}, importance=${importance}, agent=${agentId}, source=${source}, hasEmbedding=${!!embeddingBuf})`)
  return {
    id, text: trimmed, category, importance, createdAt, sessionKey,
    agentId, workspaceDir: workspaceDir ?? undefined, source,
    archived: false, pinned: !!opts.pinned,
  }
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
           m.agent_id, m.workspace_dir, m.source, m.updated_at, m.archived, m.pinned,
           rank
    FROM memories_fts fts
    JOIN memories m ON m.rowid = fts.rowid
    WHERE memories_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(ftsQuery, limit) as Array<MemoryRow & { rank: number }>

  return rows.map(r => ({
    entry: rowToEntry(r),
    rank: r.rank,
  }))
}

/**
 * 列出最近的记忆
 */
export function memoryList(limit = 20): MemoryEntry[] {
  const rows = db().prepare(`
    SELECT id, text, category, importance, created_at, session_key,
           agent_id, workspace_dir, source, updated_at, archived, pinned
    FROM memories
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as MemoryRow[]

  return rows.map(rowToEntry)
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

// ─── M1: 新增功能 ────────────────────────────────────────────────────────────

/**
 * 按 ID 获取单条记忆
 */
export function memoryGetById(id: string): MemoryEntry | null {
  const row = db().prepare(`
    SELECT id, text, category, importance, created_at, session_key,
           agent_id, workspace_dir, source, updated_at, archived, pinned
    FROM memories WHERE id = ?
  `).get(id) as MemoryRow | undefined
  return row ? rowToEntry(row) : null
}

/**
 * T3: 去重检查 — 计算待写入文本与已有记忆的 cosine similarity。
 * 若存在 ≥ 0.95 的记录则视为重复。
 */
export function checkMemoryDuplicate(text: string): DuplicateCheckResult {
  let queryEmb: Float32Array
  try {
    const buf = computeEmbeddingBuffer(text)
    queryEmb = new Float32Array(new Uint8Array(buf).buffer)
  } catch {
    return { duplicate: false }
  }

  // 扫描所有有 embedding 的记忆
  const rows = db().prepare(`
    SELECT id, text, embedding FROM memories WHERE embedding IS NOT NULL
  `).all() as Array<{ id: string; text: string; embedding: Buffer }>

  let bestSim = 0
  let bestRow: { id: string; text: string } | null = null

  for (const row of rows) {
    const emb = new Float32Array(new Uint8Array(row.embedding).buffer)
    const sim = cosineSimilarity(queryEmb, emb)
    if (sim > bestSim) {
      bestSim = sim
      bestRow = row
    }
  }

  if (bestSim >= 0.95 && bestRow) {
    return {
      duplicate: true,
      existingId: bestRow.id,
      existingText: bestRow.text,
      similarity: bestSim,
    }
  }
  return { duplicate: false }
}

/**
 * T4: 安全扫描 — 检测 5 种威胁模式。
 */
const THREAT_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /ignore\s+(previous|all)(\s+\w+)*\s+instructions/i, type: 'prompt_injection' },
  { pattern: /system\s+prompt/i, type: 'prompt_injection' },
  { pattern: /<(system|assistant|developer)/i, type: 'prompt_injection' },
  { pattern: /curl.*\$\(?(KEY|TOKEN|SECRET)/i, type: 'exfiltration' },
  { pattern: /authorized_keys/i, type: 'ssh_backdoor' },
]

export function scanMemoryThreats(text: string): ThreatScanResult {
  for (const { pattern, type } of THREAT_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, type, pattern: pattern.source }
    }
  }
  return { safe: true }
}

/**
 * T5: 编辑记忆 — 支持 text/category/importance/pinned/archived 更新。
 * 修改 text 时自动重算 embedding。
 */
export function memoryUpdate(
  id: string,
  fields: Partial<Pick<MemoryEntry, 'text' | 'category' | 'importance' | 'pinned' | 'archived'>>,
): MemoryEntry | null {
  const existing = db().prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as MemoryRow | undefined
  if (!existing) return null

  const sets: string[] = []
  const values: unknown[] = []

  if (fields.text !== undefined && fields.text !== existing.text) {
    // 安全扫描
    const threat = scanMemoryThreats(fields.text.trim())
    if (!threat.safe) {
      console.warn(`[memory] memoryUpdate 安全扫描拦截 (${threat.type})`)
      return null
    }
    sets.push('text = ?')
    values.push(fields.text.trim())
    // 重算 embedding
    try {
      const buf = computeEmbeddingBuffer(fields.text.trim())
      sets.push('embedding = ?')
      values.push(buf)
    } catch {
      // 降级
    }
  }
  if (fields.category !== undefined) { sets.push('category = ?'); values.push(fields.category) }
  if (fields.importance !== undefined) { sets.push('importance = ?'); values.push(fields.importance) }
  if (fields.pinned !== undefined) { sets.push('pinned = ?'); values.push(fields.pinned ? 1 : 0) }
  if (fields.archived !== undefined) { sets.push('archived = ?'); values.push(fields.archived ? 1 : 0) }

  if (sets.length === 0) return memoryGetById(id)

  // 总是更新 updated_at
  sets.push('updated_at = ?')
  values.push(Date.now())

  values.push(id)
  db().prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`).run(...values)

  return memoryGetById(id)
}

/**
 * T6: 分页列表 — 支持过滤 / 排序 / pinned 置顶。
 */
export function memoryListPaged(options: MemoryListPagedOptions = {}): MemoryListPagedResult {
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20))

  const wheres: string[] = []
  const params: unknown[] = []

  // 默认不展示归档
  if (options.archived === true) {
    wheres.push('m.archived = 1')
  } else if (options.archived === false || options.archived === undefined) {
    wheres.push('m.archived = 0')
  }

  if (options.category) { wheres.push('m.category = ?'); params.push(options.category) }
  if (options.agentId) { wheres.push('m.agent_id = ?'); params.push(options.agentId) }
  if (options.workspaceDir) { wheres.push('m.workspace_dir = ?'); params.push(options.workspaceDir) }
  if (options.source) { wheres.push('m.source = ?'); params.push(options.source) }
  if (options.pinned !== undefined) { wheres.push('m.pinned = ?'); params.push(options.pinned ? 1 : 0) }

  let joinClause = ''
  let matchClause = ''
  if (options.search?.trim()) {
    const ftsQuery = options.search
      .trim()
      .split(/\s+/)
      .map(w => `"${w.replace(/"/g, '')}"`)
      .join(' OR ')
    joinClause = 'JOIN memories_fts fts ON fts.rowid = m.rowid'
    matchClause = 'AND memories_fts MATCH ?'
    params.push(ftsQuery)
  }

  const whereStr = wheres.length > 0 ? 'WHERE ' + wheres.join(' AND ') : ''

  // Count query
  const countParams = [...params]
  const countRow = db().prepare(`
    SELECT COUNT(*) as cnt FROM memories m ${joinClause} ${whereStr} ${matchClause}
  `).get(...countParams) as { cnt: number }
  const total = countRow.cnt

  // Data query — pinned 置顶, then by created_at DESC
  const offset = (page - 1) * pageSize
  const dataParams = [...params, pageSize, offset]
  const rows = db().prepare(`
    SELECT m.id, m.text, m.category, m.importance, m.created_at, m.session_key,
           m.agent_id, m.workspace_dir, m.source, m.updated_at, m.archived, m.pinned
    FROM memories m ${joinClause}
    ${whereStr} ${matchClause}
    ORDER BY m.pinned DESC, m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...dataParams) as MemoryRow[]

  return {
    items: rows.map(rowToEntry),
    total,
    page,
    pageSize,
  }
}

/**
 * T7: 统计信息
 */
export function memoryStats(): MemoryStats {
  const d = db()

  const total = (d.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
  const archived = (d.prepare('SELECT COUNT(*) as c FROM memories WHERE archived = 1').get() as { c: number }).c
  const pinned = (d.prepare('SELECT COUNT(*) as c FROM memories WHERE pinned = 1').get() as { c: number }).c

  const embTotal = (d.prepare('SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL').get() as { c: number }).c
  const embeddingCoverage = total > 0 ? embTotal / total : 0

  const oldest = (d.prepare('SELECT MIN(created_at) as v FROM memories').get() as { v: number | null }).v
  const newest = (d.prepare('SELECT MAX(created_at) as v FROM memories').get() as { v: number | null }).v

  const byCategory: Record<string, number> = {}
  for (const r of d.prepare('SELECT category, COUNT(*) as c FROM memories GROUP BY category').all() as Array<{ category: string; c: number }>) {
    byCategory[r.category] = r.c
  }

  const byAgent: Record<string, number> = {}
  for (const r of d.prepare('SELECT agent_id, COUNT(*) as c FROM memories GROUP BY agent_id').all() as Array<{ agent_id: string; c: number }>) {
    byAgent[r.agent_id] = r.c
  }

  const bySource: Record<string, number> = {}
  for (const r of d.prepare('SELECT source, COUNT(*) as c FROM memories GROUP BY source').all() as Array<{ source: string; c: number }>) {
    bySource[r.source] = r.c
  }

  const byWorkspace: Record<string, number> = {}
  for (const r of d.prepare("SELECT COALESCE(workspace_dir, '(global)') as ws, COUNT(*) as c FROM memories GROUP BY ws").all() as Array<{ ws: string; c: number }>) {
    byWorkspace[r.ws] = r.c
  }

  return { total, byCategory, byAgent, bySource, byWorkspace, archived, pinned, oldestAt: oldest, newestAt: newest, embeddingCoverage }
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
