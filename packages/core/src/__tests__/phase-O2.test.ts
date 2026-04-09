/**
 * __tests__/phase-O2.test.ts — Phase O2: 上下文压缩
 *
 * O2.1: shouldCompress 决策逻辑（7 断言）
 * O2.2: 压缩配置（3 断言）
 * O2.3: 压缩流水线辅助逻辑（5 断言）
 *
 * 共计 15 断言
 */

import { strict as assert } from 'node:assert'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

import {
  shouldCompress,
  getCompressThresholdPercent,
  getCompressThresholdMessages,
  getCompressRecentKeep,
} from '../context/compressor.js'

// ─── O2.1: shouldCompress 决策逻辑 ──────────────────────────────────────────

// O2.1-T1: token% 触发
function testO2TokenTrigger() {
  // 制造大量消息让 token 占比超过 50%
  const bigContent = 'A'.repeat(200_000) // 约 50K tokens（200K chars / 4）
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: bigContent },
  ]

  // context window = 128K tokens → 50K/128K ≈ 39% → 不触发
  // 但如果 context window = 80K → 50K/80K = 62.5% → 触发
  const decision = shouldCompress(messages, 80_000)
  assert.equal(decision.shouldCompress, true, 'O2.1-T1a: token% >= 50% triggers compression')
  assert.equal(decision.reason, 'token_percent', 'O2.1-T1b: reason is token_percent')

  console.log('  ✅ O2.1-T1: token% 触发 (2 assertions)')
}

// O2.1-T2: 消息数触发
function testO2MessageCountTrigger() {
  // 30 条短消息，token 很少
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a helper.' },
  ]
  for (let i = 0; i < 31; i++) {
    messages.push({ role: 'user', content: `msg ${i}` })
  }

  const decision = shouldCompress(messages, 128_000)
  assert.equal(decision.shouldCompress, true, 'O2.1-T2a: message count >= 30 triggers')
  assert.equal(decision.reason, 'message_count', 'O2.1-T2b: reason is message_count')

  console.log('  ✅ O2.1-T2: 消息数触发 (2 assertions)')
}

// O2.1-T3: 均不触发
function testO2NoTrigger() {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a helper.' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' },
  ]

  const decision = shouldCompress(messages, 128_000)
  assert.equal(decision.shouldCompress, false, 'O2.1-T3a: no trigger when both below threshold')
  assert.equal(decision.reason, 'none', 'O2.1-T3b: reason is none')

  console.log('  ✅ O2.1-T3: 均不触发 (2 assertions)')
}

// O2.1-T4: token% 优先于消息数
function testO2TokenPriority() {
  // 超过 30 条消息 AND 超过 50% token → 应返回 token_percent（先检查的）
  const bigContent = 'B'.repeat(300_000)
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'System' },
    { role: 'user', content: bigContent },
  ]
  for (let i = 0; i < 35; i++) {
    messages.push({ role: 'user', content: `msg ${i}` })
  }

  const decision = shouldCompress(messages, 80_000)
  assert.equal(decision.reason, 'token_percent', 'O2.1-T4a: token_percent takes priority')

  console.log('  ✅ O2.1-T4: token% 优先 (1 assertion)')
}

// ─── O2.2: 压缩配置 ─────────────────────────────────────────────────────────

function testO2Config() {
  // 默认值
  assert.equal(getCompressThresholdPercent(), 0.50, 'O2.2-T1a: default threshold percent is 0.50')
  assert.equal(getCompressThresholdMessages(), 30, 'O2.2-T1b: default threshold messages is 30')
  assert.equal(getCompressRecentKeep(), 6, 'O2.2-T1c: default recent keep is 6')

  console.log('  ✅ O2.2-T1: 默认配置 (3 assertions)')
}

// ─── O2.3: 压缩流水线辅助逻辑 ───────────────────────────────────────────────

function testO2PipelineHelpers() {
  // Step 1: recent 区划分逻辑
  const recentKeep = 6
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'msg1' },
    { role: 'assistant', content: 'reply1' },
    { role: 'user', content: 'msg2' },
    { role: 'assistant', content: 'reply2' },
    { role: 'user', content: 'msg3' },
    { role: 'assistant', content: 'reply3' },
    { role: 'user', content: 'msg4' },
    { role: 'assistant', content: 'reply4' },
    { role: 'user', content: 'msg5' },    // 10
    { role: 'assistant', content: 'reply5' },
    { role: 'user', content: 'msg6' },    // 12
    { role: 'assistant', content: 'reply6' },
  ]

  // recent 区: 最后 6 条 = index 7..12
  let recentStart = messages.length - recentKeep
  recentStart = Math.max(1, recentStart)
  const oldRegion = messages.slice(1, recentStart)
  const recentRegion = messages.slice(recentStart)

  assert.equal(recentRegion.length, recentKeep, 'O2.3-T1a: recent region has correct size')
  assert.equal(oldRegion.length, messages.length - 1 - recentKeep, 'O2.3-T1b: old region is remaining msgs')

  // Step 2: tool name 提取
  const toolMessages: ChatCompletionMessageParam[] = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'tc1', type: 'function' as const, function: { name: 'bash', arguments: '{}' } },
        { id: 'tc2', type: 'function' as const, function: { name: 'read_file', arguments: '{}' } },
      ],
    },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'tc3', type: 'function' as const, function: { name: 'bash', arguments: '{}' } },
      ],
    },
  ]
  const toolNames = new Set<string>()
  for (const msg of toolMessages) {
    if ('tool_calls' in msg && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if ('function' in tc && tc.function?.name) {
          toolNames.add(tc.function.name)
        }
      }
    }
  }
  assert.equal(toolNames.size, 2, 'O2.3-T1c: unique tool names extracted')
  assert.ok(toolNames.has('bash'), 'O2.3-T1d: bash found')
  assert.ok(toolNames.has('read_file'), 'O2.3-T1e: read_file found')

  console.log('  ✅ O2.3-T1: 压缩流水线辅助逻辑 (5 assertions)')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🧪 Phase O2: 上下文压缩\n')

  console.log('── O2.1: shouldCompress 决策逻辑 ──')
  testO2TokenTrigger()
  testO2MessageCountTrigger()
  testO2NoTrigger()
  testO2TokenPriority()

  console.log('\n── O2.2: 压缩配置 ──')
  testO2Config()

  console.log('\n── O2.3: 压缩流水线辅助逻辑 ──')
  testO2PipelineHelpers()

  console.log('\n✅ Phase O2 全部通过 (15 assertions)\n')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
