import Database from 'better-sqlite3'
import { getDbOptions } from '../db-loader.js'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

export interface CostEntry {
  entryId: string
  sessionKey: string
  runId: string
  timestamp: number
  durationMs: number
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  totalCny: number
}

// ─── Pricing table (CNY per 1K tokens) ────────────────────────────────────────
const PRICE: Record<string, { input: number; output: number }> = {
  // DeepSeek
  'deepseek-v3':          { input: 0.002,  output: 0.008 },
  'deepseek-chat':        { input: 0.002,  output: 0.008 },  // V3 别名
  'deepseek-r1':          { input: 0.004,  output: 0.016 },
  'deepseek-reasoner':    { input: 0.004,  output: 0.016 },  // R1 别名
  // 通义千问
  'qwen3-coder-plus':     { input: 0.0035, output: 0.007 },
  'qwen3-plus':           { input: 0.0008, output: 0.002 },
  'qwen-plus':            { input: 0.0008, output: 0.002 },
  'qwen-turbo':           { input: 0.0003, output: 0.0006 },
  'qwen-max':             { input: 0.002,  output: 0.006 },
  // 火山引擎
  'doubao-seed-1-6-250615': { input: 0.003, output: 0.009 },
  // Copilot 模型（含在订阅中，$0/token）
  'gpt-4o':               { input: 0, output: 0 },
  'gpt-4.1':              { input: 0, output: 0 },
  'gpt-4.1-mini':         { input: 0, output: 0 },
  'o3-mini':              { input: 0, output: 0 },
  'o4-mini':              { input: 0, output: 0 },
  'claude-sonnet-4':      { input: 0, output: 0 },
  'claude-3.5-sonnet':    { input: 0, output: 0 },
  'gemini-2.0-flash-001': { input: 0, output: 0 },
}

export function calcCost(model: string, input: number, output: number): number {
  const p = PRICE[model] ?? { input: 0.004, output: 0.012 }
  return (input * p.input + output * p.output) / 1000
}

// ─── DB singleton ──────────────────────────────────────────────────────────────
let _db: Database.Database | null = null

function db(): Database.Database {
  if (_db) return _db
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  const dir = join(appData, 'Equality')
  mkdirSync(dir, { recursive: true })
  _db = new Database(join(dir, 'cost-ledger.db'), getDbOptions())
  _db.exec(`
    CREATE TABLE IF NOT EXISTS cost_entries (
      entry_id    TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      run_id      TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      provider    TEXT NOT NULL,
      model       TEXT NOT NULL,
      input_tokens  INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens  INTEGER NOT NULL,
      total_cny     REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session ON cost_entries(session_key);
    CREATE INDEX IF NOT EXISTS idx_ts ON cost_entries(timestamp);
  `)
  return _db
}

export function record(entry: Omit<CostEntry, 'entryId'>): CostEntry {
  const full: CostEntry = { entryId: uuidv4(), ...entry }
  db().prepare(`
    INSERT INTO cost_entries VALUES (
      @entryId, @sessionKey, @runId, @timestamp, @durationMs,
      @provider, @model, @inputTokens, @outputTokens, @totalTokens, @totalCny
    )
  `).run({
    entryId: full.entryId,
    sessionKey: full.sessionKey,
    runId: full.runId,
    timestamp: full.timestamp,
    durationMs: full.durationMs,
    provider: full.provider,
    model: full.model,
    inputTokens: full.inputTokens,
    outputTokens: full.outputTokens,
    totalTokens: full.totalTokens,
    totalCny: full.totalCny,
  })
  return full
}

export interface DailySummary {
  date: string   // YYYY-MM-DD
  totalCny: number
  totalTokens: number
  callCount: number
}

export function dailySummary(days = 7): DailySummary[] {
  return db().prepare(`
    SELECT
      date(timestamp / 1000, 'unixepoch', 'localtime') AS date,
      SUM(total_cny)     AS totalCny,
      SUM(total_tokens)  AS totalTokens,
      COUNT(*)           AS callCount
    FROM cost_entries
    WHERE timestamp >= ?
    GROUP BY date
    ORDER BY date DESC
  `).all(Date.now() - days * 86400_000) as DailySummary[]
}

/** 按会话查询费用汇总 */
export interface SessionCostSummary {
  sessionKey: string
  totalCny: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  callCount: number
  firstCall: number
  lastCall: number
}

export function sessionCostSummary(sessionKey: string): SessionCostSummary | null {
  const row = db().prepare(`
    SELECT
      session_key       AS sessionKey,
      SUM(total_cny)    AS totalCny,
      SUM(total_tokens) AS totalTokens,
      SUM(input_tokens) AS totalInputTokens,
      SUM(output_tokens) AS totalOutputTokens,
      COUNT(*)          AS callCount,
      MIN(timestamp)    AS firstCall,
      MAX(timestamp)    AS lastCall
    FROM cost_entries
    WHERE session_key = ?
  `).get(sessionKey) as SessionCostSummary | undefined
  if (!row || !row.callCount) return null
  return row
}

/** 所有会话的费用汇总（用于概览） */
export function allSessionsCostSummary(): SessionCostSummary[] {
  return db().prepare(`
    SELECT
      session_key       AS sessionKey,
      SUM(total_cny)    AS totalCny,
      SUM(total_tokens) AS totalTokens,
      SUM(input_tokens) AS totalInputTokens,
      SUM(output_tokens) AS totalOutputTokens,
      COUNT(*)          AS callCount,
      MIN(timestamp)    AS firstCall,
      MAX(timestamp)    AS lastCall
    FROM cost_entries
    GROUP BY session_key
    ORDER BY lastCall DESC
  `).all() as SessionCostSummary[]
}

/** 全局费用总计 */
export interface GlobalCostSummary {
  totalCny: number
  totalTokens: number
  callCount: number
  sessionCount: number
}

export function globalCostSummary(): GlobalCostSummary {
  const row = db().prepare(`
    SELECT
      SUM(total_cny)    AS totalCny,
      SUM(total_tokens) AS totalTokens,
      COUNT(*)          AS callCount,
      COUNT(DISTINCT session_key) AS sessionCount
    FROM cost_entries
  `).get() as GlobalCostSummary
  return row ?? { totalCny: 0, totalTokens: 0, callCount: 0, sessionCount: 0 }
}

/** 格式化成本摘要行，追加到回复末尾 */
export function formatCostLine(entry: CostEntry): string {
  const cny = entry.totalCny.toFixed(4)
  const tokens = entry.totalTokens.toLocaleString()
  return `💰 ¥${cny} · ${tokens} tokens · ${entry.model}`
}
