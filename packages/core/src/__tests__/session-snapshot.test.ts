/**
 * Phase N6 — SessionSnapshot 测试
 *
 * N6.5.3: ~15 断言
 */

import {
  captureSnapshot,
  restoreFromSnapshot,
  isValidSnapshot,
} from '../session/session-snapshot.js'
import type { SessionSnapshot, SessionData } from '../session/session-snapshot.js'

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

// ─── 测试数据 ────────────────────────────────────────────────────────────────

const sampleSession: SessionData = {
  key: 'agent:main:desktop:default:direct:test-123',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: '帮我写一个排序算法' },
    { role: 'assistant', content: '好的，这是冒泡排序...' },
    { role: 'user', content: '用快速排序' },
    { role: 'assistant', content: '好的，快速排序如下...' },
    { role: 'user', content: '加上测试' },
    { role: 'assistant', content: '测试代码...' },
  ],
  toolCalls: ['read_file', 'write_file', 'bash', 'read_file'],
  tokenUsage: { input: 5000, output: 3000 },
}

// ─── SS1: 快照捕获 ─────────────────────────────────────────────────────────

console.log('\n── SS1: 快照捕获 ──')
{
  const snap = captureSnapshot(sampleSession)

  assert(snap.sessionKey === sampleSession.key, 'sessionKey 正确')
  assert(snap.prompt === '加上测试', 'prompt 取最后一条 user 消息')
  assert(snap.turnCount === 3, `turnCount=3 (实际 ${snap.turnCount})`)
  assert(snap.tokenUsage.input === 5000, 'input tokens 正确')
  assert(snap.tokenUsage.output === 3000, 'output tokens 正确')
  assert(snap.persistedAt > 0, 'persistedAt > 0')
  assert(snap.persistedAt <= Date.now(), 'persistedAt <= now')

  // toolsUsed 应去重
  assert(snap.toolsUsed.length === 3, `toolsUsed 去重后 3 个 (实际 ${snap.toolsUsed.length})`)
  assert(snap.toolsUsed.includes('read_file'), '包含 read_file')
  assert(snap.toolsUsed.includes('write_file'), '包含 write_file')
  assert(snap.toolsUsed.includes('bash'), '包含 bash')
}

// ─── SS2: 带额外信息捕获 ───────────────────────────────────────────────────

console.log('\n── SS2: 带 extras 捕获 ──')
{
  const snap = captureSnapshot(sampleSession, {
    manifest: {
      rootDir: '/test',
      totalFiles: 50,
      filesByExtension: { '.ts': 30 },
      topLevelModules: [{ name: 'src', fileCount: 30 }],
      lastScanAt: Date.now(),
    },
    historyLog: [
      { timestamp: Date.now(), title: 'Plan started', detail: 'N1' },
    ],
  })

  assert(snap.manifest !== undefined, 'manifest 存在')
  assert(snap.manifest!.totalFiles === 50, 'manifest totalFiles=50')
  assert(snap.historyLog !== undefined, 'historyLog 存在')
  assert(snap.historyLog!.length === 1, 'historyLog 有 1 条')
}

// ─── SS3: 快照恢复 ─────────────────────────────────────────────────────────

console.log('\n── SS3: 恢复 ──')
{
  const snap = captureSnapshot(sampleSession)
  const restored = restoreFromSnapshot(snap)

  assert(restored.key === sampleSession.key, '恢复的 key 一致')
  assert(restored.tokenUsage?.input === 5000, 'token 恢复正确')
  assert(restored.toolCalls?.length === 3, 'toolCalls 恢复正确')
}

// ─── SS4: JSON 序列化往返 ──────────────────────────────────────────────────

console.log('\n── SS4: JSON 往返 ──')
{
  const snap = captureSnapshot(sampleSession)
  const json = JSON.stringify(snap)
  const parsed = JSON.parse(json) as SessionSnapshot

  assert(parsed.sessionKey === snap.sessionKey, 'sessionKey 一致')
  assert(parsed.prompt === snap.prompt, 'prompt 一致')
  assert(parsed.turnCount === snap.turnCount, 'turnCount 一致')
  assert(typeof parsed.persistedAt === 'number', 'persistedAt 是 number')
  assert(parsed.tokenUsage.input === snap.tokenUsage.input, 'tokenUsage 一致')
}

// ─── SS5: isValidSnapshot ──────────────────────────────────────────────────

console.log('\n── SS5: 验证 ──')
{
  const snap = captureSnapshot(sampleSession)
  assert(isValidSnapshot(snap) === true, '有效快照返回 true')
  assert(isValidSnapshot({}) === false, '空对象返回 false')
  assert(isValidSnapshot(null) === false, 'null 返回 false')
  assert(isValidSnapshot({ sessionKey: 'x', prompt: 'y' }) === false, '缺少字段返回 false')
}

// ─── SS6: 空 session ───────────────────────────────────────────────────────

console.log('\n── SS6: 空 session ──')
{
  const emptySession: SessionData = {
    key: 'test:empty',
    messages: [],
  }
  const snap = captureSnapshot(emptySession)
  assert(snap.prompt === '', '空 session prompt 为空')
  assert(snap.turnCount === 0, 'turnCount=0')
  assert(snap.toolsUsed.length === 0, 'toolsUsed 为空')
  assert(snap.tokenUsage.input === 0, 'input=0')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`SessionSnapshot 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
