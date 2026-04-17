/**
 * cost/request-quota.ts — Phase U: LLM 请求次数追踪与配额预警
 *
 * 按 provider + model 追踪月度高级请求消耗，支持配额配置、预警、自动降级。
 * 
 * Copilot 高级请求按模型倍率计费：
 *   GPT-4o = 0x (免费)，GPT-5.2 = 1x，Claude Opus 4.6 = 3x，等等。
 */

import Database from 'better-sqlite3'
import { getDbOptions } from '../db-loader.js'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelTier = 'premium' | 'standard' | 'basic'

export interface QuotaConfig {
  provider: string
  tier: ModelTier
  monthlyLimit: number
  warnPct: number       // 0.8
  criticalPct: number   // 0.95
  autoDowngrade: boolean
}

export interface QuotaStatus {
  provider: string
  tier: ModelTier
  used: number          // 加权后的高级请求消耗量
  limit: number
  remaining: number
  pct: number
  level: 'ok' | 'warn' | 'critical' | 'exhausted'
}

// ─── Copilot 高级请求倍率表 ──────────────────────────────────────────────────
// 来源：VS Code Copilot 模型选择器（2026-04-17 截图）
// 0x = 不消耗高级请求 (included)，1x = 1次，3x = 3次，etc.

export const COPILOT_PREMIUM_MULTIPLIER: Record<string, number> = {
  // 0x — 免费（已包含在订阅中）
  'gpt-4.1':                        0,
  'gpt-4o':                         0,
  'gpt-5-mini':                     0,   // GPT-5 mini 0x
  // 0.33x — 低消耗
  'claude-haiku-4.5':               0.33,
  'gemini-3-flash':                 0.33, // Gemini 3 Flash (Preview)
  'gpt-5.4-mini':                   0.33,
  // 1x — 标准高级
  'claude-sonnet-4':                1,
  'claude-sonnet-4.5':              1,
  'claude-sonnet-4.6':              1,
  'gemini-2.5-pro':                 1,
  'gemini-3.1-pro':                 1,
  'gpt-5.2':                        1,
  'gpt-5.2-codex':                  1,
  'gpt-5.3-codex':                  1,
  'gpt-5.4':                        1,
  // 3x — 高消耗
  'claude-opus-4.5':                3,
  'claude-opus-4.6':                3,
  // 7.5x — 极高消耗
  'claude-opus-4.7':                7.5,
  // 30x — 超高消耗
  'claude-opus-4.6-fast':           30,
}

/** 获取模型的高级请求倍率。未知模型默认 1x */
export function getPremiumMultiplier(model: string): number {
  // 精确匹配
  if (model in COPILOT_PREMIUM_MULTIPLIER) {
    return COPILOT_PREMIUM_MULTIPLIER[model]
  }
  // 模糊匹配（Copilot 模型 ID 可能有后缀变体）
  const lower = model.toLowerCase()
  for (const [key, mult] of Object.entries(COPILOT_PREMIUM_MULTIPLIER)) {
    if (lower.includes(key) || key.includes(lower)) return mult
  }
  // 未知模型：如果是 gpt-4o 系列则免费，否则 1x
  if (lower.startsWith('gpt-4o') || lower === 'gpt-4.1-mini') return 0
  return 1
}

// ─── Tier 映射 ────────────────────────────────────────────────────────────────

/** 将 router.ts 的 Tier (light/standard/heavy) 映射到计费 ModelTier */
export function routerTierToModelTier(routerTier: string): ModelTier {
  switch (routerTier) {
    case 'heavy': return 'premium'
    case 'light': return 'basic'
    default: return 'standard'
  }
}

// ─── DB ───────────────────────────────────────────────────────────────────────

let _db: Database.Database | null = null

function db(): Database.Database {
  if (_db) return _db
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  const dir = join(appData, 'Equality')
  mkdirSync(dir, { recursive: true })
  _db = new Database(join(dir, 'cost-ledger.db'), getDbOptions())

  // 确保 request_quotas 表存在
  _db.exec(`
    CREATE TABLE IF NOT EXISTS request_quotas (
      provider       TEXT NOT NULL,
      tier           TEXT NOT NULL,
      monthly_limit  INTEGER NOT NULL,
      warn_pct       REAL NOT NULL DEFAULT 0.8,
      critical_pct   REAL NOT NULL DEFAULT 0.95,
      auto_downgrade INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (provider, tier)
    );
  `)

  // 确保 cost_entries 有 model_tier 列（兼容旧数据库）
  const cols = _db.pragma('table_info(cost_entries)') as Array<{ name: string }>
  if (!cols.some(c => c.name === 'model_tier')) {
    _db.exec(`ALTER TABLE cost_entries ADD COLUMN model_tier TEXT NOT NULL DEFAULT 'standard'`)
  }

  return _db
}

// ─── Quota CRUD ───────────────────────────────────────────────────────────────

export function getQuotaConfig(provider: string, tier: ModelTier): QuotaConfig | null {
  const row = db().prepare(`
    SELECT provider, tier, monthly_limit AS monthlyLimit,
           warn_pct AS warnPct, critical_pct AS criticalPct,
           auto_downgrade AS autoDowngrade
    FROM request_quotas WHERE provider = ? AND tier = ?
  `).get(provider, tier) as any
  if (!row) return null
  return { ...row, autoDowngrade: !!row.autoDowngrade }
}

export function setQuotaConfig(config: QuotaConfig): void {
  db().prepare(`
    INSERT OR REPLACE INTO request_quotas (provider, tier, monthly_limit, warn_pct, critical_pct, auto_downgrade)
    VALUES (@provider, @tier, @monthlyLimit, @warnPct, @criticalPct, @autoDowngrade)
  `).run({
    provider: config.provider,
    tier: config.tier,
    monthlyLimit: config.monthlyLimit,
    warnPct: config.warnPct,
    criticalPct: config.criticalPct,
    autoDowngrade: config.autoDowngrade ? 1 : 0,
  })
}

export function deleteQuotaConfig(provider: string, tier: ModelTier): void {
  db().prepare('DELETE FROM request_quotas WHERE provider = ? AND tier = ?').run(provider, tier)
}

export function listQuotaConfigs(): QuotaConfig[] {
  const rows = db().prepare(`
    SELECT provider, tier, monthly_limit AS monthlyLimit,
           warn_pct AS warnPct, critical_pct AS criticalPct,
           auto_downgrade AS autoDowngrade
    FROM request_quotas
  `).all() as any[]
  return rows.map(r => ({ ...r, autoDowngrade: !!r.autoDowngrade }))
}

// ─── 月度用量查询 ─────────────────────────────────────────────────────────────

/** 获取本月指定 provider+tier 的高级请求消耗（加权） */
export function getMonthlyUsage(provider: string, tier: ModelTier): number {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  if (provider === 'copilot') {
    // Copilot: 按模型倍率加权计算
    const rows = db().prepare(`
      SELECT model, COUNT(*) AS cnt FROM cost_entries
      WHERE provider = 'copilot' AND model_tier = ? AND timestamp >= ?
      GROUP BY model
    `).all(tier, monthStart) as Array<{ model: string; cnt: number }>

    let weighted = 0
    for (const row of rows) {
      weighted += row.cnt * getPremiumMultiplier(row.model)
    }
    return Math.ceil(weighted)
  }

  // 其他 provider: 简单计数
  const row = db().prepare(`
    SELECT COUNT(*) AS cnt FROM cost_entries
    WHERE provider = ? AND model_tier = ? AND timestamp >= ?
  `).get(provider, tier, monthStart) as { cnt: number }
  return row.cnt
}

/** 获取所有 provider 的本月用量汇总 */
export function getAllMonthlyUsage(): Array<{ provider: string; tier: ModelTier; used: number }> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return db().prepare(`
    SELECT provider, model_tier AS tier, COUNT(*) AS used
    FROM cost_entries
    WHERE timestamp >= ?
    GROUP BY provider, model_tier
  `).all(monthStart) as any[]
}

// ─── 配额检查 ─────────────────────────────────────────────────────────────────

export function checkQuota(provider: string, tier: ModelTier): QuotaStatus {
  const config = getQuotaConfig(provider, tier)
  const used = getMonthlyUsage(provider, tier)

  // 无配额配置 → 无限制
  if (!config) {
    return { provider, tier, used, limit: Infinity, remaining: Infinity, pct: 0, level: 'ok' }
  }

  const limit = config.monthlyLimit
  const remaining = Math.max(0, limit - used)
  const pct = limit > 0 ? used / limit : 0

  let level: QuotaStatus['level'] = 'ok'
  if (pct >= 1) level = 'exhausted'
  else if (pct >= config.criticalPct) level = 'critical'
  else if (pct >= config.warnPct) level = 'warn'

  return { provider, tier, used, limit, remaining, pct, level }
}

/** 检查配额并决定是否需要降级，返回降级原因或 null */
export function shouldDowngrade(provider: string, tier: ModelTier): string | null {
  const config = getQuotaConfig(provider, tier)
  if (!config || !config.autoDowngrade) return null
  const status = checkQuota(provider, tier)
  if (status.level === 'exhausted') {
    return `${provider} ${tier} 配额已用尽 (${status.used}/${status.limit})`
  }
  return null
}

// ─── 预警格式化 ───────────────────────────────────────────────────────────────

export function formatQuotaWarning(status: QuotaStatus): string | null {
  if (status.level === 'ok' || status.limit === Infinity) return null

  const pctStr = (status.pct * 100).toFixed(1)
  switch (status.level) {
    case 'warn':
      return `⚠️ ${status.provider} 高级请求 ${pctStr}% (${status.used}/${status.limit})，剩余 ${status.remaining}`
    case 'critical':
      return `🔴 ${status.provider} 高级请求仅剩 ${status.remaining}/${status.limit}，建议使用 GPT-4o 等免费模型`
    case 'exhausted':
      return `🚫 ${status.provider} 高级请求已用尽 (${status.used}/${status.limit})，已自动降级到免费模型`
    default:
      return null
  }
}

// ─── 导出所有配额状态（用于 /usage 和 API） ──────────────────────────────────

export function allQuotaStatuses(): QuotaStatus[] {
  const configs = listQuotaConfigs()
  return configs.map(c => checkQuota(c.provider, c.tier))
}

// ─── 测试用：关闭 DB ─────────────────────────────────────────────────────────

export function _closeDb(): void {
  _db?.close()
  _db = null
}
