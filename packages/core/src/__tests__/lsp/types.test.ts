/**
 * __tests__/lsp/types.test.ts
 *
 * Phase B 单元测试 — 类型工具函数 (T11-T13)
 *
 * T11: detectLanguageId('.ts') → 'typescript'
 * T12: detectLanguageId('.py') → 'python'
 * T13: detectLanguageId('.xyz') → 'plaintext'（未知扩展）
 *
 * 运行方式：
 *   npx tsx src/__tests__/lsp/types.test.ts
 */

import { detectLanguageId, detectLanguage, pathToFileUri, fileUriToPath } from '../../tools/lsp/types.js'

// ─── 简易测试框架 ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const errors: string[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`  ✗ ${name}`)
    console.log(`      ${msg}`)
    errors.push(`${name}: ${msg}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, label = ''): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`${label ? label + ': ' : ''}expected ${e}, got ${a}`)
  }
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70))
console.log('Phase B — 类型工具测试 (T11-T13 + 附加)')
console.log('═'.repeat(70) + '\n')

// ── T11：TypeScript 文件识别 ──────────────────────────────────────────────────
test('T11: detectLanguageId("foo.ts") → "typescript"', () => {
  assertEqual(detectLanguageId('foo.ts'), 'typescript')
})

test('T11b: detectLanguageId("foo.tsx") → "typescriptreact"', () => {
  assertEqual(detectLanguageId('foo.tsx'), 'typescriptreact')
})

test('T11c: detectLanguageId("foo.js") → "javascript"', () => {
  assertEqual(detectLanguageId('foo.js'), 'javascript')
})

test('T11d: detectLanguageId("foo.jsx") → "javascriptreact"', () => {
  assertEqual(detectLanguageId('foo.jsx'), 'javascriptreact')
})

// ── T12：Python 文件识别 ──────────────────────────────────────────────────────
test('T12: detectLanguageId("bar.py") → "python"', () => {
  assertEqual(detectLanguageId('bar.py'), 'python')
})

test('T12b: detectLanguageId("bar.pyi") → "python"', () => {
  assertEqual(detectLanguageId('bar.pyi'), 'python')
})

// ── T13：未知扩展名 ───────────────────────────────────────────────────────────
test('T13: detectLanguageId("foo.xyz") → "plaintext"', () => {
  assertEqual(detectLanguageId('foo.xyz'), 'plaintext')
})

test('T13b: detectLanguageId("Makefile") (无扩展名) → "plaintext"', () => {
  assertEqual(detectLanguageId('Makefile'), 'plaintext')
})

// ── 附加：detectLanguage（返回语言 key 而非 languageId） ─────────────────────
test('detectLanguage("src/index.ts") → "typescript"', () => {
  assertEqual(detectLanguage('src/index.ts'), 'typescript')
})

test('detectLanguage("script.py") → "python"', () => {
  assertEqual(detectLanguage('script.py'), 'python')
})

test('detectLanguage("main.go") → "go"', () => {
  assertEqual(detectLanguage('main.go'), 'go')
})

test('detectLanguage("README.md") → null', () => {
  assertEqual(detectLanguage('README.md'), null)
})

// ── 附加：pathToFileUri / fileUriToPath（路径转换） ───────────────────────────
test('pathToFileUri Unix 路径', () => {
  // 在 Windows 下直接测逻辑即可
  const uri = pathToFileUri('/foo/bar.ts')
  if (!uri.startsWith('file://')) throw new Error(`期望以 file:// 开头，got: ${uri}`)
})

test('fileUriToPath 往返转换（Unix）', () => {
  const orig = '/foo/bar/baz.ts'
  // 只在非 Windows 上做严格比较
  const uri = pathToFileUri(orig)
  const back = fileUriToPath(uri)
  if (process.platform !== 'win32') {
    assertEqual(back, orig, 'round-trip')
  } else {
    // Windows 下 orig 不含盘符，跳过严格比较
    if (!back.includes('foo')) throw new Error(`fileUriToPath 结果异常: ${back}`)
  }
})

// ─── 汇总 ────────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70))
console.log(`类型工具测试: ${passed} passed, ${failed} failed`)
if (errors.length > 0) {
  console.log('\n失败详情:')
  for (const e of errors) console.log(`  • ${e}`)
}
console.log('─'.repeat(70))

if (failed > 0) process.exit(1)
