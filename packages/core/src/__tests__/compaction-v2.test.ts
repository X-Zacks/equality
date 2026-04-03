/**
 * Phase D.3 — Compaction 分段压缩测试
 *
 * T13: extractIdentifiers — 提取 UUID
 * T14: extractIdentifiers — 提取文件路径（Windows + Unix）
 * T15: extractIdentifiers — 提取 URL
 * T16: extractIdentifiers — 提取 Git hash
 * T17: validateIdentifiers — 检测缺失标识符
 * T18: splitIntoChunks — 小于阈值 → 不分块
 * T19: splitIntoChunks — 超过阈值 → 分为多块
 * T20: splitIntoChunks — tool_call/tool_result 不拆分
 * T21: buildProtectionPrompt — 标识符注入到 prompt
 * T22: 重试逻辑 — compactIfNeeded 重试+降级
 */

import { extractIdentifiers, validateIdentifiers, buildProtectionPrompt } from '../context/identifier-shield.js'
import { splitIntoChunks, CHUNK_TOKEN_THRESHOLD, MAX_RETRIES, compactIfNeeded } from '../context/compaction.js'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// ─── 测试工具 ─────────────────────────────────────────────────────────────────

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

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`)
  }
}

// ─── 帮助函数 ─────────────────────────────────────────────────────────────────

function makeMsg(role: string, content: string, toolCalls?: boolean): ChatCompletionMessageParam {
  if (role === 'tool') {
    return { role: 'tool', content, tool_call_id: 'tc-' + Math.random().toString(36).slice(2, 6) } as ChatCompletionMessageParam
  }
  if (toolCalls && role === 'assistant') {
    return {
      role: 'assistant',
      content,
      tool_calls: [{ id: 'tc-1', type: 'function' as const, function: { name: 'bash', arguments: '{}' } }],
    } as ChatCompletionMessageParam
  }
  return { role, content } as ChatCompletionMessageParam
}

function repeatChar(ch: string, count: number): string {
  return ch.repeat(count)
}

// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════════════════════')
console.log('Phase D.3 — Compaction 分段压缩测试')
console.log('══════════════════════════════════════════════════════════════════════════\n')

// ─── T13: extractIdentifiers — 提取 UUID ────────────────────────────────────

console.log('── T13: extractIdentifiers — 提取 UUID ──')
{
  const text = '会话 key: a1b2c3d4-e5f6-7890-abcd-ef1234567890，任务正在进行'
  const ids = extractIdentifiers(text)
  assert(ids.some(id => id === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'), 'T13a — UUID 被提取')
  
  const text2 = '两个 UUID: 11111111-2222-3333-4444-555555555555 和 aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const ids2 = extractIdentifiers(text2)
  assert(ids2.length >= 2, `T13b — 提取多个 UUID: got ${ids2.length}`)
}

// ─── T14: extractIdentifiers — 提取文件路径 ─────────────────────────────────

console.log('\n── T14: extractIdentifiers — 提取文件路径 ──')
{
  const text = '修改了 C:\\software\\equality\\packages\\core\\src\\agent\\runner.ts 和 ./src/index.ts'
  const ids = extractIdentifiers(text)
  assert(ids.some(id => id.includes('runner.ts')), 'T14a — Windows 路径被提取')
  assert(ids.some(id => id.includes('./src/index.ts')), 'T14b — Unix 相对路径被提取')
  
  const text2 = '创建了 /home/user/project/main.py'
  const ids2 = extractIdentifiers(text2)
  assert(ids2.some(id => id.includes('/home/user/project/main.py')), 'T14c — Unix 绝对路径被提取')
}

// ─── T15: extractIdentifiers — 提取 URL ─────────────────────────────────────

console.log('\n── T15: extractIdentifiers — 提取 URL ──')
{
  const text = '访问 https://gitlab.xpaas.lenovo.com/tdp-ai/equality.git 获取代码'
  const ids = extractIdentifiers(text)
  assert(ids.some(id => id.includes('https://gitlab.xpaas.lenovo.com')), 'T15a — HTTPS URL 被提取')
  
  const text2 = '配置 http://localhost:18790/chat/stream 端点'
  const ids2 = extractIdentifiers(text2)
  assert(ids2.some(id => id.includes('http://localhost:18790')), 'T15b — HTTP URL 被提取')
}

// ─── T16: extractIdentifiers — 提取 Git hash ────────────────────────────────

console.log('\n── T16: extractIdentifiers — 提取 Git hash ──')
{
  const text = '提交 7cbff7a 合并到 master，基于 c8b9180'
  const ids = extractIdentifiers(text)
  assert(ids.some(id => id === '7cbff7a'), `T16a — 7 位 Git hash 被提取`)
  assert(ids.some(id => id === 'c8b9180'), 'T16b — 第二个 hash 也被提取')
  
  // 长 hash
  const text2 = 'commit aa35fe6d1234567890abcdef1234567890abcdef'
  const ids2 = extractIdentifiers(text2)
  assert(ids2.some(id => id.includes('aa35fe6d')), 'T16c — 长 hash 被提取')
}

// ─── T17: validateIdentifiers — 检测缺失标识符 ──────────────────────────────

console.log('\n── T17: validateIdentifiers — 检测缺失标识符 ──')
{
  const expected = [
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    './src/index.ts',
    'https://example.com/api',
  ]
  const summary1 = '摘要包含 a1b2c3d4-e5f6-7890-abcd-ef1234567890 和 ./src/index.ts'
  const missing1 = validateIdentifiers(summary1, expected)
  assertEqual(missing1.length, 1, 'T17a — 1 个标识符缺失')
  assertEqual(missing1[0], 'https://example.com/api', 'T17b — 缺失的是 URL')
  
  const summary2 = '摘要包含所有: a1b2c3d4-e5f6-7890-abcd-ef1234567890, ./src/index.ts, https://example.com/api'
  const missing2 = validateIdentifiers(summary2, expected)
  assertEqual(missing2.length, 0, 'T17c — 全部保留则无缺失')
  
  const summary3 = '完全不相关的摘要'
  const missing3 = validateIdentifiers(summary3, expected)
  assertEqual(missing3.length, 3, 'T17d — 全部缺失')
}

// ─── T18: splitIntoChunks — 小于阈值 → 不分块 ───────────────────────────────

console.log('\n── T18: splitIntoChunks — 小于阈值不分块 ──')
{
  // 3 条短消息，远低于 4000 tokens
  const msgs: ChatCompletionMessageParam[] = [
    makeMsg('user', '你好'),
    makeMsg('assistant', '你好！有什么可以帮助你的？'),
    makeMsg('user', '帮我写个函数'),
  ]
  const chunks = splitIntoChunks(msgs, CHUNK_TOKEN_THRESHOLD)
  assertEqual(chunks.length, 1, 'T18a — 3 条短消息 → 1 个 chunk')
  assertEqual(chunks[0].length, 3, 'T18b — chunk 包含全部 3 条消息')
}

// ─── T19: splitIntoChunks — 超过阈值 → 分为多块 ─────────────────────────────

console.log('\n── T19: splitIntoChunks — 超过阈值分块 ──')
{
  // 创建大量消息使总 tokens 远超 4000
  const msgs: ChatCompletionMessageParam[] = []
  for (let i = 0; i < 40; i++) {
    msgs.push(makeMsg('user', `问题 ${i}: ` + repeatChar('x', 400)))
    msgs.push(makeMsg('assistant', `回答 ${i}: ` + repeatChar('y', 400)))
  }
  // 80 条消息，每条约 100+ tokens → 总计约 8000+ tokens
  const chunks = splitIntoChunks(msgs, CHUNK_TOKEN_THRESHOLD)
  assert(chunks.length >= 2, `T19a — 大量消息应分为多个 chunk: got ${chunks.length}`)
  
  // 所有消息都应该被包含
  const totalMsgs = chunks.reduce((sum, c) => sum + c.length, 0)
  assertEqual(totalMsgs, 80, 'T19b — 所有消息都包含在 chunks 中')
}

// ─── T20: splitIntoChunks — tool_call/tool_result 不拆分 ─────────────────────

console.log('\n── T20: splitIntoChunks — tool_call/tool_result 不拆分 ──')
{
  // 构造场景：大量消息 + 一对 tool_call/tool_result 在分界点附近
  const msgs: ChatCompletionMessageParam[] = []
  // 先填充大量普通消息
  for (let i = 0; i < 20; i++) {
    msgs.push(makeMsg('user', `问题 ${i}: ` + repeatChar('a', 400)))
    msgs.push(makeMsg('assistant', `回答 ${i}: ` + repeatChar('b', 400)))
  }
  // 加一对 tool_call + tool_result
  msgs.push(makeMsg('assistant', '让我调用工具', true)) // tool_calls
  msgs.push(makeMsg('tool', '工具结果: ' + repeatChar('c', 200)))
  // 再加一些普通消息
  for (let i = 0; i < 10; i++) {
    msgs.push(makeMsg('user', `后续 ${i}: ` + repeatChar('d', 400)))
    msgs.push(makeMsg('assistant', `后续回答 ${i}: ` + repeatChar('e', 400)))
  }
  
  const chunks = splitIntoChunks(msgs, CHUNK_TOKEN_THRESHOLD)
  
  // 验证：没有任何 chunk 以 tool result 开头（如果有，说明 tool_call 被拆分了）
  let toolPairIntact = true
  for (const chunk of chunks) {
    if (chunk.length > 0 && chunk[0].role === 'tool') {
      toolPairIntact = false
      break
    }
  }
  assert(toolPairIntact, 'T20a — 没有 chunk 以 tool result 开头（配对完整）')
  
  // 验证：所有消息都被包含
  const totalMsgs = chunks.reduce((sum, c) => sum + c.length, 0)
  assertEqual(totalMsgs, msgs.length, `T20b — 所有 ${msgs.length} 条消息都包含`)
}

// ─── T21: buildProtectionPrompt — 标识符注入 ─────────────────────────────────

console.log('\n── T21: buildProtectionPrompt — 标识符注入 ──')
{
  const prompt1 = buildProtectionPrompt([])
  assertEqual(prompt1, '', 'T21a — 无标识符时返回空字符串')
  
  const ids = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', './src/index.ts']
  const prompt2 = buildProtectionPrompt(ids)
  assert(prompt2.includes('MUST'), 'T21b — prompt 包含 MUST 指令')
  assert(prompt2.includes('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), 'T21c — prompt 包含 UUID')
  assert(prompt2.includes('./src/index.ts'), 'T21d — prompt 包含路径')
  
  // 超过 50 个标识符应截断
  const manyIds = Array.from({ length: 60 }, (_, i) => `id-${i}`)
  const prompt3 = buildProtectionPrompt(manyIds)
  assert(prompt3.includes('id-49'), 'T21e — 保留前 50 个')
  assert(!prompt3.includes('id-50'), 'T21f — 第 51 个被截断')
}

// ─── T22: 重试逻辑 ──────────────────────────────────────────────────────────

console.log('\n── T22: 重试逻辑 ──')
{
  // 验证 MAX_RETRIES 常量
  assertEqual(MAX_RETRIES, 3, 'T22a — MAX_RETRIES = 3')
  
  // 验证 CHUNK_TOKEN_THRESHOLD 常量
  assertEqual(CHUNK_TOKEN_THRESHOLD, 4000, 'T22b — CHUNK_TOKEN_THRESHOLD = 4000')
  
  // 模拟 compactIfNeeded 不超阈值时不触发
  // 创建一个 mock provider
  let callCount = 0
  const mockProvider = {
    providerId: 'test',
    modelId: 'test-model',
    getCapabilities: () => ({ contextWindow: 100000, supportsTool: true, supportsVision: false, supportsStreaming: true }),
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
    chat: async () => { callCount++; return { content: 'mock summary' } },
    streamChat: async function* () { yield { content: 'mock' } },
  }
  
  const msgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'you are a helper' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ]
  
  callCount = 0
  const result = await compactIfNeeded(msgs, mockProvider as any)
  assertEqual(result.compacted, false, 'T22c — 不超阈值不触发压缩')
  assertEqual(callCount, 0, 'T22d — LLM 未被调用')

  // 模拟超阈值触发压缩（需要大量消息）
  const largeMsgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'system' },
  ]
  // 填充大量消息使 token 超过 contextWindow * 50%
  // contextWindow=100000, 阈值=50000 tokens
  // 每条约 250 tokens (1000 chars / 4)
  for (let i = 0; i < 250; i++) {
    largeMsgs.push({ role: 'user', content: `问题 ${i}: ` + repeatChar('x', 1000) })
    largeMsgs.push({ role: 'assistant', content: `回答 ${i}: ` + repeatChar('y', 1000) })
  }
  
  callCount = 0
  const result2 = await compactIfNeeded(largeMsgs, mockProvider as any)
  assertEqual(result2.compacted, true, 'T22e — 超阈值触发压缩')
  assert(callCount > 0, `T22f — LLM 被调用 ${callCount} 次`)
  assert(result2.removedCount > 0, `T22g — 移除了 ${result2.removedCount} 条消息`)
}

// ─── Extra: extractIdentifiers 边界情况 ──────────────────────────────────────

console.log('\n── Extra: extractIdentifiers 边界 ──')
{
  // 空文本
  const ids0 = extractIdentifiers('')
  assertEqual(ids0.length, 0, 'EI1 — 空文本无标识符')
  
  // 纯中文
  const ids1 = extractIdentifiers('这是一段纯中文文本，没有任何标识符')
  assertEqual(ids1.length, 0, 'EI2 — 纯中文无标识符')
  
  // 混合文本
  const ids2 = extractIdentifiers('提交 c8b9180 修改了 ./src/tools/mutation.ts 访问 https://example.com UUID=11111111-2222-3333-4444-555555555555')
  assert(ids2.length >= 3, `EI3 — 混合文本提取多个标识符: got ${ids2.length}`)
}

// ─── Extra: splitIntoChunks 空输入 ──────────────────────────────────────────

console.log('\n── Extra: splitIntoChunks 边界 ──')
{
  const chunks0 = splitIntoChunks([], CHUNK_TOKEN_THRESHOLD)
  assertEqual(chunks0.length, 0, 'SC1 — 空数组 → 0 chunks')
  
  const chunks1 = splitIntoChunks([makeMsg('user', 'hello')], CHUNK_TOKEN_THRESHOLD)
  assertEqual(chunks1.length, 1, 'SC2 — 单条消息 → 1 chunk')
}

// ─── 结果 ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(74)}`)
console.log(`Phase D.3 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
console.log(`${'═'.repeat(74)}`)

if (failed > 0) process.exit(1)
