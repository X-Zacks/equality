/**
 * __tests__/policy-pipeline.test.ts — Phase C.3 多层工具策略管道测试
 *
 * 运行方式：
 *   npx tsx src/__tests__/policy-pipeline.test.ts
 *
 * 覆盖 7 个核心测试 (T25-T31)：
 * - T25: 全局策略生效
 * - T26: 黑名单优先
 * - T27: Agent 级覆盖
 * - T28: Provider 级策略隔离
 * - T29: 高危工具标记（与 C1 整合）
 * - T30: 无策略 → 全部放行
 * - T31: 旧 ToolPolicy 向后兼容
 */

import { resolvePolicyForTool } from '../tools/policy-pipeline.js'
import type { PolicyContext, PolicyLevel } from '../tools/policy-pipeline.js'
import { applyToolPolicy } from '../tools/policy.js'
import type { ToolDefinition } from '../tools/types.js'

// ─── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, testId: string, message: string): void {
  if (condition) {
    console.log(`  ✅ ${testId} — ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${testId} — ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, testId: string, message: string): void {
  if (actual === expected) {
    console.log(`  ✅ ${testId} — ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${testId} — ${message}`)
    console.error(`     expected: ${JSON.stringify(expected)}`)
    console.error(`     actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

// ─── Mock ToolDefinition（用于 applyToolPolicy 测试）───────────────────────

function mockTool(name: string): ToolDefinition {
  return {
    name,
    description: `mock ${name}`,
    inputSchema: { type: 'object' as const, properties: {} },
    execute: async () => ({ content: '' }),
  }
}

const ALL_TOOLS = [
  mockTool('bash'),
  mockTool('read_file'),
  mockTool('write_file'),
  mockTool('apply_patch'),
  mockTool('grep'),
  mockTool('web_fetch'),
  mockTool('lsp_hover'),
]

// ─── Test Suite ───────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log('Phase C.3 — Policy Pipeline Tests')
console.log('═'.repeat(80))

// ── T25: 全局策略生效 ──
console.log('\n── T25: Profile allowedTools restriction ──')
{
  const ctx: PolicyContext = {
    profile: {
      allowedTools: ['bash', 'read_file', 'lsp_hover'],
    },
  }
  const result = resolvePolicyForTool('grep', ctx)
  assertEqual(result.allowed, false, 'T25a', 'grep not in allowedTools → denied')
  assert(result.decidedBy.includes('profile'), 'T25b', `decidedBy includes "profile": ${result.decidedBy}`)

  const result2 = resolvePolicyForTool('bash', ctx)
  assertEqual(result2.allowed, true, 'T25c', 'bash in allowedTools → allowed')
}

// ── T26: 黑名单优先 ──
console.log('\n── T26: DeniedTools priority over allowedTools ──')
{
  const ctx: PolicyContext = {
    profile: {
      deniedTools: ['write_file', 'apply_patch'],
    },
  }
  const result = resolvePolicyForTool('write_file', ctx)
  assertEqual(result.allowed, false, 'T26a', 'write_file in deniedTools → denied')
  assert(result.decidedBy.includes('deny'), 'T26b', `decidedBy includes "deny": ${result.decidedBy}`)

  // bash 不在 deny 里 → 放行
  const result2 = resolvePolicyForTool('bash', ctx)
  assertEqual(result2.allowed, true, 'T26c', 'bash not in deniedTools → allowed')
}

// ── T27: Agent 级覆盖 ──
console.log('\n── T27: AgentProfile deny overrides ──')
{
  const ctx: PolicyContext = {
    providerProfile: {
      allowedTools: ['bash', 'read_file', 'grep'],
    },
    agentProfile: {
      deniedTools: ['bash'],
    },
  }
  const result = resolvePolicyForTool('bash', ctx)
  assertEqual(result.allowed, false, 'T27a', 'bash denied by agentProfile.deny')
  assert(result.decidedBy.includes('agentProfile'), 'T27b', `decidedBy: ${result.decidedBy}`)

  // grep 在 providerProfile.allowed 中且不在 agentProfile.deny 中 → 放行
  const result2 = resolvePolicyForTool('grep', ctx)
  assertEqual(result2.allowed, true, 'T27c', 'grep allowed by providerProfile, not denied by agent')
}

// ── T28: Provider 级策略隔离 ──
console.log('\n── T28: Provider-level policy isolation ──')
{
  // OpenAI provider 禁用 web_fetch
  const openaiCtx: PolicyContext = {
    providerProfile: {
      deniedTools: ['web_fetch'],
    },
  }
  const result1 = resolvePolicyForTool('web_fetch', openaiCtx)
  assertEqual(result1.allowed, false, 'T28a', 'web_fetch denied for OpenAI provider')

  // 其他 provider 无此限制
  const otherCtx: PolicyContext = {}
  const result2 = resolvePolicyForTool('web_fetch', otherCtx)
  assertEqual(result2.allowed, true, 'T28b', 'web_fetch allowed for other providers')
}

// ── T29: 高危工具标记（与 C1 整合）──
console.log('\n── T29: High-risk tool marking (C1 integration) ──')
{
  // write_file 的 classifyMutation → WRITE → 自动标记 risk='high'
  const ctx: PolicyContext = {}
  const result = resolvePolicyForTool('write_file', ctx)
  assertEqual(result.allowed, true, 'T29a', 'write_file allowed (no policy)')
  assertEqual(result.risk, 'high', 'T29b', 'write_file auto-marked risk=high (via C1)')

  // read_file → READ → risk 保持 'low'
  const result2 = resolvePolicyForTool('read_file', ctx)
  assertEqual(result2.risk, 'low', 'T29c', 'read_file risk=low')

  // toolOptions 可以显式覆盖 risk
  const ctx2: PolicyContext = {
    profile: {
      toolOptions: {
        write_file: { requiresApproval: true, risk: 'medium' },
      },
    },
  }
  const result3 = resolvePolicyForTool('write_file', ctx2)
  assertEqual(result3.requiresApproval, true, 'T29d', 'requiresApproval from toolOptions')
  assertEqual(result3.risk, 'medium', 'T29e', 'risk overridden by toolOptions to medium')
}

// ── T30: 无策略 → 全部放行 ──
console.log('\n── T30: Empty context → allow all ──')
{
  const result = resolvePolicyForTool('bash', {})
  assertEqual(result.allowed, true, 'T30a', 'bash allowed with empty ctx')
  assertEqual(result.decidedBy, 'default', 'T30b', 'decidedBy is "default"')

  const result2 = resolvePolicyForTool('write_file', {})
  assertEqual(result2.allowed, true, 'T30c', 'write_file allowed with empty ctx')
}

// ── T31: 旧 ToolPolicy 向后兼容 ──
console.log('\n── T31: Legacy ToolPolicy backward compatibility ──')
{
  // 旧接口：applyToolPolicy(tools, { allow, deny })
  const filtered = applyToolPolicy(ALL_TOOLS, {
    allow: ['bash', 'read_file', 'grep'],
    deny: ['bash'], // deny 优先于 allow
  })
  const names = filtered.map(t => t.name)

  assert(!names.includes('bash'), 'T31a', 'bash denied (deny > allow)')
  assert(names.includes('read_file'), 'T31b', 'read_file allowed')
  assert(names.includes('grep'), 'T31c', 'grep allowed')
  assert(!names.includes('write_file'), 'T31d', 'write_file not in allow → excluded')
  assert(!names.includes('web_fetch'), 'T31e', 'web_fetch not in allow → excluded')

  // 无策略 → 全部放行
  const all = applyToolPolicy(ALL_TOOLS)
  assertEqual(all.length, ALL_TOOLS.length, 'T31f', 'no policy → all tools returned')

  // 只有 deny → 只排除 deny 列表
  const denyOnly = applyToolPolicy(ALL_TOOLS, { deny: ['apply_patch'] })
  const denyNames = denyOnly.map(t => t.name)
  assert(!denyNames.includes('apply_patch'), 'T31g', 'apply_patch denied')
  assertEqual(denyOnly.length, ALL_TOOLS.length - 1, 'T31h', 'only apply_patch removed')
}

// ─── Extra: 多层 allow 覆盖 ──────────────────────────────────────────────────

console.log('\n── Extra: Multi-layer allow override ──')
{
  // profile 限制只有 read_file，但 agentProfile 扩展到包含 bash
  const ctx: PolicyContext = {
    profile: {
      allowedTools: ['read_file'],
    },
    agentProfile: {
      allowedTools: ['read_file', 'bash'],
    },
  }
  const r1 = resolvePolicyForTool('bash', ctx)
  assertEqual(r1.allowed, true, 'MA1', 'agentProfile.allow overrides profile.allow for bash')

  const r2 = resolvePolicyForTool('grep', ctx)
  assertEqual(r2.allowed, false, 'MA2', 'grep not in agentProfile.allow → denied')
}

// ─── Extra: deny 不可被更深层 allow 覆盖 ──────────────────────────────────────

console.log('\n── Extra: Deny cannot be overridden by deeper allow ──')
{
  const ctx: PolicyContext = {
    profile: {
      deniedTools: ['bash'],
    },
    agentProfile: {
      allowedTools: ['bash', 'read_file'], // 试图通过 allow 覆盖 deny
    },
  }
  const result = resolvePolicyForTool('bash', ctx)
  assertEqual(result.allowed, false, 'DO1', 'profile.deny cannot be overridden by agentProfile.allow')
}

// ─── Extra: Case insensitive ─────────────────────────────────────────────────

console.log('\n── Extra: Case insensitive matching ──')
{
  const ctx: PolicyContext = {
    profile: {
      deniedTools: ['Write_File'], // 大写
    },
  }
  const result = resolvePolicyForTool('write_file', ctx) // 小写
  assertEqual(result.allowed, false, 'CI1', 'case insensitive deny matching')
}

// ─── Extra: resolvePolicyForTool is pure (same input → same output) ──────────

console.log('\n── Extra: Pure function consistency ──')
{
  const ctx: PolicyContext = {
    profile: { deniedTools: ['bash'] },
    providerProfile: { allowedTools: ['read_file'] },
  }
  const r1 = resolvePolicyForTool('bash', ctx)
  const r2 = resolvePolicyForTool('bash', ctx)
  assertEqual(r1.allowed, r2.allowed, 'PF1', 'same input → same allowed')
  assertEqual(r1.decidedBy, r2.decidedBy, 'PF2', 'same input → same decidedBy')
  assertEqual(r1.risk, r2.risk, 'PF3', 'same input → same risk')
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log(`Phase C.3 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
console.log('═'.repeat(80))

if (failed > 0) {
  process.exit(1)
}
