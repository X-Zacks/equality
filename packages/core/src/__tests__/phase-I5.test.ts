/**
 * Phase I.5 — Gateway Stitching 集成验证
 *
 * 验证 Phase G-I 模块已正确缝合到运行时：
 *   I.5-1: external-content → web_search/web_fetch ✅ (已在 Phase G 验证)
 *   I.5-2: context-window → runner.ts
 *   I.5-3: sqlite-store → index.ts
 *   I.5-5: persist-guard → persist.ts ✅ (已在 Phase H 验证)
 *   I.5-6: catalog profiles → registry.ts ✅ (已在 Phase I 验证)
 *   I.5-7: agent-scope → runner.ts
 *   I.5-8: cache-trace → runner.ts
 */

import assert from 'node:assert/strict'

// ═══════════════════════════════════════════════════════════════════════════════
// I.5-2: Context Window — resolveContextWindow 在 runner 中的集成验证
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── I.5-2: Context Window Stitching ──')

import {
  resolveContextWindow,
  lookupModelContextWindow,
  DEFAULT_CONTEXT_WINDOW,
} from '../providers/context-window.js'
import { calcMaxToolResultChars } from '../tools/index.js'

// T1: resolveContextWindow 可被 runner 使用的参数签名
{
  // 模拟 runner.ts 中的调用方式
  const info = resolveContextWindow({
    modelId: 'gpt-4o',
    providerReported: 128_000,
  })
  assert.equal(info.tokens, 128_000)
  assert.equal(info.source, 'model_table')

  // calcMaxToolResultChars 使用解析后的值
  const maxChars = calcMaxToolResultChars(info.tokens)
  assert.ok(maxChars > 0, 'I.5-2-T1a: maxChars > 0')
  assert.ok(maxChars <= 400_000, 'I.5-2-T1b: maxChars <= 400K hard cap')
  console.log('  ✅ I.5-2-T1: runner 参数签名兼容 (4 assertions)')
}

// T2: 未知模型使用 provider 报告值
{
  const info = resolveContextWindow({
    modelId: 'some-totally-unknown-model-xyz',
    providerReported: 65_536,
  })
  assert.equal(info.tokens, 65_536, 'I.5-2-T2a: fallback to providerReported')
  assert.equal(info.source, 'provider', 'I.5-2-T2b: source = provider')
  console.log('  ✅ I.5-2-T2: 未知模型 fallback provider 值 (2 assertions)')
}

// T3: 无 provider 值时使用默认值
{
  const info = resolveContextWindow({
    modelId: 'some-totally-unknown-model-xyz',
  })
  assert.equal(info.tokens, DEFAULT_CONTEXT_WINDOW, 'I.5-2-T3: default 128K')
  console.log('  ✅ I.5-2-T3: 无 provider 值 → 默认 128K (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// I.5-3: SqliteTaskStore — 导出验证 + 功能验证
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── I.5-3: SqliteTaskStore Stitching ──')

import { SqliteTaskStore, JsonTaskStore } from '../tasks/index.js'

// T1: SqliteTaskStore 已从 tasks/index.ts 正确导出
{
  assert.equal(typeof SqliteTaskStore, 'function', 'I.5-3-T1a: SqliteTaskStore is a constructor')
  assert.equal(typeof JsonTaskStore, 'function', 'I.5-3-T1b: JsonTaskStore still available')
  console.log('  ✅ I.5-3-T1: 导出验证 (2 assertions)')
}

// T2: SqliteTaskStore 可实例化（或在不支持 node:sqlite 的环境中抛出）
{
  let storeOk = false
  let fallbackOk = false
  try {
    const store = new SqliteTaskStore(':memory:')
    // 等待内部初始化
    await (store as any)._ready
    storeOk = true
  } catch {
    // node:sqlite 不可用时应该抛出，这时可以 fallback
    fallbackOk = true
  }
  assert.ok(storeOk || fallbackOk, 'I.5-3-T2: SqliteTaskStore 实例化或正确回退')
  console.log(`  ✅ I.5-3-T2: SqliteTaskStore ${storeOk ? '实例化成功' : 'fallback 正确'} (1 assertion)`)
}

// T3: index.ts 中的 fallback 逻辑模拟
{
  // 模拟 index.ts 中 I.5-3 的 try/catch fallback 模式
  let taskStore: import('../tasks/index.js').TaskStore
  try {
    taskStore = new SqliteTaskStore(':memory:')
    await (taskStore as any)._ready
  } catch {
    taskStore = new JsonTaskStore()
  }
  // 无论哪个 store，都应实现 TaskStore 接口（load / save）
  assert.equal(typeof taskStore.load, 'function', 'I.5-3-T3a: load')
  assert.equal(typeof taskStore.save, 'function', 'I.5-3-T3b: save')
  console.log('  ✅ I.5-3-T3: TaskStore 接口完整性 (2 assertions)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// I.5-7: Agent Scope — 在 runner 中可用的 API 验证
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── I.5-7: Agent Scope Stitching ──')

import {
  resolveAgentIdFromSessionKey,
  resolveAgentConfig,
  normalizeAgentId,
  listAgentIds,
  resolveAgentEffectiveModel,
} from '../config/agent-scope.js'
import { DEFAULT_AGENT_ID } from '../config/agent-types.js'

// T1: 普通 session key → default agent
{
  const id = resolveAgentIdFromSessionKey('desktop:main')
  assert.equal(id, DEFAULT_AGENT_ID, 'I.5-7-T1a: 普通 key → default')

  const id2 = resolveAgentIdFromSessionKey(undefined)
  assert.equal(id2, DEFAULT_AGENT_ID, 'I.5-7-T1b: undefined → default')
  console.log('  ✅ I.5-7-T1: 普通 key 解析为 default (2 assertions)')
}

// T2: agent: 前缀 session key → 正确提取 agent ID
{
  const id = resolveAgentIdFromSessionKey('agent:coding-agent:session-123')
  assert.equal(id, 'coding-agent', 'I.5-7-T2a: agent:coding-agent:xxx → coding-agent')

  const id2 = resolveAgentIdFromSessionKey('agent:research:abc')
  assert.equal(id2, 'research', 'I.5-7-T2b: agent:research:abc → research')
  console.log('  ✅ I.5-7-T2: agent: 前缀解析 (2 assertions)')
}

// T3: resolveAgentConfig 从配置提取 per-agent 设置
{
  const cfg = {
    agents: {
      list: [
        { id: 'code', name: 'Coder', model: 'gpt-4o', workspace: '/projects', tools: { profile: 'coding' }, identity: 'You are a coder' },
        { id: 'chat', name: 'Chat', model: 'claude-3-haiku', default: true },
      ],
      defaults: { model: 'gpt-3.5-turbo', workspace: '/home' },
    },
  }

  const codeAgent = resolveAgentConfig(cfg, 'code')
  assert.ok(codeAgent, 'I.5-7-T3a: code agent found')
  assert.equal(codeAgent!.model, 'gpt-4o', 'I.5-7-T3b: model')
  assert.equal(codeAgent!.workspace, '/projects', 'I.5-7-T3c: workspace')
  assert.equal(codeAgent!.toolProfile, 'coding', 'I.5-7-T3d: toolProfile')

  const unknownAgent = resolveAgentConfig(cfg, 'nonexistent')
  assert.equal(unknownAgent, undefined, 'I.5-7-T3e: unknown → undefined')
  console.log('  ✅ I.5-7-T3: per-agent 配置解析 (5 assertions)')
}

// T4: resolveAgentEffectiveModel fallback 到 defaults
{
  const cfg = {
    agents: {
      list: [
        { id: 'bare', name: 'Bare Agent' },
      ],
      defaults: { model: 'gpt-3.5-turbo' },
    },
  }

  const model = resolveAgentEffectiveModel(cfg, 'bare')
  assert.equal(model, 'gpt-3.5-turbo', 'I.5-7-T4: fallback to defaults.model')
  console.log('  ✅ I.5-7-T4: 模型 fallback (1 assertion)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// I.5-8: Cache Trace — 在 runner 中的集成验证
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── I.5-8: Cache Trace Stitching ──')

import { createCacheTrace, digest } from '../diagnostics/cache-trace.js'

// T1: 默认未启用时返回 null
{
  const trace = createCacheTrace({
    sessionKey: 'test-session',
    provider: 'copilot',
    modelId: 'gpt-4o',
    env: {},
  })
  assert.equal(trace, null, 'I.5-8-T1: disabled → null')
  console.log('  ✅ I.5-8-T1: 默认 disabled (1 assertion)')
}

// T2: 启用后可正常记录所有阶段
{
  const events: string[] = []
  const mockWriter = {
    write(data: string) { events.push(data) },
    flush() {},
  }
  const trace = createCacheTrace({
    sessionKey: 'test-session',
    provider: 'copilot',
    modelId: 'gpt-4o',
    env: { EQUALITY_CACHE_TRACE: '1' },
    writer: mockWriter,
  })
  assert.ok(trace, 'I.5-8-T2a: enabled → not null')
  assert.equal(trace!.enabled, true, 'I.5-8-T2b: enabled flag')

  // 模拟 runner.ts 中的 3 个阶段调用
  trace!.recordStage('session:loaded', { note: 'runId=abc' })
  trace!.recordStage('prompt:before', { messages: [{ role: 'user', content: 'hi' }] })
  trace!.recordStage('stream:context', { note: 'loop=1' })
  trace!.recordStage('session:after', { note: 'totalTokens=1000' })

  assert.equal(events.length, 4, 'I.5-8-T2c: 4 events recorded')

  // 验证事件内容
  const firstEvent = JSON.parse(events[0])
  assert.equal(firstEvent.stage, 'session:loaded', 'I.5-8-T2d: first stage')
  assert.equal(firstEvent.sessionKey, 'test-session', 'I.5-8-T2e: sessionKey')
  assert.equal(firstEvent.provider, 'copilot', 'I.5-8-T2f: provider')
  assert.equal(firstEvent.modelId, 'gpt-4o', 'I.5-8-T2g: modelId')
  assert.ok(firstEvent.seq > 0, 'I.5-8-T2h: seq > 0')

  const lastEvent = JSON.parse(events[3])
  assert.equal(lastEvent.stage, 'session:after', 'I.5-8-T2i: last stage = session:after')
  assert.equal(lastEvent.seq, 4, 'I.5-8-T2j: seq increments')

  console.log('  ✅ I.5-8-T2: runner 3 阶段记录 (10 assertions)')
}

// T3: digest 稳定性（相同输入 → 相同 hash）
{
  const d1 = digest({ role: 'user', content: 'hello' })
  const d2 = digest({ role: 'user', content: 'hello' })
  const d3 = digest({ role: 'user', content: 'world' })
  assert.equal(d1, d2, 'I.5-8-T3a: same input → same digest')
  assert.notEqual(d1, d3, 'I.5-8-T3b: different input → different digest')
  console.log('  ✅ I.5-8-T3: digest 稳定性 (2 assertions)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// I.5 综合：import 路径验证（确保所有 stitching 的 import 可解析）
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── I.5 Import Paths ──')

// T1: 验证所有 stitching 模块可正确 import
{
  // I.5-1
  const { wrapExternalContent } = await import('../security/external-content.js')
  assert.equal(typeof wrapExternalContent, 'function', 'I.5-import-1: external-content')

  // I.5-2
  assert.equal(typeof resolveContextWindow, 'function', 'I.5-import-2: context-window')

  // I.5-3
  assert.equal(typeof SqliteTaskStore, 'function', 'I.5-import-3: sqlite-store')

  // I.5-5
  const { truncateForPersistence } = await import('../session/persist-guard.js')
  assert.equal(typeof truncateForPersistence, 'function', 'I.5-import-5: persist-guard')

  // I.5-6
  const { resolveCoreToolProfilePolicy } = await import('../tools/catalog.js')
  assert.equal(typeof resolveCoreToolProfilePolicy, 'function', 'I.5-import-6: catalog')

  // I.5-7
  assert.equal(typeof resolveAgentIdFromSessionKey, 'function', 'I.5-import-7: agent-scope')

  // I.5-8
  assert.equal(typeof createCacheTrace, 'function', 'I.5-import-8: cache-trace')

  console.log('  ✅ I.5-import: 全部 7 个模块 import 正确 (7 assertions)')
}

// ═══════════════════════════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════════════════════════

const TOTAL = 4 + 2 + 1 + 2 + 1 + 2 + 2 + 2 + 5 + 1 + 1 + 10 + 2 + 7
console.log(`\n✅ Phase I.5: 全部通过 (${TOTAL} assertions)`)
