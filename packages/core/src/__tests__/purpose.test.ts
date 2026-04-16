/**
 * __tests__/purpose.test.ts — Session Purpose 测试
 *
 * P1: inferPurpose 各场景
 * P2: formatPurposeBlock
 *
 * 共计 15 断言
 */

import { strict as assert } from 'node:assert'
import { inferPurpose, formatPurposeBlock, type SessionPurpose } from '../agent/purpose.js'

// ── P1: inferPurpose ──

function testInferCodeTask() {
  const result = inferPurpose('帮我修复 login 页面的 bug')
  assert.ok(result, 'P1-T1a: should return purpose')
  assert.ok(result!.goal.includes('修复'), 'P1-T1b: goal contains task keyword')
  assert.equal(result!.source, 'inferred', 'P1-T1c: source is inferred')
  console.log('  ✅ P1-T1: 代码任务推断 (3 assertions)')
}

function testInferCasualChat() {
  assert.equal(inferPurpose('你好'), undefined, 'P1-T2a: greeting → undefined')
  assert.equal(inferPurpose('hi'), undefined, 'P1-T2b: hi → undefined')
  assert.equal(inferPurpose('hello!'), undefined, 'P1-T2c: hello → undefined')
  console.log('  ✅ P1-T2: 闲聊不设 purpose (3 assertions)')
}

function testInferTooShort() {
  assert.equal(inferPurpose('ok'), undefined, 'P1-T3a: too short → undefined')
  assert.equal(inferPurpose(''), undefined, 'P1-T3b: empty → undefined')
  console.log('  ✅ P1-T3: 极短消息 (2 assertions)')
}

function testInferWithConstraints() {
  const result = inferPurpose('请用英文简洁地帮我写一个 REST API')
  assert.ok(result, 'P1-T4a: should return purpose')
  assert.ok(result!.constraints?.includes('用英文回复'), 'P1-T4b: english constraint')
  assert.ok(result!.constraints?.includes('简洁回复'), 'P1-T4c: concise constraint')
  console.log('  ✅ P1-T4: 带约束推断 (3 assertions)')
}

function testInferPrefixStrip() {
  const result = inferPurpose('请帮我重构 auth 模块')
  assert.ok(result, 'P1-T5a: should return purpose')
  assert.ok(result!.goal.includes('重构 auth 模块'), 'P1-T5b: prefix stripped, core goal preserved')
  console.log('  ✅ P1-T5: 前缀去除 (2 assertions)')
}

// ── P2: formatPurposeBlock ──

function testFormatEmpty() {
  assert.equal(formatPurposeBlock(undefined), '', 'P2-T1a: undefined → empty')
  console.log('  ✅ P2-T1: 无 purpose 返回空 (1 assertion)')
}

function testFormatWithPurpose() {
  const purpose: SessionPurpose = {
    goal: '重构 auth 模块',
    constraints: ['简洁回复', '用英文回复'],
    source: 'inferred',
  }
  const block = formatPurposeBlock(purpose)
  assert.ok(block.includes('<session-purpose>'), 'P2-T2a: has open tag')
  assert.ok(block.includes('目标：重构 auth 模块'), 'P2-T2b: has goal')
  assert.ok(block.includes('约束：简洁回复'), 'P2-T2c: has constraint')
  assert.ok(block.includes('</session-purpose>'), 'P2-T2d: has close tag')
  console.log('  ✅ P2-T2: 完整格式化 (4 assertions)')
}

// ── Runner ──

async function run() {
  console.log('\n🧪 Purpose Tests')
  console.log('─'.repeat(50))

  testInferCodeTask()
  testInferCasualChat()
  testInferTooShort()
  testInferWithConstraints()
  testInferPrefixStrip()
  testFormatEmpty()
  testFormatWithPurpose()

  console.log('─'.repeat(50))
  console.log('✅ All purpose tests passed (18 assertions)\n')
}

run().catch(err => {
  console.error('❌ Purpose test failed:', err)
  process.exit(1)
})
