/**
 * Phase S: Answer Evidence Guard 单元测试
 *
 * 运行：npx tsx src/__tests__/phase-S-evidence-guard.test.ts
 *
 * 测试 detectFactualClaims / hasMatchingEvidence / guardUnverifiedClaims
 */

import assert from 'node:assert/strict'
import { detectFactualClaims, hasMatchingEvidence, guardUnverifiedClaims } from '../agent/runner.js'
import type { EvidenceCategory } from '../agent/runner.js'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}: ${(err as Error).message}`)
    failed++
  }
}

// ─── detectFactualClaims ────────────────────────────────────────────────────

console.log('\n── detectFactualClaims ──')

test('检测"代码已经推送到远端"为 git_status', () => {
  const claims = detectFactualClaims('代码已经推送到远端了')
  assert.ok(claims.has('git_status'))
})

test('检测"已经 commit 到本地"为 git_status', () => {
  const claims = detectFactualClaims('修改已经 commit 到本地仓库')
  assert.ok(claims.has('git_status'))
})

test('检测"尚未推送"为 git_status（否定形式也是断言）', () => {
  const claims = detectFactualClaims('代码尚未推送到远端')
  assert.ok(claims.has('git_status'))
})

test('检测"pushed successfully"为 git_status', () => {
  const claims = detectFactualClaims('Changes pushed to remote successfully')
  assert.ok(claims.has('git_status'))
})

test('检测"编译通过"为 compile_result', () => {
  const claims = detectFactualClaims('编译通过，没有错误')
  assert.ok(claims.has('compile_result'))
})

test('检测"测试全部通过"为 compile_result', () => {
  const claims = detectFactualClaims('测试全部通过了')
  assert.ok(claims.has('compile_result'))
})

test('检测"build succeeded"为 compile_result', () => {
  const claims = detectFactualClaims('The build succeeded with no errors')
  assert.ok(claims.has('compile_result'))
})

test('检测"服务已启动"为 service_status', () => {
  const claims = detectFactualClaims('服务已启动在 3000 端口')
  assert.ok(claims.has('service_status'))
})

test('检测"server is running"为 service_status', () => {
  const claims = detectFactualClaims('The server is running on port 8080')
  assert.ok(claims.has('service_status'))
})

test('不误判"建议你推送到 git"', () => {
  const claims = detectFactualClaims('建议你推送到 git')
  assert.ok(!claims.has('git_status'))
})

test('不误判"我将执行编译"', () => {
  const claims = detectFactualClaims('我将执行编译来验证')
  assert.ok(!claims.has('compile_result'))
})

test('不误判"需要我帮你检查服务状态吗"', () => {
  const claims = detectFactualClaims('需要我帮你检查服务状态吗')
  assert.ok(!claims.has('service_status'))
})

test('纯语言对话无断言', () => {
  const claims = detectFactualClaims('这段代码使用了 React 的 useEffect hook，主要用于处理副作用')
  assert.equal(claims.size, 0)
})

test('技术建议无断言', () => {
  const claims = detectFactualClaims('我推荐你用 TypeScript 而不是 JavaScript')
  assert.equal(claims.size, 0)
})

test('空文本无断言', () => {
  const claims = detectFactualClaims('')
  assert.equal(claims.size, 0)
})

test('同时包含 git_status 和 compile_result', () => {
  const claims = detectFactualClaims('编译通过后，代码已经推送到远端')
  assert.ok(claims.has('git_status'))
  assert.ok(claims.has('compile_result'))
})

// ─── hasMatchingEvidence ────────────────────────────────────────────────────

console.log('\n── hasMatchingEvidence ──')

test('bash + git 命令 → git_status 有证据', () => {
  const claims = new Set<EvidenceCategory>(['git_status'])
  const tools = new Set(['bash'])
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'tc1', type: 'function' as const, function: { name: 'bash', arguments: '{"command":"git status"}' } }],
    },
    { role: 'tool', tool_call_id: 'tc1', content: 'On branch master\nnothing to commit' },
  ]
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.get('git_status'), true)
})

test('bash 无 git 命令 → git_status 无证据', () => {
  const claims = new Set<EvidenceCategory>(['git_status'])
  const tools = new Set(['bash'])
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'tc1', type: 'function' as const, function: { name: 'bash', arguments: '{"command":"ls -la"}' } }],
    },
    { role: 'tool', tool_call_id: 'tc1', content: 'total 16\ndrwxr-xr-x ...' },
  ]
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.get('git_status'), false)
})

test('仅 read_file → file_change 无证据', () => {
  const claims = new Set<EvidenceCategory>(['file_change'])
  const tools = new Set(['read_file'])
  const messages: ChatCompletionMessageParam[] = [
    { role: 'tool', tool_call_id: 'tc1', content: 'file contents...' },
  ]
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.get('file_change'), false)
})

test('write_file → file_change 有证据', () => {
  const claims = new Set<EvidenceCategory>(['file_change'])
  const tools = new Set(['write_file'])
  const messages: ChatCompletionMessageParam[] = []
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.get('file_change'), true)
})

test('bash + tsc → compile_result 有证据', () => {
  const claims = new Set<EvidenceCategory>(['compile_result'])
  const tools = new Set(['bash'])
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'tc1', type: 'function' as const, function: { name: 'bash', arguments: '{"command":"npx tsc --noEmit"}' } }],
    },
    { role: 'tool', tool_call_id: 'tc1', content: '' },
  ]
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.get('compile_result'), true)
})

test('无工具 → 所有类别无证据', () => {
  const claims = new Set<EvidenceCategory>(['git_status', 'compile_result'])
  const tools = new Set<string>()
  const messages: ChatCompletionMessageParam[] = []
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.get('git_status'), false)
  assert.equal(evidence.get('compile_result'), false)
})

test('web_fetch → service_status 有证据', () => {
  const claims = new Set<EvidenceCategory>(['service_status'])
  const tools = new Set(['web_fetch'])
  const messages: ChatCompletionMessageParam[] = []
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.get('service_status'), true)
})

test('空 claims → 空结果', () => {
  const claims = new Set<EvidenceCategory>()
  const tools = new Set(['bash', 'write_file'])
  const messages: ChatCompletionMessageParam[] = []
  const evidence = hasMatchingEvidence(claims, tools, messages)
  assert.equal(evidence.size, 0)
})

// ─── guardUnverifiedClaims ──────────────────────────────────────────────────

console.log('\n── guardUnverifiedClaims ──')

test('无断言时原样输出', () => {
  const text = '这段代码用了 React hooks'
  const result = guardUnverifiedClaims(text, new Set(), [])
  assert.equal(result, text)
})

test('有断言有证据时原样输出', () => {
  const text = '根据检查，代码已经推送到远端'
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'tc1', type: 'function' as const, function: { name: 'bash', arguments: '{"command":"git status"}' } }],
    },
    { role: 'tool', tool_call_id: 'tc1', content: 'On branch master\nYour branch is up to date' },
  ]
  const result = guardUnverifiedClaims(text, new Set(['bash']), messages)
  assert.equal(result, text)
})

test('有断言无证据时追加警告', () => {
  const text = '代码已经推送到远端了'
  const result = guardUnverifiedClaims(text, new Set(), [])
  assert.notEqual(result, text)
  assert.ok(result.includes('⚠️'))
  assert.ok(result.includes('Git 状态'))
  assert.ok(result.includes(text)) // 原文保留
})

test('已被硬性守卫替换的文本不二次处理', () => {
  const text = '⚠️ 我还没有实际调用任何工具执行修改或命令。\n上面的内容只是计划或推测。'
  const result = guardUnverifiedClaims(text, new Set(), [])
  assert.equal(result, text)
})

test('compile_result 断言无证据时追加提示', () => {
  const text = 'tsc 编译通过了，没有类型错误'
  const result = guardUnverifiedClaims(text, new Set(['read_file']), [])
  assert.ok(result.includes('编译/测试结果'))
  assert.ok(result.includes(text)) // 原文保留
})

test('空文本原样返回', () => {
  assert.equal(guardUnverifiedClaims('', new Set(), []), '')
})

// ─── 汇总 ──────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Phase S — Evidence Guard: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)
if (failed > 0) process.exit(1)
