/**
 * tasks/sqlite-store.ts — SQLite 任务持久化
 *
 * Phase H2 (GAP-18): 替代 JsonTaskStore，使用 Node.js 内置 node:sqlite。
 *
 * 参考 OpenClaw task-registry.store.sqlite.ts（508 行）的设计：
 *   - WAL 模式（并发读）
 *   - 索引优化（state / session / parent）
 *   - 原子 upsert（INSERT ON CONFLICT DO UPDATE）
 *   - 自动建表 + 迁移
 *
 * 注意：node:sqlite 是 Node 22.5+ 的实验性功能。
 * 如果不可用，回退到 JsonTaskStore。
 */

import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { TaskRecord } from './types.js'
import type { TaskStore } from './store.js'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskRow {
  task_id: string
  runtime: string
  state: string
  title: string
  session_key: string | null
  parent_task_id: string | null
  parent_session_key: string | null
  created_at: number | bigint
  started_at: number | bigint | null
  finished_at: number | bigint | null
  timeout_ms: number | bigint | null
  notification_policy: string
  last_error: string | null
  summary: string | null
  metadata_json: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeNumber(value: number | bigint | null | undefined): number | undefined {
  if (typeof value === 'bigint') return Number(value)
  return typeof value === 'number' ? value : undefined
}

function rowToTaskRecord(row: TaskRow): TaskRecord {
  const startedAt = normalizeNumber(row.started_at)
  const finishedAt = normalizeNumber(row.finished_at)
  const timeoutMs = normalizeNumber(row.timeout_ms)

  const record: TaskRecord = {
    id: row.task_id,
    runtime: row.runtime as TaskRecord['runtime'],
    state: row.state as TaskRecord['state'],
    title: row.title,
    createdAt: Number(row.created_at),
    notificationPolicy: row.notification_policy as TaskRecord['notificationPolicy'],
  }

  if (row.session_key) record.sessionKey = row.session_key
  if (row.parent_task_id) record.parentTaskId = row.parent_task_id
  if (row.parent_session_key) record.parentSessionKey = row.parent_session_key
  if (startedAt !== undefined) record.startedAt = startedAt
  if (finishedAt !== undefined) record.finishedAt = finishedAt
  if (timeoutMs !== undefined) record.timeoutMs = timeoutMs
  if (row.last_error) record.lastError = row.last_error
  if (row.summary) record.summary = row.summary
  if (row.metadata_json) {
    try {
      record.metadata = JSON.parse(row.metadata_json)
    } catch { /* ignore corrupt metadata */ }
  }

  return record
}

function taskRecordToParams(record: TaskRecord) {
  return {
    task_id: record.id,
    runtime: record.runtime,
    state: record.state,
    title: record.title,
    session_key: record.sessionKey ?? null,
    parent_task_id: record.parentTaskId ?? null,
    parent_session_key: record.parentSessionKey ?? null,
    created_at: record.createdAt,
    started_at: record.startedAt ?? null,
    finished_at: record.finishedAt ?? null,
    timeout_ms: record.timeoutMs ?? null,
    notification_policy: record.notificationPolicy,
    last_error: record.lastError ?? null,
    summary: record.summary ?? null,
    metadata_json: record.metadata ? JSON.stringify(record.metadata) : null,
  }
}

// ─── Default Path ───────────────────────────────────────────────────────────

function defaultDbPath(): string {
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  return join(appData, 'Equality', 'tasks', 'tasks.db')
}

// ─── SqliteTaskStore ────────────────────────────────────────────────────────

export class SqliteTaskStore implements TaskStore {
  private db!: import('node:sqlite').DatabaseSync
  private stmtSelectAll!: import('node:sqlite').StatementSync
  private stmtUpsert!: import('node:sqlite').StatementSync
  private stmtDelete!: import('node:sqlite').StatementSync
  private stmtClear!: import('node:sqlite').StatementSync
  private _ready: Promise<void>

  constructor(dbPath?: string) {
    const path = dbPath ?? defaultDbPath()
    this._ready = this._init(path)
  }

  private async _init(path: string): Promise<void> {
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const { DatabaseSync } = await import('node:sqlite')
    this.db = new DatabaseSync(path)

    // Pragmas
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA busy_timeout = 5000')

    // Schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_runs (
        task_id TEXT PRIMARY KEY,
        runtime TEXT NOT NULL,
        state TEXT NOT NULL,
        title TEXT NOT NULL,
        session_key TEXT,
        parent_task_id TEXT,
        parent_session_key TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        timeout_ms INTEGER,
        notification_policy TEXT NOT NULL,
        last_error TEXT,
        summary TEXT,
        metadata_json TEXT
      )
    `)

    // Indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_task_state ON task_runs(state)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_task_session ON task_runs(session_key)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_task_parent ON task_runs(parent_task_id)')

    // Prepared statements
    this.stmtSelectAll = this.db.prepare(
      'SELECT * FROM task_runs ORDER BY created_at ASC, task_id ASC',
    )

    this.stmtUpsert = this.db.prepare(`
      INSERT INTO task_runs (
        task_id, runtime, state, title, session_key, parent_task_id,
        parent_session_key, created_at, started_at, finished_at,
        timeout_ms, notification_policy, last_error, summary, metadata_json
      ) VALUES (
        @task_id, @runtime, @state, @title, @session_key, @parent_task_id,
        @parent_session_key, @created_at, @started_at, @finished_at,
        @timeout_ms, @notification_policy, @last_error, @summary, @metadata_json
      )
      ON CONFLICT(task_id) DO UPDATE SET
        runtime = excluded.runtime,
        state = excluded.state,
        title = excluded.title,
        session_key = excluded.session_key,
        parent_task_id = excluded.parent_task_id,
        parent_session_key = excluded.parent_session_key,
        created_at = excluded.created_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        timeout_ms = excluded.timeout_ms,
        notification_policy = excluded.notification_policy,
        last_error = excluded.last_error,
        summary = excluded.summary,
        metadata_json = excluded.metadata_json
    `)

    this.stmtDelete = this.db.prepare('DELETE FROM task_runs WHERE task_id = ?')
    this.stmtClear = this.db.prepare('DELETE FROM task_runs')
  }

  // ─── TaskStore 接口 ─────────────────────────────────────────────────────

  async load(): Promise<TaskRecord[]> {
    await this._ready
    const rows = this.stmtSelectAll.all() as unknown as TaskRow[]
    return rows.map(rowToTaskRecord)
  }

  async save(records: TaskRecord[]): Promise<void> {
    await this._ready
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.stmtClear.run()
      for (const record of records) {
        this.stmtUpsert.run(taskRecordToParams(record))
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  // ─── 增量操作（可选使用）──────────────────────────────────────────────

  async upsert(record: TaskRecord): Promise<void> {
    await this._ready
    this.stmtUpsert.run(taskRecordToParams(record))
  }

  async delete(taskId: string): Promise<void> {
    await this._ready
    this.stmtDelete.run(taskId)
  }

  // ─── 生命周期 ─────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this._ready
    this.db.close()
  }
}

/**
 * 尝试创建 SqliteTaskStore。
 * 如果 node:sqlite 不可用，返回 null。
 */
export function tryCreateSqliteStore(dbPath?: string): SqliteTaskStore | null {
  try {
    return new SqliteTaskStore(dbPath)
  } catch {
    console.warn('[SqliteTaskStore] node:sqlite 不可用, 回退到 JsonTaskStore')
    return null
  }
}
