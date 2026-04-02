/**
 * __tests__/mutation.test.ts — Phase C.1 写操作精确识别测试
 *
 * 运行方式：
 *   npx tsx src/__tests__/mutation.test.ts
 *
 * 覆盖 13 个测试用例 (T1-T13)：
 * - T1-T2: 静态工具分类
 * - T3-T8: 动态 bash 命令分类（Unix/PowerShell/复合命令/包管理器/不确定）
 * - T9-T10: 动态 process 动作分类
 * - T11-T12: 操作指纹一致性和稳定性
 * - T13: 未知工具保守估计
 */

import {
  classifyMutation,
  MutationType,
  extractFingerprint,
  isMutatingOperation,
  extractCommandWords,
} from '../tools/mutation.js'

// ─── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, testId: string, message: string): void {
  if (condition) {
    console.log(`  ✅ ${testId} — ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${testId} — ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, testId: string, message: string): void {
  if (actual === expected) {
    console.log(`  ✅ ${testId} — ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${testId} — ${message}`)
    console.error(`     expected: ${JSON.stringify(expected)}`)
    console.error(`     actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log('Phase C.1 — Mutation Classification Tests')
console.log('═'.repeat(80))

// ── T1: write_file → WRITE, confidence=static ──
console.log('\n── T1: Static tool — write_file → WRITE ──')
{
  const result = classifyMutation('write_file', { file_path: '/tmp/test.txt', content: 'hello' })
  assertEqual(result.type, MutationType.WRITE, 'T1a', 'write_file is WRITE')
  assertEqual(result.confidence, 'static', 'T1b', 'confidence is static')
}

// ── T2: read_file → READ, confidence=static ──
console.log('\n── T2: Static tool — read_file → READ ──')
{
  const result = classifyMutation('read_file', { file_path: '/src/index.ts' })
  assertEqual(result.type, MutationType.READ, 'T2a', 'read_file is READ')
  assertEqual(result.confidence, 'static', 'T2b', 'confidence is static')
}

// ── T3: bash "ls -la" → READ, confidence=heuristic ──
console.log('\n── T3: Bash read command — "ls -la" → READ ──')
{
  const result = classifyMutation('bash', { command: 'ls -la' })
  assertEqual(result.type, MutationType.READ, 'T3a', 'bash "ls -la" is READ')
  assertEqual(result.confidence, 'heuristic', 'T3b', 'confidence is heuristic')
}

// ── T4: bash "rm -rf ./build" → WRITE ──
console.log('\n── T4: Bash write command — "rm -rf ./build" → WRITE ──')
{
  const result = classifyMutation('bash', { command: 'rm -rf ./build' })
  assertEqual(result.type, MutationType.WRITE, 'T4', 'bash "rm -rf ./build" is WRITE')
}

// ── T5: bash compound command "cat file | grep foo && rm temp" → WRITE ──
console.log('\n── T5: Bash compound command — "cat file | grep foo && rm temp" → WRITE ──')
{
  const result = classifyMutation('bash', { command: 'cat file | grep foo && rm temp' })
  assertEqual(result.type, MutationType.WRITE, 'T5', 'compound command with rm is WRITE (worst wins)')
}

// ── T6: bash "npm install lodash" → WRITE (package manager) ──
console.log('\n── T6: Bash package manager — "npm install lodash" → WRITE ──')
{
  const result = classifyMutation('bash', { command: 'npm install lodash' })
  assertEqual(result.type, MutationType.WRITE, 'T6', 'npm install is WRITE')
}

// ── T7: bash "python3 script.py" → EXEC (unknown → conservative) ──
console.log('\n── T7: Bash unknown command — "python3 script.py" → EXEC ──')
{
  const result = classifyMutation('bash', { command: 'python3 script.py' })
  assertEqual(result.type, MutationType.EXEC, 'T7a', 'python3 is unknown → EXEC')
  assertEqual(result.confidence, 'heuristic', 'T7b', 'confidence is heuristic')
}

// ── T8: bash "Remove-Item ./temp" → WRITE (PowerShell cmdlet) ──
console.log('\n── T8: Bash PowerShell cmdlet — "Remove-Item ./temp" → WRITE ──')
{
  const result = classifyMutation('bash', { command: 'Remove-Item ./temp' })
  assertEqual(result.type, MutationType.WRITE, 'T8', 'Remove-Item is WRITE (PowerShell)')
}

// ── T9: process "list" → READ ──
console.log('\n── T9: Process action — "list" → READ ──')
{
  const result = classifyMutation('process', { action: 'list' })
  assertEqual(result.type, MutationType.READ, 'T9', 'process "list" is READ')
}

// ── T10: process "kill" → WRITE ──
console.log('\n── T10: Process action — "kill" → WRITE ──')
{
  const result = classifyMutation('process', { action: 'kill', pid: 12345 })
  assertEqual(result.type, MutationType.WRITE, 'T10', 'process "kill" is WRITE')
}

// ── T11: Fingerprint consistency (same params → same hash) ──
console.log('\n── T11: Fingerprint consistency ──')
{
  const fp1 = extractFingerprint('write_file', { file_path: '/src/index.ts', content: 'hello' })
  const fp2 = extractFingerprint('write_file', { file_path: '/src/index.ts', content: 'hello' })
  assertEqual(fp1.hash, fp2.hash, 'T11', 'same params produce same hash')
}

// ── T12: Fingerprint stability (param order doesn't affect hash) ──
console.log('\n── T12: Fingerprint stability ──')
{
  const fp1 = extractFingerprint('bash', { command: 'ls -la' })
  const fp2 = extractFingerprint('bash', { command: 'ls -la' })
  assertEqual(fp1.hash, fp2.hash, 'T12a', 'same command produces same hash')

  // 多个目标：顺序不影响
  const fp3 = extractFingerprint('write_file', { file_path: '/a.ts', source: '/b.ts' })
  const fp4 = extractFingerprint('write_file', { source: '/b.ts', file_path: '/a.ts' })
  assertEqual(fp3.hash, fp4.hash, 'T12b', 'target order does not affect hash')
}

// ── T13: Unknown tool → EXEC (conservative) ──
console.log('\n── T13: Unknown tool → EXEC ──')
{
  const result = classifyMutation('totally_unknown_tool', { foo: 'bar' })
  assertEqual(result.type, MutationType.EXEC, 'T13a', 'unknown tool is EXEC')
  assertEqual(result.confidence, 'heuristic', 'T13b', 'confidence is heuristic')
}

// ─── Extra coverage: isMutatingOperation convenience function ─────────────

console.log('\n── Extra: isMutatingOperation convenience ──')
{
  assert(isMutatingOperation('write_file') === true, 'E1', 'write_file is mutating')
  assert(isMutatingOperation('read_file') === false, 'E2', 'read_file is not mutating')
  assert(isMutatingOperation('bash', { command: 'ls' }) === false, 'E3', 'bash ls is not mutating')
  assert(isMutatingOperation('bash', { command: 'rm foo' }) === true, 'E4', 'bash rm is mutating')
}

// ─── Extra coverage: extractCommandWords ──────────────────────────────────

console.log('\n── Extra: extractCommandWords parser ──')
{
  const w1 = extractCommandWords('cat file | grep foo && rm temp')
  assert(w1.length === 3, 'CW1', `compound: got ${w1.length} words [${w1.join(', ')}]`)
  assertEqual(w1[0], 'cat', 'CW1a', 'first word is cat')
  assertEqual(w1[1], 'grep', 'CW1b', 'second word is grep')
  assertEqual(w1[2], 'rm', 'CW1c', 'third word is rm')

  // env var prefix: should be skipped
  const w2 = extractCommandWords('NODE_ENV=production node server.js')
  assert(w2.length === 1, 'CW2', `env prefix: got ${w2.length} words [${w2.join(', ')}]`)
  assertEqual(w2[0], 'node', 'CW2a', 'skips env var assignment')

  // sudo prefix
  const w3 = extractCommandWords('sudo rm -rf /tmp/test')
  assertEqual(w3[0], 'rm', 'CW3', 'skips sudo prefix')

  // semicolon separator
  const w4 = extractCommandWords('echo hello; rm temp')
  assert(w4.length === 2, 'CW4', `semicolon: got ${w4.length} words [${w4.join(', ')}]`)
}

// ─── Extra coverage: static tools comprehensive ───────────────────────────

console.log('\n── Extra: Comprehensive static tool checks ──')
{
  assertEqual(classifyMutation('edit_file').type, MutationType.WRITE, 'S1', 'edit_file → WRITE')
  assertEqual(classifyMutation('apply_patch').type, MutationType.WRITE, 'S2', 'apply_patch → WRITE')
  assertEqual(classifyMutation('glob').type, MutationType.READ, 'S3', 'glob → READ')
  assertEqual(classifyMutation('grep').type, MutationType.READ, 'S4', 'grep → READ')
  assertEqual(classifyMutation('list_dir').type, MutationType.READ, 'S5', 'list_dir → READ')
  assertEqual(classifyMutation('web_fetch').type, MutationType.READ, 'S6', 'web_fetch → READ')
  assertEqual(classifyMutation('web_search').type, MutationType.READ, 'S7', 'web_search → READ')
  assertEqual(classifyMutation('memory_save').type, MutationType.WRITE, 'S8', 'memory_save → WRITE')
  assertEqual(classifyMutation('memory_search').type, MutationType.READ, 'S9', 'memory_search → READ')
  assertEqual(classifyMutation('cron').type, MutationType.EXEC, 'S10', 'cron → EXEC')
  assertEqual(classifyMutation('browser').type, MutationType.EXEC, 'S11', 'browser → EXEC')
  assertEqual(classifyMutation('lsp_hover').type, MutationType.READ, 'S12', 'lsp_hover → READ')
  assertEqual(classifyMutation('lsp_definition').type, MutationType.READ, 'S13', 'lsp_definition → READ')
  assertEqual(classifyMutation('lsp_references').type, MutationType.READ, 'S14', 'lsp_references → READ')
  assertEqual(classifyMutation('lsp_diagnostics').type, MutationType.READ, 'S15', 'lsp_diagnostics → READ')
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log(`Phase C.1 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
console.log('═'.repeat(80))

if (failed > 0) {
  process.exit(1)
}
