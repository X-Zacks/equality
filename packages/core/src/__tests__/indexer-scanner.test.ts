/**
 * Phase N3 — FileScanner 单元测试
 *
 * N3.6.1: ~25 断言
 * - 全量扫描
 * - 大文件跳过
 * - 增量扫描
 * - ProjectManifest 生成
 * - include/exclude 过滤
 */

import { FileScanner } from '../indexer/file-scanner.js'
import type { ScanResult } from '../indexer/file-scanner.js'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

// ─── 测试目录准备 ────────────────────────────────────────────────────────────

const testDir = join(tmpdir(), `equality-scanner-test-${Date.now()}`)

function setupTestDir(): void {
  mkdirSync(testDir, { recursive: true })
  mkdirSync(join(testDir, 'src'), { recursive: true })
  mkdirSync(join(testDir, 'src', 'utils'), { recursive: true })
  mkdirSync(join(testDir, 'node_modules', 'pkg'), { recursive: true })
  mkdirSync(join(testDir, 'dist'), { recursive: true })

  // 源文件
  writeFileSync(join(testDir, 'src', 'index.ts'), 'export function main() { return 1 }')
  writeFileSync(join(testDir, 'src', 'app.tsx'), 'export function App() { return <div/> }')
  writeFileSync(join(testDir, 'src', 'utils', 'math.ts'), 'export function add(a: number, b: number) { return a + b }')
  writeFileSync(join(testDir, 'src', 'style.css'), 'body { margin: 0 }')
  writeFileSync(join(testDir, 'README.md'), '# Test Project')
  writeFileSync(join(testDir, 'package.json'), '{ "name": "test" }')

  // node_modules（应被排除）
  writeFileSync(join(testDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}')

  // dist（应被排除）
  writeFileSync(join(testDir, 'dist', 'bundle.js'), 'var a = 1')

  // 大文件
  writeFileSync(join(testDir, 'src', 'big.ts'), 'x'.repeat(200_000))
}

function cleanupTestDir(): void {
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

setupTestDir()

// ─── FS1: 全量扫描 ─────────────────────────────────────────────────────────

console.log('\n── FS1: 全量扫描 ──')
{
  const scanner = new FileScanner({ rootDir: testDir })
  const result = scanner.scanAll()

  // 排除 node_modules, dist, 大文件
  assert(result.indexedFiles.length >= 5, `索引文件数 >= 5 (实际 ${result.indexedFiles.length})`)
  assert(result.indexedFiles.length <= 7, `索引文件数 <= 7 (实际 ${result.indexedFiles.length})`)

  // 检查排除
  const indexedPaths = result.indexedFiles.map(f => f.relativePath)
  assert(!indexedPaths.some(p => p.includes('node_modules')), 'node_modules 被排除')
  assert(!indexedPaths.some(p => p.includes('dist')), 'dist 被排除')

  // 检查包含
  assert(indexedPaths.some(p => p.includes('index.ts')), '包含 index.ts')
  assert(indexedPaths.some(p => p.includes('app.tsx')), '包含 app.tsx')
  assert(indexedPaths.some(p => p.includes('math.ts')), '包含 math.ts')
  assert(indexedPaths.some(p => p.includes('README.md')), '包含 README.md')

  assert(result.durationMs >= 0, '扫描耗时 >= 0')
}

// ─── FS2: 大文件跳过 ────────────────────────────────────────────────────────

console.log('\n── FS2: 大文件跳过 ──')
{
  const scanner = new FileScanner({ rootDir: testDir })
  const result = scanner.scanAll()

  const bigFile = result.skippedFiles.find(f => f.includes('big.ts'))
  assert(bigFile !== undefined, '大文件 big.ts 被跳过')

  const reason = result.skippedReasons.get(bigFile!)
  assert(reason === 'file_too_large', '跳过原因为 file_too_large')
}

// ─── FS3: 增量扫描 ─────────────────────────────────────────────────────────

console.log('\n── FS3: 增量扫描 ──')
{
  const scanner = new FileScanner({ rootDir: testDir })
  scanner.scanAll()  // 先全量

  // 修改一个文件
  writeFileSync(join(testDir, 'src', 'index.ts'), 'export function main() { return 2 }')

  const incResult = scanner.scanIncremental(['src/index.ts', 'src/utils/math.ts'])

  assert(incResult.indexedFiles.length === 2, '增量扫描索引 2 个文件')
  assert(incResult.indexedFiles.some(f => f.relativePath.includes('index.ts')), '包含 index.ts')
  assert(incResult.indexedFiles.some(f => f.relativePath.includes('math.ts')), '包含 math.ts')
}

// ─── FS4: 增量扫描——不存在的文件 ────────────────────────────────────────────

console.log('\n── FS4: 增量扫描——不存在的文件 ──')
{
  const scanner = new FileScanner({ rootDir: testDir })
  scanner.scanAll()

  const incResult = scanner.scanIncremental(['src/nonexistent.ts'])

  assert(incResult.indexedFiles.length === 0, '不存在文件不被索引')
  assert(incResult.skippedFiles.length === 1, '跳过 1 个文件')
  assert(incResult.skippedReasons.get('src/nonexistent.ts') === 'file_not_found', '原因为 file_not_found')
}

// ─── FS5: ProjectManifest 生成 ──────────────────────────────────────────────

console.log('\n── FS5: ProjectManifest ──')
{
  const scanner = new FileScanner({ rootDir: testDir })
  scanner.scanAll()

  const manifest = scanner.getManifest()
  assert(manifest !== null, 'getManifest() 非 null')
  assert(manifest!.rootDir === testDir, 'rootDir 正确')
  assert(manifest!.totalFiles >= 5, `totalFiles >= 5 (实际 ${manifest!.totalFiles})`)
  assert(manifest!.lastScanAt > 0, 'lastScanAt > 0')

  // 检查 filesByExtension
  assert(manifest!.filesByExtension['.ts'] >= 2, '.ts 文件至少 2 个')
  assert(manifest!.filesByExtension['.md'] >= 1, '.md 文件至少 1 个')

  // 检查 topLevelModules
  assert(manifest!.topLevelModules.some(m => m.name === 'src'), '有 src 模块')
  assert(manifest!.topLevelModules.every(m => m.fileCount > 0), '每个模块 fileCount > 0')
}

// ─── FS6: 自定义 maxTotalFiles ──────────────────────────────────────────────

console.log('\n── FS6: maxTotalFiles 限制 ──')
{
  const scanner = new FileScanner({ rootDir: testDir, maxTotalFiles: 2 })
  const result = scanner.scanAll()

  assert(result.indexedFiles.length <= 2, `文件数不超过 2 (实际 ${result.indexedFiles.length})`)
}

// ─── FS7: 初始 manifest 为 null ────────────────────────────────────────────

console.log('\n── FS7: 初始 manifest 为 null ──')
{
  const scanner = new FileScanner({ rootDir: testDir })
  assert(scanner.getManifest() === null, '扫描前 manifest 为 null')
}

// ─── 清理 ────────────────────────────────────────────────────────────────────

cleanupTestDir()

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`FileScanner 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
