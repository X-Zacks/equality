/**
 * Phase N6 — TranscriptCompact 测试
 *
 * N6.5.2: ~15 断言
 */

import { compactTranscript, needsCompact, DEFAULT_COMPACT_CONFIG } from '../session/transcript-compact.js'
import type { CompactMessage } from '../session/transcript-compact.js'

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

// ─── 辅助 ────────────────────────────────────────────────────────────────────

function makeMessages(count: number, startRole: 'user' | 'system' = 'user'): CompactMessage[] {
  const msgs: CompactMessage[] = []
  if (startRole === 'system') {
    msgs.push({ role: 'system', content: 'You are a helpful assistant.' })
  }
  for (let i = 0; i < count; i++) {
    msgs.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}` })
  }
  return msgs
}

// ─── TC1: 基本 compact ──────────────────────────────────────────────────────

console.log('\n── TC1: 基本 compact ──')
{
  const msgs = makeMessages(35)
  const result = compactTranscript(msgs, { keepLast: 10, compactThreshold: 30 })
  assert(result.length === 10, `保留 10 条 (实际 ${result.length})`)
  assert(result[result.length - 1].content === msgs[msgs.length - 1].content, '最后一条消息一致')
}

// ─── TC2: 保留 system prompt ────────────────────────────────────────────────

console.log('\n── TC2: 保留 system prompt ──')
{
  const msgs = makeMessages(34, 'system')  // 1 system + 34 others = 35
  const result = compactTranscript(msgs, { keepLast: 10, preserveSystemPrompt: true })
  assert(result.length === 11, `system + 10 = 11 条 (实际 ${result.length})`)
  assert(result[0].role === 'system', '第一条是 system')
  assert(result[0].content === 'You are a helpful assistant.', 'system 内容正确')
}

// ─── TC3: 不保留 system prompt ──────────────────────────────────────────────

console.log('\n── TC3: 不保留 system prompt ──')
{
  const msgs = makeMessages(34, 'system')
  const result = compactTranscript(msgs, { keepLast: 10, preserveSystemPrompt: false })
  assert(result.length === 10, `只保留 10 条 (实际 ${result.length})`)
}

// ─── TC4: 消息数不超过 keepLast ────────────────────────────────────────────

console.log('\n── TC4: 消息数不超过 keepLast ──')
{
  const msgs = makeMessages(5)
  const result = compactTranscript(msgs, { keepLast: 10 })
  assert(result.length === 5, `不变 5 条 (实际 ${result.length})`)
}

// ─── TC5: 空消息列表 ───────────────────────────────────────────────────────

console.log('\n── TC5: 空消息 ──')
{
  const result = compactTranscript([])
  assert(result.length === 0, '空数组返回空数组')
}

// ─── TC6: needsCompact 判断 ────────────────────────────────────────────────

console.log('\n── TC6: needsCompact ──')
{
  assert(needsCompact(35) === true, '35 > 30 = 需要 compact')
  assert(needsCompact(30) === false, '30 ≤ 30 = 不需要')
  assert(needsCompact(20) === false, '20 < 30 = 不需要')
  assert(needsCompact(50, { compactThreshold: 40 }) === true, '50 > 40 = 需要')
  assert(needsCompact(10, { compactThreshold: 40 }) === false, '10 < 40 = 不需要')
}

// ─── TC7: 多个 system prompt ────────────────────────────────────────────────

console.log('\n── TC7: 多个 system prompt ──')
{
  const msgs: CompactMessage[] = [
    { role: 'system', content: 'System 1' },
    { role: 'system', content: 'System 2' },
    ...makeMessages(30),
  ]
  const result = compactTranscript(msgs, { keepLast: 5, preserveSystemPrompt: true })
  // 2 system + 5 recent = 7
  assert(result.length === 7, `2 system + 5 = 7 (实际 ${result.length})`)
  assert(result[0].role === 'system', '第一条是 system')
  assert(result[1].role === 'system', '第二条是 system')
}

// ─── TC8: 恰好等于 keepLast ────────────────────────────────────────────────

console.log('\n── TC8: 恰好等于 keepLast ──')
{
  const msgs = makeMessages(10)
  const result = compactTranscript(msgs, { keepLast: 10 })
  assert(result.length === 10, '10 条不变')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`TranscriptCompact 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
