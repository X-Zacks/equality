/**
 * test-dpapi.mjs — 手动测试 DPAPI 加密存储
 *
 * 用法（在 packages/core 目录下）：
 *   pnpm test:dpapi
 *
 * 测试内容：
 *   1. DPAPI 模块是否能加载
 *   2. 加密 / 解密往返正确性
 *   3. setSecret → 写入 settings.json → 读取 settings.json 是否为密文
 *   4. getSecret 能否从密文正确还原
 *   5. 迁移兼容：旧明文值能否被透明读取
 *
 * ⚠️  安全：测试全程使用独立的临时目录，绝不碰 %APPDATA%\Equality\settings.json
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// ─── 使用独立临时目录，完全隔离真实 settings.json ────────────────────────────
const tmpDir = path.join(os.tmpdir(), `equality-dpapi-test-${Date.now()}`)
mkdirSync(tmpDir, { recursive: true })
// 重定向 APPDATA 到临时目录，使 secrets.ts 的 settingsPath() 写到这里
process.env.APPDATA = tmpDir
const settingsFile = path.join(tmpDir, 'Equality', 'settings.json')

console.log(`🔒 测试隔离目录: ${tmpDir}`)
console.log(`   真实 settings.json 不受影响\n`)

// ──────────────────────────────────────────────────────────────────────────────
// 1. 直接测试 DPAPI 原生模块加载
// ──────────────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════')
console.log(' 1. DPAPI 原生模块加载测试')
console.log('═══════════════════════════════════════')

const dpapiNodePath = resolve(
  root,
  'node_modules',
  '@primno',
  'dpapi',
  'prebuilds',
  'win32-x64',
  '@primno+dpapi.node',
)

if (!existsSync(dpapiNodePath)) {
  console.error(`❌ 找不到 .node 文件: ${dpapiNodePath}`)
  console.error('   请先运行: pnpm add @primno/dpapi')
  process.exit(1)
}

let dpapi
try {
  const mod = { exports: {} }
  process.dlopen(mod, dpapiNodePath)
  dpapi = mod.exports
  console.log('✅ DPAPI 加载成功:', dpapiNodePath)
} catch (e) {
  console.error('❌ DPAPI 加载失败:', e.message)
  process.exit(1)
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. 加密 / 解密往返测试
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log(' 2. 加密 / 解密往返测试')
console.log('═══════════════════════════════════════')

const TEST_VALUES = [
  'sk-test1234567890abcdef',
  'https://api.example.com/v1',
  '中文 API Key 测试 🔑',
  'a'.repeat(500),  // 长字符串
]

let allPassed = true
for (const plain of TEST_VALUES) {
  const buf = Buffer.from(plain, 'utf-8')
  const encrypted = dpapi.protectData(buf, null, 'CurrentUser')
  const decrypted = dpapi.unprotectData(Buffer.from(encrypted), null, 'CurrentUser')
  const result = Buffer.from(decrypted).toString('utf-8')
  const ok = result === plain
  console.log(`${ok ? '✅' : '❌'} "${plain.slice(0, 30)}${plain.length > 30 ? '...' : ''}"`)
  if (!ok) {
    console.error(`   期望: ${plain}`)
    console.error(`   实际: ${result}`)
    allPassed = false
  }
}

if (!allPassed) {
  console.error('\n❌ 加密往返测试失败')
  process.exit(1)
}
console.log('\n✅ 所有往返测试通过')

// ──────────────────────────────────────────────────────────────────────────────
// 3. 测试 secrets.ts 的 setSecret / getSecret（通过编译后 JS 测试）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log(' 3. secrets.ts 集成测试（setSecret → 文件 → getSecret）')
console.log('═══════════════════════════════════════')

// 动态 import 编译后的模块（需先 tsc 或通过 tsx 运行）
// 这里直接用 tsx 运行，所以可以直接 import .ts 文件
const { initSecrets, setSecret, getSecret, getStorageMode, deleteSecret } = await import('../src/config/secrets.js').catch(async () => {
  // 如果找不到 .js（未编译），提示
  console.warn('⚠️  找不到编译产物，尝试通过 tsx 加载...')
  return import('../src/config/secrets.ts')
})

console.log('存储模式:', getStorageMode())
if (getStorageMode() !== 'dpapi') {
  console.error('❌ 期望 dpapi 模式，但得到:', getStorageMode())
  process.exit(1)
}
console.log('✅ getStorageMode() === "dpapi"')

// 设置一个测试 key
const TEST_KEY = 'DEEPSEEK_API_KEY'
const TEST_VALUE = 'sk-dpapi-test-' + Date.now()

initSecrets()
setSecret(TEST_KEY, TEST_VALUE)
console.log(`\n✅ setSecret(${TEST_KEY}, "${TEST_VALUE}") 完成`)

// 直接读临时 settings.json，确认是密文
const raw = JSON.parse(readFileSync(settingsFile, 'utf-8'))
const storedValue = raw[TEST_KEY]
console.log(`\n📄 临时 settings.json 中 ${TEST_KEY} 的值:`)
console.log(`   ${storedValue?.slice(0, 80)}...`)

if (!storedValue?.startsWith('dpapi:')) {
  console.error(`❌ 期望以 "dpapi:" 开头的密文，实际为: ${storedValue}`)
  process.exit(1)
}
console.log('✅ 确认为密文格式 (dpapi:<base64>)')

// 通过 getSecret 读回，确认解密正确
const retrieved = getSecret(TEST_KEY)
if (retrieved !== TEST_VALUE) {
  console.error(`❌ getSecret 解密结果不符: 期望 "${TEST_VALUE}", 实际 "${retrieved}"`)
  process.exit(1)
}
console.log(`✅ getSecret(${TEST_KEY}) 解密正确: "${retrieved}"`)

// 清理测试 key
deleteSecret(TEST_KEY)
console.log(`\n🧹 已清理测试 key (${TEST_KEY})`)

// ──────────────────────────────────────────────────────────────────────────────
// 4. 迁移兼容性测试：旧明文值能被透明读取（写到临时文件）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log(' 4. 迁移兼容性（旧明文 → 透明读取）')
console.log('═══════════════════════════════════════')

// 覆写临时目录的 settings.json（不影响真实数据）
const plainData = { DEEPSEEK_API_KEY: 'sk-old-plaintext-value' }
writeFileSync(settingsFile, JSON.stringify(plainData, null, 2), 'utf-8')
console.log('📝 模拟写入旧版明文（临时文件）')

// 重新初始化并读取
initSecrets()
const oldPlain = getSecret('DEEPSEEK_API_KEY')
if (oldPlain !== 'sk-old-plaintext-value') {
  console.error(`❌ 旧明文读取失败: "${oldPlain}"`)
  process.exit(1)
}
console.log(`✅ 旧明文值透明读取成功: "${oldPlain}"`)

// 写回（触发加密迁移）
setSecret('DEEPSEEK_API_KEY', oldPlain)
const afterMigrate = JSON.parse(readFileSync(settingsFile, 'utf-8'))
if (!afterMigrate['DEEPSEEK_API_KEY']?.startsWith('dpapi:')) {
  console.error('❌ 迁移后未加密')
  process.exit(1)
}
console.log('✅ 写回后自动迁移为加密格式')

// ─── 清理临时目录 ──────────────────────────────────────────────────────────
rmSync(tmpDir, { recursive: true, force: true })
console.log(`\n🧹 临时目录已清理: ${tmpDir}`)

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n╔═══════════════════════════════════════╗')
console.log('║  🎉  所有测试通过！                    ║')
console.log('╚═══════════════════════════════════════╝')
console.log('\n✅ 真实 settings.json 未被修改')
