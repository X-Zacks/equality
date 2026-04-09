/**
 * __tests__/phase-O4.test.ts — Phase O4: 历史会话搜索
 *
 * O4.1: session-search.db 数据库操作（7 断言）
 * O4.2: session_search 工具定义（4 断言）
 * O4.3: system prompt 搜索指引（3 断言）
 *
 * 共计 14 断言
 */

import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ─── O4.1: session-search.db 数据库操作 ─────────────────────────────────────

// 为了测试，我们需要让 search-db 使用临时目录
// 通过设置 APPDATA 环境变量实现
let tempDir: string
let originalAppData: string | undefined

async function setupTemp() {
  tempDir = await mkdtemp(join(tmpdir(), 'equality-o4-'))
  originalAppData = process.env.APPDATA
  process.env.APPDATA = tempDir
}

async function cleanupTemp() {
  process.env.APPDATA = originalAppData
  // 先关闭数据库再删除
  const { closeSearchDb } = await import('../session/search-db.js')
  closeSearchDb()
  try {
    await rm(tempDir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

async function testO4Database() {
  await setupTemp()

  try {
    // 动态 import 以使用新的 APPDATA
    // 注意：因为 singleton，需要在 setupTemp 后首次导入
    const { indexTurn, searchSessions, deleteSessionIndex, getIndexStats, closeSearchDb } =
      await import('../session/search-db.js')

    // T1: 初始化数据库
    const stats0 = getIndexStats()
    assert.equal(stats0.totalTurns, 0, 'O4.1-T1a: empty DB has 0 turns')

    // T2: 写入索引
    indexTurn('session-1', 0, 'user', '帮我部署到 k8s 集群')
    indexTurn('session-1', 1, 'assistant', '好的，我来帮你部署到 k8s 集群。首先检查集群状态。')
    indexTurn('session-2', 0, 'user', '修复 React 组件的 bug')
    indexTurn('session-2', 1, 'assistant', '我来看看这个 React 组件的问题。')

    const stats1 = getIndexStats()
    assert.equal(stats1.totalTurns, 4, 'O4.1-T2a: 4 turns indexed')
    assert.equal(stats1.totalSessions, 2, 'O4.1-T2b: 2 sessions indexed')

    // T3: FTS5 搜索
    const results = searchSessions('k8s 部署')
    assert.ok(results.length > 0, 'O4.1-T3a: search returns results for "k8s 部署"')
    assert.equal(results[0].sessionKey, 'session-1', 'O4.1-T3b: correct session found')

    // T4: 无结果搜索
    const emptyResults = searchSessions('量子计算')
    assert.equal(emptyResults.length, 0, 'O4.1-T4a: no results for "量子计算"')

    // T5: 删除会话索引
    const deleted = deleteSessionIndex('session-1')
    assert.equal(deleted, 2, 'O4.1-T5a: 2 records deleted from session-1')

    console.log('  ✅ O4.1: session-search.db 数据库操作 (7 assertions)')
  } finally {
    await cleanupTemp()
  }
}

// ─── O4.2: session_search 工具定义 ──────────────────────────────────────────

async function testO4ToolDefinition() {
  const { sessionSearchTool } = await import('../tools/builtins/session-search.js')

  assert.equal(sessionSearchTool.name, 'session_search', 'O4.2-T1a: tool name is session_search')
  assert.ok(sessionSearchTool.description.includes('Search past conversation'),
    'O4.2-T1b: description mentions searching past conversations')
  assert.ok(sessionSearchTool.inputSchema.required?.includes('query'),
    'O4.2-T1c: query is required parameter')

  // 验证工具已注册到 builtins
  const { builtinTools } = await import('../tools/builtins/index.js')
  const found = builtinTools.find(t => t.name === 'session_search')
  assert.ok(found, 'O4.2-T1d: session_search is registered in builtinTools')

  console.log('  ✅ O4.2: session_search 工具定义 (4 assertions)')
}

// ─── O4.3: system prompt 搜索指引 ───────────────────────────────────────────

async function testO4SystemPromptGuidance() {
  const { buildSystemPrompt } = await import('../agent/system-prompt.js')

  const prompt = buildSystemPrompt()

  assert.ok(prompt.includes('session_search'), 'O4.3-T1a: system prompt mentions session_search')
  assert.ok(prompt.includes('上次') || prompt.includes('之前'),
    'O4.3-T1b: guidance includes temporal trigger words')
  assert.ok(prompt.includes('历史会话搜索'),
    'O4.3-T1c: system prompt has history search section')

  console.log('  ✅ O4.3: system prompt 搜索指引 (3 assertions)')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🧪 Phase O4: 历史会话搜索\n')

  console.log('── O4.1: session-search.db 数据库操作 ──')
  await testO4Database()

  console.log('\n── O4.2: session_search 工具定义 ──')
  await testO4ToolDefinition()

  console.log('\n── O4.3: system prompt 搜索指引 ──')
  await testO4SystemPromptGuidance()

  console.log('\n✅ Phase O4 全部通过 (14 assertions)\n')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
