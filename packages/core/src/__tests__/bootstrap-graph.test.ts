/**
 * Phase N6 — BootstrapGraph 测试
 *
 * N6.5.1: ~15 断言
 */

import { BootstrapGraph, DEFAULT_BOOTSTRAP_STAGES } from '../bootstrap/bootstrap-graph.js'

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}

// ─── BG1: 初始状态 ──────────────────────────────────────────────────────────

console.log('\n── BG1: 初始状态 ──')
{
  const bg = new BootstrapGraph()
  assert(bg.stages.length === 7, '7 个预定义阶段')
  assert(bg.stages.every(s => s.status === 'pending'), '全部 pending')
  assert(bg.failedStages.length === 0, '无失败阶段')
  assert(bg.isFinished === false, '未完成')
}

// ─── BG2: 正常启动流程 ──────────────────────────────────────────────────────

console.log('\n── BG2: 正常启动 ──')
{
  const bg = new BootstrapGraph()

  for (const stage of DEFAULT_BOOTSTRAP_STAGES) {
    bg.start(stage.name)
    bg.complete(stage.name)
  }

  assert(bg.stages.every(s => s.status === 'completed'), '全部 completed')
  assert(bg.isFinished === true, '已完成')
  assert(bg.failedStages.length === 0, '无失败')

  // 每个阶段都有耗时
  assert(bg.stages.every(s => s.durationMs != null && s.durationMs >= 0), '都有耗时')
}

// ─── BG3: 降级模式 ─────────────────────────────────────────────────────────

console.log('\n── BG3: 降级模式 ──')
{
  const bg = new BootstrapGraph()

  bg.start('prefetch')
  bg.complete('prefetch')
  bg.start('env-guards')
  bg.complete('env-guards')
  bg.start('config-load')
  bg.complete('config-load')
  bg.start('tool-registry')
  bg.complete('tool-registry')
  bg.start('skill-loader')
  bg.complete('skill-loader')

  // code-indexer 失败
  bg.start('code-indexer')
  bg.fail('code-indexer', 'disk full')

  // gateway-ready 仍然可以完成
  bg.start('gateway-ready')
  bg.complete('gateway-ready')

  assert(bg.isFinished === true, '全部终结')
  assert(bg.failedStages.length === 1, '1 个失败')
  assert(bg.failedStages[0] === 'code-indexer', '失败的是 code-indexer')
  assert(bg.degradedFeatures.includes('codebase_search'), '降级功能包含 codebase_search')

  // 确认 gateway-ready 是 completed
  const gateway = bg.stages.find(s => s.name === 'gateway-ready')
  assert(gateway?.status === 'completed', 'gateway-ready 仍 completed')
}

// ─── BG4: Markdown 报告 ────────────────────────────────────────────────────

console.log('\n── BG4: Markdown 报告 ──')
{
  const bg = new BootstrapGraph()
  bg.start('prefetch')
  bg.complete('prefetch')
  bg.start('env-guards')
  bg.fail('env-guards', 'Node version too old')

  const md = bg.toMarkdown()
  assert(md.includes('# Bootstrap Report'), '包含标题')
  assert(md.includes('prefetch'), '包含 prefetch')
  assert(md.includes('Node version too old'), '包含错误信息')
}

// ─── BG5: 结构化日志 ───────────────────────────────────────────────────────

console.log('\n── BG5: 结构化日志 ──')
{
  const bg = new BootstrapGraph()
  bg.start('tool-registry')
  bg.complete('tool-registry')

  const logs = bg.toLogLines()
  assert(logs.length >= 1, '至少 1 条日志')
  assert(logs.some(l => l.includes('[bootstrap] tool-registry completed')), '包含 tool-registry completed')
}

// ─── BG6: JSON 序列化 ──────────────────────────────────────────────────────

console.log('\n── BG6: JSON 序列化 ──')
{
  const bg = new BootstrapGraph()
  bg.start('prefetch')
  bg.complete('prefetch')

  const json = bg.toJSON()
  assert(json.stages.length === 7, 'JSON 有 7 个阶段')
  assert(typeof json.totalDurationMs === 'number', 'totalDurationMs 是数字')
  assert(Array.isArray(json.failedStages), 'failedStages 是数组')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`BootstrapGraph 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
