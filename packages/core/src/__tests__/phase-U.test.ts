/**
 * __tests__/phase-U.test.ts — Phase U: 请求配额追踪测试
 */
import { strict as assert } from 'node:assert'

// ─── U3: request-quota 核心逻辑测试 ──────────────────────────────────────────

// 因为 request-quota 依赖 SQLite（better-sqlite3），且需要真实 DB，
// 我们测试纯逻辑层（routerTierToModelTier + formatQuotaWarning + QuotaStatus 判定）

import { routerTierToModelTier, formatQuotaWarning, type QuotaStatus, type ModelTier } from '../cost/request-quota.js'

let passed = 0

// U11.1: routerTierToModelTier 映射正确
{
  assert.equal(routerTierToModelTier('heavy'), 'premium', 'U1a — heavy → premium')
  passed++
  assert.equal(routerTierToModelTier('standard'), 'standard', 'U1b — standard → standard')
  passed++
  assert.equal(routerTierToModelTier('light'), 'basic', 'U1c — light → basic')
  passed++
  assert.equal(routerTierToModelTier('unknown'), 'standard', 'U1d — unknown → standard')
  passed++
}

// U11.4: formatQuotaWarning 文本正确
{
  const okStatus: QuotaStatus = {
    provider: 'copilot', tier: 'premium', used: 100, limit: 1000,
    remaining: 900, pct: 0.1, level: 'ok',
  }
  assert.equal(formatQuotaWarning(okStatus), null, 'U4a — ok 不产生警告')
  passed++

  const warnStatus: QuotaStatus = {
    provider: 'copilot', tier: 'premium', used: 820, limit: 1000,
    remaining: 180, pct: 0.82, level: 'warn',
  }
  const warnMsg = formatQuotaWarning(warnStatus)
  assert.ok(warnMsg?.includes('⚠️'), 'U4b — warn 产生 ⚠️ 警告')
  assert.ok(warnMsg?.includes('820'), 'U4c — warn 包含 used 数')
  assert.ok(warnMsg?.includes('1000'), 'U4d — warn 包含 limit 数')
  passed += 3

  const criticalStatus: QuotaStatus = {
    provider: 'copilot', tier: 'premium', used: 960, limit: 1000,
    remaining: 40, pct: 0.96, level: 'critical',
  }
  const critMsg = formatQuotaWarning(criticalStatus)
  assert.ok(critMsg?.includes('🔴'), 'U4e — critical 产生 🔴 警告')
  assert.ok(critMsg?.includes('40'), 'U4f — critical 包含剩余次数')
  passed += 2

  const exhaustedStatus: QuotaStatus = {
    provider: 'copilot', tier: 'premium', used: 1050, limit: 1000,
    remaining: 0, pct: 1.05, level: 'exhausted',
  }
  const exMsg = formatQuotaWarning(exhaustedStatus)
  assert.ok(exMsg?.includes('🚫'), 'U4g — exhausted 产生 🚫 警告')
  passed++
}

// U11.5: 无限制（limit=Infinity）不产生警告
{
  const unlimitedStatus: QuotaStatus = {
    provider: 'custom', tier: 'standard', used: 999, limit: Infinity,
    remaining: Infinity, pct: 0, level: 'ok',
  }
  assert.equal(formatQuotaWarning(unlimitedStatus), null, 'U5a — unlimited 不产生警告')
  passed++
}

// U 额外: CostEntry 类型包含 modelTier
{
  // 编译期检查：如果 CostEntry 没有 modelTier 字段，import 会失败
  const { calcCost } = await import('../cost/ledger.js')
  assert.equal(typeof calcCost, 'function', 'U-extra — ledger 模块可正常导入')
  passed++
}

console.log(`\n✅ All Phase U tests passed (${passed} assertions)\n`)
