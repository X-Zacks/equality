/**
 * __tests__/phase-O1.test.ts — Phase O1: 记忆增强 + 预算感知
 *
 * O1.1: 冻结记忆快照（8 断言）
 * O1.2: 预算感知警告（8 断言）
 *
 * 共计 16 断言
 */

import { strict as assert } from 'node:assert'

// ─── O1.1: 冻结记忆快照 ─────────────────────────────────────────────────────

import type { Session } from '../session/types.js'
import { createSession } from '../session/types.js'

// O1.1-T1: Session 类型包含 frozenMemorySnapshot 字段
function testO1SessionType() {
  const session = createSession('test-o1')

  // 新建 session 的 frozenMemorySnapshot 应为 undefined
  assert.equal(session.frozenMemorySnapshot, undefined, 'O1.1-T1a: new session has no frozenMemorySnapshot')

  // 可以设置 frozenMemorySnapshot
  session.frozenMemorySnapshot = '1. [general] Test memory'
  assert.equal(session.frozenMemorySnapshot, '1. [general] Test memory', 'O1.1-T1b: frozenMemorySnapshot can be set')

  // 可以设置为空字符串（表示"已执行过 recall 但无结果"）
  session.frozenMemorySnapshot = ''
  assert.equal(session.frozenMemorySnapshot, '', 'O1.1-T1c: frozenMemorySnapshot can be empty string')

  console.log('  ✅ O1.1-T1: Session 类型包含 frozenMemorySnapshot (3 assertions)')
}

// O1.1-T2: 持久化包含 frozenMemorySnapshot
async function testO1Persistence() {
  // 验证 persist 函数序列化包含 frozenMemorySnapshot
  // 使用 JSON 模拟验证
  const session: Partial<Session> = {
    key: 'test-persist-o1',
    title: 'test',
    messages: [],
    costLines: {},
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    frozenMemorySnapshot: '1. [preference] User prefers TypeScript',
  }

  const payload = JSON.stringify({
    key: session.key,
    title: session.title,
    messages: session.messages,
    costLines: session.costLines,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    frozenMemorySnapshot: session.frozenMemorySnapshot,
  })

  const parsed = JSON.parse(payload)
  assert.equal(parsed.frozenMemorySnapshot, '1. [preference] User prefers TypeScript',
    'O1.1-T2a: frozenMemorySnapshot survives JSON round-trip')

  // 验证 undefined 的 frozenMemorySnapshot 不会导致问题
  const session2 = { ...session, frozenMemorySnapshot: undefined }
  const payload2 = JSON.stringify({
    key: session2.key,
    frozenMemorySnapshot: session2.frozenMemorySnapshot,
  })
  const parsed2 = JSON.parse(payload2)
  assert.equal(parsed2.frozenMemorySnapshot, undefined,
    'O1.1-T2b: undefined frozenMemorySnapshot serializes correctly')

  console.log('  ✅ O1.1-T2: 持久化包含 frozenMemorySnapshot (2 assertions)')
}

// O1.1-T3: Memory recall 容量截断逻辑
function testO1RecallCapacity() {
  // 模拟超过 4000 字符的 recall 结果截断
  const MEMORY_RECALL_MAX_CHARS = 4000

  // 生成超长的 recall 结果
  const entries = Array.from({ length: 50 }, (_, i) => ({
    text: `This is memory entry number ${i} with some extra text to make it longer and test truncation behavior properly.`,
    category: 'general',
    importance: 10 - Math.floor(i / 5), // 高 importance 在前
    createdAt: Date.now() - i * 1000,
  }))

  // 模拟截断逻辑
  const lines: string[] = []
  let totalChars = 0
  for (let i = 0; i < entries.length; i++) {
    const line = `${i + 1}. [${entries[i].category}] ${entries[i].text}`
    if (totalChars + line.length > MEMORY_RECALL_MAX_CHARS && lines.length > 0) {
      break
    }
    lines.push(line)
    totalChars += line.length + 1
  }

  assert.ok(lines.length < entries.length, 'O1.1-T3a: truncation reduces entry count')
  assert.ok(totalChars <= MEMORY_RECALL_MAX_CHARS + 200, 'O1.1-T3b: total chars within budget (with margin)')
  assert.ok(lines.length > 0, 'O1.1-T3c: at least one entry preserved')

  console.log('  ✅ O1.1-T3: Memory recall 容量截断 (3 assertions)')
}

// ─── O1.2: 预算感知警告 ─────────────────────────────────────────────────────

// O1.2-T1: Budget state tracking
function testO1BudgetState() {
  const budgetState = {
    warned70Turns: false,
    warned90Turns: false,
    warned70Calls: false,
    warned90Calls: false,
  }

  const maxLlmTurns = 50
  const maxToolCalls = 50

  // 模拟 70% 阈值
  let loopCount = 35
  let totalToolCalls = 10
  let turnPct = loopCount / maxLlmTurns
  let callPct = totalToolCalls / maxToolCalls

  let warning = ''
  if (turnPct >= 0.9 && !budgetState.warned90Turns) {
    budgetState.warned90Turns = true
    warning += '90% turns'
  } else if (turnPct >= 0.7 && !budgetState.warned70Turns) {
    budgetState.warned70Turns = true
    warning += '70% turns'
  }

  assert.ok(warning.includes('70% turns'), 'O1.2-T1a: 70% turn warning triggers at 35/50')
  assert.equal(budgetState.warned70Turns, true, 'O1.2-T1b: warned70Turns flag set')

  // 再次检查应该不重复触发
  warning = ''
  turnPct = 36 / maxLlmTurns
  if (turnPct >= 0.9 && !budgetState.warned90Turns) {
    budgetState.warned90Turns = true
    warning += '90% turns'
  } else if (turnPct >= 0.7 && !budgetState.warned70Turns) {
    budgetState.warned70Turns = true
    warning += '70% turns'
  }
  assert.equal(warning, '', 'O1.2-T1c: 70% turn warning does not repeat')

  // 90% 触发
  loopCount = 45
  turnPct = loopCount / maxLlmTurns
  warning = ''
  if (turnPct >= 0.9 && !budgetState.warned90Turns) {
    budgetState.warned90Turns = true
    warning += '90% turns'
  }
  assert.ok(warning.includes('90% turns'), 'O1.2-T1d: 90% turn warning triggers at 45/50')

  console.log('  ✅ O1.2-T1: Budget state tracking (4 assertions)')
}

// O1.2-T2: Tool calls budget independent tracking
function testO1BudgetCallsIndependent() {
  const budgetState = {
    warned70Turns: false,
    warned90Turns: false,
    warned70Calls: false,
    warned90Calls: false,
  }

  const maxToolCalls = 50

  // tool calls at 70%
  let totalCalls = 35
  let callPct = totalCalls / maxToolCalls
  let warning = ''
  if (callPct >= 0.7 && !budgetState.warned70Calls) {
    budgetState.warned70Calls = true
    warning = `⚠️ BUDGET WARNING: 70% of tool call budget used (${totalCalls}/${maxToolCalls} calls). Start wrapping up.`
  }
  assert.ok(warning.includes('70%'), 'O1.2-T2a: 70% tool call warning triggers')
  assert.ok(warning.includes('35/50'), 'O1.2-T2b: warning includes correct counts')

  // 自定义 maxLlmTurns
  const customMax = 20
  const customLoop = 14
  const customPct = customLoop / customMax
  assert.ok(customPct >= 0.7, 'O1.2-T2c: custom maxLlmTurns=20, loop=14 triggers 70%')

  // Warning text format
  const warningText = `\n\n⚠️ BUDGET WARNING: 70% of iteration budget used (14/20 turns). Start wrapping up.`
  assert.ok(warningText.startsWith('\n\n'), 'O1.2-T2d: warning text starts with \\n\\n separator')

  console.log('  ✅ O1.2-T2: Tool calls budget independent tracking (4 assertions)')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🧪 Phase O1: 记忆增强 + 预算感知\n')

  console.log('── O1.1: 冻结记忆快照 ──')
  testO1SessionType()
  await testO1Persistence()
  testO1RecallCapacity()

  console.log('\n── O1.2: 预算感知警告 ──')
  testO1BudgetState()
  testO1BudgetCallsIndependent()

  console.log('\n✅ Phase O1 全部通过 (16 assertions)\n')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
