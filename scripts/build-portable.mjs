/**
 * scripts/build-portable.mjs — 构建 Portable 便携版 zip
 *
 * 前提：已运行 build-all.mjs（Tauri release 产物已存在）
 *
 * 输出：dist/Equality-portable-{version}.zip
 * zip 结构（平铺，用户只需双击 Equality.exe）：
 *   Equality-portable-{version}/
 *   ├── Equality.exe          ← 用户只需双击这个
 *   ├── equality-core.exe     ← 由主程序自动启动，用户无需关心
 *   └── better-sqlite3.node   ← 数据库原生模块，用户无需关心
 *
 * 用法：node scripts/build-portable.mjs
 */

import { execSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkEnv } from './check-env.mjs'

// ─── 环境检查与自动安装 ────────────────────────────────────────────────────────
checkEnv()

// ─── 构建逻辑 ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const desktopDir = resolve(root, 'packages', 'desktop')
const releaseDir = resolve(desktopDir, 'src-tauri', 'target', 'release')
const resourcesDir = resolve(desktopDir, 'src-tauri', 'resources')

// 读取版本号
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
const version = pkg.version ?? '0.1.0'

// 校验产物存在（Cargo package name 为 equality，产物为 equality.exe）
const equalityExe = resolve(releaseDir, 'equality.exe')
if (!existsSync(equalityExe)) {
  console.error(`\n❌ 找不到 ${equalityExe}`)
  console.error('   请先运行 node scripts/build-all.mjs')
  process.exit(1)
}

// 构建临时目录结构（平铺，所有文件在同一目录）
const distDir = resolve(root, 'dist')
const portableDir = resolve(distDir, `Equality-portable-${version}`)

mkdirSync(portableDir, { recursive: true })

// 复制文件（全部平铺在根目录，用户只需双击 Equality.exe）
copyFileSync(equalityExe, resolve(portableDir, 'Equality.exe'))
copyFileSync(resolve(resourcesDir, 'equality-core.exe'), resolve(portableDir, 'equality-core.exe'))
copyFileSync(resolve(resourcesDir, 'better-sqlite3.node'), resolve(portableDir, 'better-sqlite3.node'))

// 复制 @primno+dpapi.node（Windows DPAPI 加密，可选）
const dpapiNode = resolve(resourcesDir, '@primno+dpapi.node')
if (existsSync(dpapiNode)) {
  copyFileSync(dpapiNode, resolve(portableDir, '@primno+dpapi.node'))
  console.log(`✅ 已复制 @primno+dpapi.node → 便携版`)
}

// 复制 bundled skills 目录
const skillsDir = resolve(resourcesDir, 'skills')
if (existsSync(skillsDir)) {
  cpSync(skillsDir, resolve(portableDir, 'skills'), { recursive: true })
  console.log(`✅ 已复制 skills/ → 便携版`)
} else {
  console.warn(`⚠️ 未找到 ${skillsDir}，便携版将不含内置 Skills`)
}

console.log(`\n✅ 已准备 Portable 目录: ${portableDir}`)

// 使用 PowerShell Compress-Archive 打包
const zipOut = resolve(distDir, `Equality-portable-${version}.zip`)
const psCmd = `Compress-Archive -Path "${portableDir}" -DestinationPath "${zipOut}" -Force`
console.log(`\n> 打包 zip: ${zipOut}`)
execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' })

console.log('\n╔═══════════════════════════════════════╗')
console.log('║  ✅  Portable 构建完成！               ║')
console.log('╚═══════════════════════════════════════╝')
console.log(`\n便携版 zip：`)
console.log(`  ${zipOut}`)
console.log('📦 zip 内容（不含任何源码，可直接分发给用户）：')
console.log(`  Equality-portable-${version}/`)
console.log('  ├── Equality.exe          ← ⭐ 用户只需双击这一个文件')
console.log('  ├── equality-core.exe     ← 由主程序自动在后台启动，用户无需关心')
console.log('  ├── better-sqlite3.node   ← 原生数据库模块，用户无需关心')
console.log('  ├── @primno+dpapi.node    ← Windows DPAPI 加密模块（API Key 保护）')
console.log('  └── skills/               ← 内置技能库（可在设置 → Skills 查看）')
console.log('\n💡 用户使用方式：解压 zip → 双击 Equality.exe → 完成')
console.log('\n📋 系统要求（对方电脑需满足）：')
console.log('   ✅ Windows 10 / 11 x64')
console.log('   ✅ WebView2 运行时（Win11 已内置，Win10 需安装）')
console.log('      下载：https://developer.microsoft.com/microsoft-edge/webview2/')
console.log('   ✅ VC++ 运行库（绝大多数电脑已有，缺失时 Windows 会自动提示）')
console.log('   ℹ️  如需使用浏览器工具，还需安装 Chrome 或 Edge')
