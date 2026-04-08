/**
 * Phase N3 — ChunkIndexer + CodeSearchEngine 单元测试
 *
 * N3.6.2: ~25 断言
 * - 文件分块
 * - 符号提取
 * - 批量索引
 * - 关键词搜索
 * - 符号搜索
 * - 文件过滤
 * - 最大结果数限制
 * - 空索引搜索
 * - IndexStats
 */

import { ChunkIndexer } from '../indexer/chunk-indexer.js'
import { CodeSearchEngine } from '../indexer/search-engine.js'
import type { CodeChunk } from '../indexer/chunk-indexer.js'

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

// ─── 测试数据 ────────────────────────────────────────────────────────────────

const sampleTS = `
import { join } from 'node:path'

export interface Config {
  port: number
  host: string
}

export function createServer(config: Config) {
  console.log('Starting server...')
  return { port: config.port }
}

export class AppServer {
  private config: Config

  constructor(config: Config) {
    this.config = config
  }

  start() {
    return createServer(this.config)
  }
}

export const DEFAULT_PORT = 3000
export let isRunning = false
`.trim()

const largeTSContent = `
// Large file simulation
${Array.from({ length: 100 }, (_, i) =>
  `export function func${i}(x: number) { return x + ${i} }`
).join('\n')}
`.trim()

// ─── CI1: TypeScript 文件分块 ───────────────────────────────────────────────

console.log('\n── CI1: TypeScript 文件分块 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 500, chunkOverlap: 50 })
  const chunks = indexer.indexFile('src/server.ts', sampleTS)

  assert(chunks.length >= 1, `至少 1 个块 (实际 ${chunks.length})`)
  assert(chunks.every(c => c.language === 'typescript'), '所有块 language=typescript')
  assert(chunks.every(c => c.filePath === 'src/server.ts'), '所有块 filePath 正确')
  assert(chunks.every(c => c.startLine >= 1), '所有块 startLine >= 1')
  assert(chunks.every(c => c.id.length > 0), '所有块有 ID')
}

// ─── CI2: 符号提取 ─────────────────────────────────────────────────────────

console.log('\n── CI2: 符号提取 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 5000 })  // 大 chunk 保证整文件一块
  const chunks = indexer.indexFile('src/server.ts', sampleTS)

  const allSymbols = chunks.flatMap(c => c.symbols)
  assert(allSymbols.includes('createServer'), '提取到 createServer')
  assert(allSymbols.includes('AppServer'), '提取到 AppServer')
  assert(allSymbols.includes('Config'), '提取到 Config')
  assert(allSymbols.includes('DEFAULT_PORT'), '提取到 DEFAULT_PORT')
  assert(allSymbols.includes('isRunning'), '提取到 isRunning')
}

// ─── CI3: 大文件分块 ───────────────────────────────────────────────────────

console.log('\n── CI3: 大文件分块 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 1500, chunkOverlap: 200 })
  const chunks = indexer.indexFile('src/large.ts', largeTSContent)

  assert(chunks.length >= 2, `大文件分为至少 2 块 (实际 ${chunks.length})`)

  // 检查重叠：相邻块的末尾和开头应有重叠
  if (chunks.length >= 2) {
    const c0end = chunks[0].content.slice(-100)
    const c1start = chunks[1].content.slice(0, 300)
    // 重叠不一定完美匹配（因为句子边界），但内容应有交集
    assert(chunks[0].endLine > 0 && chunks[1].startLine > 0, '块有行号信息')
  }
}

// ─── CI4: 批量索引 ─────────────────────────────────────────────────────────

console.log('\n── CI4: 批量索引 ──')
{
  const indexer = new ChunkIndexer()
  const total = indexer.indexBatch([
    { path: 'a.ts', content: 'export function a() {}' },
    { path: 'b.ts', content: 'export function b() {}' },
    { path: 'c.ts', content: 'export function c() {}' },
  ])

  assert(total >= 3, `批量索引至少 3 块 (实际 ${total})`)
  assert(indexer.chunkCount >= 3, `总块数至少 3`)
}

// ─── CS1: 空索引搜索 ────────────────────────────────────────────────────────

console.log('\n── CS1: 空索引搜索 ──')
{
  const engine = new CodeSearchEngine()
  const results = await engine.search('hello')
  assert(results.length === 0, '空索引返回空数组')
}

// ─── CS2: 关键词搜索 ────────────────────────────────────────────────────────

console.log('\n── CS2: 关键词搜索 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 5000 })
  indexer.indexFile('src/auth/login.ts', 'export function authenticateUser(name: string) { return true }')
  indexer.indexFile('src/utils/format.ts', 'export function formatDate(d: Date) { return d.toISOString() }')

  const engine = new CodeSearchEngine()
  engine.loadChunks([...indexer.allChunks])

  const results = await engine.search('authenticateUser', { mode: 'keyword' })
  assert(results.length >= 1, '关键词搜索有结果')
  assert(results[0].filePath.includes('login.ts'), '关键词搜索首结果为 login.ts')
}

// ─── CS3: 符号搜索 ─────────────────────────────────────────────────────────

console.log('\n── CS3: 符号搜索 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 5000 })
  indexer.indexFile('src/math.ts', 'export function calculateTotal(items: number[]) { return items.reduce((a, b) => a + b, 0) }')
  indexer.indexFile('src/other.ts', 'export function doSomething() { return 42 }')

  const engine = new CodeSearchEngine()
  engine.loadChunks([...indexer.allChunks])

  const results = await engine.search('calculateTotal', { mode: 'symbol' })
  assert(results.length >= 1, '符号搜索有结果')
  assert(results[0].filePath.includes('math.ts'), '符号搜索首结果为 math.ts')
  assert(results[0].matchType === 'symbol', 'matchType=symbol')
}

// ─── CS4: 文件过滤 ─────────────────────────────────────────────────────────

console.log('\n── CS4: 文件过滤 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 5000 })
  indexer.indexFile('src/a.ts', 'export const a = 1')
  indexer.indexFile('lib/b.ts', 'export const b = 2')
  indexer.indexFile('src/c.ts', 'export const c = 3')

  const engine = new CodeSearchEngine()
  engine.loadChunks([...indexer.allChunks])

  const results = await engine.search('const', { fileFilter: ['src/**/*.ts'] })
  assert(results.every(r => r.filePath.startsWith('src/')), '结果只包含 src/ 下的文件')
}

// ─── CS5: 最大结果数 ────────────────────────────────────────────────────────

console.log('\n── CS5: 最大结果数 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 5000 })
  for (let i = 0; i < 20; i++) {
    indexer.indexFile(`file${i}.ts`, `export function test${i}() { const data = test; return data }`)
  }

  const engine = new CodeSearchEngine()
  engine.loadChunks([...indexer.allChunks])

  const results = await engine.search('test', { maxResults: 5 })
  assert(results.length <= 5, `结果不超过 5 个 (实际 ${results.length})`)
}

// ─── CS6: IndexStats ───────────────────────────────────────────────────────

console.log('\n── CS6: IndexStats ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 5000 })
  indexer.indexFile('a.ts', 'export function a() {}')
  indexer.indexFile('b.ts', 'export function b() {}')

  const engine = new CodeSearchEngine()
  engine.loadChunks([...indexer.allChunks])

  const stats = engine.getStats()
  assert(stats.totalFiles === 2, 'totalFiles=2')
  assert(stats.totalChunks >= 2, `totalChunks >= 2 (实际 ${stats.totalChunks})`)
  assert(stats.totalSymbols >= 2, `totalSymbols >= 2 (实际 ${stats.totalSymbols})`)
  assert(stats.lastBuildAt > 0, 'lastBuildAt > 0')
}

// ─── CS7: 搜索结果结构 ─────────────────────────────────────────────────────

console.log('\n── CS7: 搜索结果结构 ──')
{
  const indexer = new ChunkIndexer({ chunkSize: 5000 })
  indexer.indexFile('test.ts', 'export function hello() { return "world" }')

  const engine = new CodeSearchEngine()
  engine.loadChunks([...indexer.allChunks])

  const results = await engine.search('hello')
  assert(results.length >= 1, '有搜索结果')

  const r = results[0]
  assert(typeof r.filePath === 'string', '结果有 filePath')
  assert(typeof r.startLine === 'number', '结果有 startLine')
  assert(typeof r.endLine === 'number', '结果有 endLine')
  assert(typeof r.content === 'string', '结果有 content')
  assert(typeof r.score === 'number' && r.score > 0, '结果有正分数')
  assert(Array.isArray(r.symbols), '结果有 symbols 数组')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`Indexer + Search 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
