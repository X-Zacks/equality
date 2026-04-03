/**
 * __tests__/interactive.test.ts — Phase F1 交互式载荷测试
 *
 * 运行：npx tsx src/__tests__/interactive.test.ts
 */

import assert from 'node:assert/strict'
import {
  parseInteractiveBlocks,
  formatInteractiveReply,
  parseInteractiveReply,
} from '../agent/interactive.js'

// ─── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${message}`)
    failed++
  }
}

// ─── parseInteractiveBlocks ───────────────────────────────────────────────────

console.log('── T45: 单个 interactive 块解析 ──')
{
  const text = `这是普通文本

:::interactive
{
  "elements": [
    { "type": "text", "content": "选择方案：" },
    { "type": "button", "actionId": "plan-a", "label": "方案 A", "style": "primary" },
    { "type": "button", "actionId": "plan-b", "label": "方案 B", "style": "secondary" }
  ]
}
:::

后面的文字`

  const { cleaned, payloads } = parseInteractiveBlocks(text)
  ok(payloads.length === 1, `解析出 1 个载荷 (实际 ${payloads.length})`)
  ok(payloads[0].elements.length === 3, `载荷包含 3 个元素 (实际 ${payloads[0]?.elements?.length})`)
  ok(payloads[0].elements[0].type === 'text', '第一个元素是 text')
  ok(payloads[0].elements[1].type === 'button', '第二个元素是 button')
  ok((payloads[0].elements[1] as any).actionId === 'plan-a', 'button actionId 正确')
  ok((payloads[0].elements[1] as any).style === 'primary', 'button style 正确')
  ok(cleaned.includes('这是普通文本'), 'cleaned 保留前面的文本')
  ok(cleaned.includes('后面的文字'), 'cleaned 保留后面的文本')
  ok(!cleaned.includes(':::interactive'), 'cleaned 不含 interactive 块')
}

console.log('\n── T46: 多个 interactive 块 ──')
{
  const text = `第一段

:::interactive
{ "elements": [{ "type": "button", "actionId": "a", "label": "A" }] }
:::

中间文字

:::interactive
{ "elements": [{ "type": "select", "actionId": "region", "options": [{"label": "US", "value": "us"}, {"label": "CN", "value": "cn"}] }] }
:::

结尾`

  const { cleaned, payloads } = parseInteractiveBlocks(text)
  ok(payloads.length === 2, `解析出 2 个载荷 (实际 ${payloads.length})`)
  ok(payloads[0].elements[0].type === 'button', '第一个载荷是 button')
  ok(payloads[1].elements[0].type === 'select', '第二个载荷是 select')
  ok((payloads[1].elements[0] as any).options.length === 2, 'select 有 2 个选项')
  ok(cleaned.includes('第一段'), 'cleaned 保留第一段')
  ok(cleaned.includes('中间文字'), 'cleaned 保留中间文字')
  ok(cleaned.includes('结尾'), 'cleaned 保留结尾')
}

console.log('\n── T47: 无 interactive 块 ──')
{
  const text = '纯文本消息，没有交互元素'
  const { cleaned, payloads } = parseInteractiveBlocks(text)
  ok(payloads.length === 0, '无载荷')
  ok(cleaned === text, 'cleaned 等于原文')
}

console.log('\n── T48: 无效 JSON → 保留原文 ──')
{
  const text = `开头

:::interactive
{ invalid json here
:::

结尾`

  const { cleaned, payloads } = parseInteractiveBlocks(text)
  ok(payloads.length === 0, '无载荷 (JSON 无效)')
  ok(cleaned.includes(':::interactive'), 'cleaned 保留无效块原文')
  ok(cleaned.includes('invalid json here'), 'cleaned 保留无效 JSON')
}

console.log('\n── T49: 无效载荷结构 → 保留原文 ──')
{
  const text = `开头

:::interactive
{ "notElements": [1, 2, 3] }
:::

结尾`

  const { cleaned, payloads } = parseInteractiveBlocks(text)
  ok(payloads.length === 0, '无载荷 (结构无效)')
  ok(cleaned.includes(':::interactive'), 'cleaned 保留无效块原文')
}

console.log('\n── T50: 元素类型验证 ──')
{
  // 缺少 label 的 button → 无效
  const text = `:::interactive
{ "elements": [{ "type": "button", "actionId": "x" }] }
:::`

  const { payloads } = parseInteractiveBlocks(text)
  ok(payloads.length === 0, '缺少 label 的 button → 无效')
}
{
  // 缺少 options 的 select → 无效
  const text2 = `:::interactive
{ "elements": [{ "type": "select", "actionId": "x" }] }
:::`

  const { payloads: p2 } = parseInteractiveBlocks(text2)
  ok(p2.length === 0, '缺少 options 的 select → 无效')
}
{
  // 未知 type → 无效
  const text3 = `:::interactive
{ "elements": [{ "type": "slider", "value": 50 }] }
:::`

  const { payloads: p3 } = parseInteractiveBlocks(text3)
  ok(p3.length === 0, '未知 type → 无效')
}

// ─── formatInteractiveReply ───────────────────────────────────────────────────

console.log('\n── T51: formatInteractiveReply ──')
{
  const reply = formatInteractiveReply('plan-a', 'clicked')
  ok(reply === '__interactive_reply__:plan-a:clicked', 'button reply 格式正确')

  const reply2 = formatInteractiveReply('region', 'us-east-1')
  ok(reply2 === '__interactive_reply__:region:us-east-1', 'select reply 格式正确')
}

// ─── parseInteractiveReply ────────────────────────────────────────────────────

console.log('\n── T52: parseInteractiveReply ──')
{
  const r1 = parseInteractiveReply('__interactive_reply__:plan-a:clicked')
  ok(r1 !== null, '解析成功')
  ok(r1!.actionId === 'plan-a', 'actionId 正确')
  ok(r1!.value === 'clicked', 'value 正确')

  const r2 = parseInteractiveReply('__interactive_reply__:region:us-east-1')
  ok(r2 !== null, '带连字符的 value 解析成功')
  ok(r2!.actionId === 'region', 'actionId 正确')
  ok(r2!.value === 'us-east-1', 'value 正确')

  const r3 = parseInteractiveReply('普通用户消息')
  ok(r3 === null, '非交互消息 → null')

  const r4 = parseInteractiveReply('__interactive_reply__:')
  ok(r4 === null, '空 actionId → null')

  const r5 = parseInteractiveReply('')
  ok(r5 === null, '空字符串 → null')
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Phase F1 — Interactive Payload: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)
if (failed > 0) process.exit(1)
