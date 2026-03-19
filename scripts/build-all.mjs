/**
 * scripts/build-all.mjs — 一键构建 Windows 安装包
 *
 * 步骤：
 *   Step 1: Core SEA 构建（packages/core → dist/equality-core.exe + dist/better-sqlite3.node）
 *   Step 2: 将 Core 产物复制到 Tauri resources 目录
 *   Step 3: 前端构建（packages/desktop → dist/）
 *   Step 4: Tauri 构建（cargo tauri build）
 *
 * 输出：packages/desktop/src-tauri/target/release/bundle/nsis/*.exe
 *
 * 用法：node scripts/build-all.mjs
 */

import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkEnv } from './check-env.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── 环境检查与自动安装 ────────────────────────────────────────────────────────
checkEnv()
const root = resolve(__dirname, '..')
const coreDir = resolve(root, 'packages', 'core')
const desktopDir = resolve(root, 'packages', 'desktop')
const resourcesDir = resolve(desktopDir, 'src-tauri', 'resources')

function run(cmd, opts = {}) {
  console.log(`\n>>> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts })
}

// ─── Step 1: Core SEA ─────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log(' Step 1: Core SEA 构建')
console.log('═══════════════════════════════════════')
run('node scripts/build-sea.mjs', { cwd: coreDir })

// ─── Step 2: 复制 Core 产物到 Tauri resources ─────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log(' Step 2: 复制 Core 产物 → Tauri resources')
console.log('═══════════════════════════════════════')

mkdirSync(resourcesDir, { recursive: true })

const coreExe = resolve(coreDir, 'dist', 'equality-core.exe')
const sqliteNode = resolve(coreDir, 'dist', 'better-sqlite3.node')
const dpapiNode = resolve(coreDir, 'dist', '@primno+dpapi.node')

if (!existsSync(coreExe)) {
  console.error(`\n❌ 找不到 ${coreExe}`)
  process.exit(1)
}
if (!existsSync(sqliteNode)) {
  console.error(`\n❌ 找不到 ${sqliteNode}`)
  process.exit(1)
}

copyFileSync(coreExe, resolve(resourcesDir, 'equality-core.exe'))
copyFileSync(sqliteNode, resolve(resourcesDir, 'better-sqlite3.node'))
console.log(`✅ 已复制 equality-core.exe → src-tauri/resources/`)
console.log(`✅ 已复制 better-sqlite3.node → src-tauri/resources/`)

// 复制 @primno+dpapi.node（可选，非 Windows 构建环境可能没有此文件）
if (existsSync(dpapiNode)) {
  copyFileSync(dpapiNode, resolve(resourcesDir, '@primno+dpapi.node'))
  console.log(`✅ 已复制 @primno+dpapi.node → src-tauri/resources/`)
} else {
  console.warn(`⚠️ 未找到 ${dpapiNode}，跳过（非 Windows 导致）`)
}

// 复制 bundled skills 目录
const skillsSrc = resolve(coreDir, 'skills')
const skillsDst = resolve(resourcesDir, 'skills')
if (existsSync(skillsSrc)) {
  // 递归复制 skills/ 目录
  const { cpSync } = await import('node:fs')
  cpSync(skillsSrc, skillsDst, { recursive: true })
  console.log(`✅ 已复制 skills/ → src-tauri/resources/skills/`)
} else {
  console.warn(`⚠️ 未找到 ${skillsSrc}，跳过 skills 复制`)
}

// ─── Step 3: 前端构建 ─────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log(' Step 3: 前端构建 (vite build)')
console.log('═══════════════════════════════════════')
run('pnpm --filter @equality/desktop build')

// ─── Step 4: Tauri 构建 ───────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log(' Step 4: Tauri 构建 (cargo tauri build)')
console.log('═══════════════════════════════════════')

// 临时向 tauri.conf.json 注入 bundle.resources，构建后还原
const tauriConfPath = resolve(desktopDir, 'src-tauri', 'tauri.conf.json')
const tauriConfOriginal = readFileSync(tauriConfPath, 'utf-8')
const tauriConf = JSON.parse(tauriConfOriginal)
// 动态构建 resources 映射（包含 skills 子目录下所有文件）
const resourcesMap = {
  'resources/equality-core.exe': 'resources/equality-core.exe',
  'resources/better-sqlite3.node': 'resources/better-sqlite3.node',
}
// @primno+dpapi.node 可选（Windows 专用）
const dpapiResource = resolve(resourcesDir, '@primno+dpapi.node')
if (existsSync(dpapiResource)) {
  resourcesMap['resources/@primno+dpapi.node'] = 'resources/@primno+dpapi.node'
}
// 将 skills/ 目录整体映射
const skillsResourceDir = resolve(resourcesDir, 'skills')
if (existsSync(skillsResourceDir)) {
  const { readdirSync, statSync } = await import('node:fs')
  function collectFiles(dir, base) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${item.name}` : item.name
      const full = resolve(dir, item.name)
      if (statSync(full).isDirectory()) {
        collectFiles(full, rel)
      } else {
        resourcesMap[`resources/skills/${rel}`] = `resources/skills/${rel}`
      }
    }
  }
  collectFiles(skillsResourceDir, '')
}
tauriConf.bundle.resources = resourcesMap
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2))
try {
  run('pnpm --filter @equality/desktop build:installer')
} finally {
  // 无论成功失败都还原 tauri.conf.json
  writeFileSync(tauriConfPath, tauriConfOriginal)
  console.log('\n✅ tauri.conf.json 已还原')
}

// ─── 完成 ─────────────────────────────────────────────────────────────────────
const nsisDir = resolve(desktopDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
console.log('\n╔═══════════════════════════════════════╗')
console.log('║  ✅  构建完成！                        ║')
console.log('╚═══════════════════════════════════════╝')
console.log(`\n安装包位于：`)
console.log(`  ${nsisDir}\\`)
console.log('\n📦 便携版请继续运行：  node scripts/build-portable.mjs')
