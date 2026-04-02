/**
 * __tests__/lsp/run-all.ts
 *
 * Phase B LSP 单元测试 — 统一入口
 *
 * 按顺序运行全部 4 个测试文件（T1-T15）。
 * 任意一组失败则以非零退出码结束。
 *
 * 运行方式：
 *   npx tsx src/__tests__/lsp/run-all.ts
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const suites = [
  'frame-parser.test.ts',
  'client.test.ts',
  'types.test.ts',
  'tools.test.ts',
]

let totalPassed = 0
let totalFailed = 0

for (const suite of suites) {
  const filePath = path.join(__dirname, suite)
  const result = spawnSync(
    process.execPath,  // node
    ['--import', 'tsx/esm', filePath],
    { stdio: 'inherit', env: process.env },
  )
  if (result.status !== 0) {
    totalFailed++
  } else {
    totalPassed++
  }
}

console.log('\n' + '═'.repeat(70))
console.log(`LSP 测试套件总结: ${totalPassed}/${suites.length} 组通过`)
console.log('═'.repeat(70))

if (totalFailed > 0) process.exit(1)
