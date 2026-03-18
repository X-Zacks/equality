/**
 * scripts/check-env.mjs — 构建环境检查与自动安装
 *
 * 被 build-all.mjs 和 build-portable.mjs 共同引用。
 * 检查并在必要时自动安装：Node.js、pnpm、Rust/Cargo、Tauri CLI
 */

import { execSync, spawnSync } from 'node:child_process'

/**
 * 检查某个命令是否可用，返回 true/false
 */
export function commandExists(cmd) {
  const result = spawnSync(cmd, ['--version'], { shell: true, stdio: 'pipe' })
  return result.status === 0
}

/**
 * 执行命令，失败时打印友好提示并退出
 */
export function run(cmd, errorMsg) {
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`\n❌ ${errorMsg}`)
    process.exit(1)
  }
}

/**
 * 检查所有构建依赖，缺失时自动安装。
 * 全部通过后打印 "✅ 环境检查通过" 并返回。
 */
export function checkEnv() {
  console.log('\n🔍 正在检查构建环境...\n')

  // ── 1. Node.js ──────────────────────────────────────────────────────────
  // 脚本能运行说明 Node.js 已存在，只打印版本
  console.log(`  ✅ Node.js ${process.version}`)

  // ── 2. pnpm ─────────────────────────────────────────────────────────────
  if (commandExists('pnpm')) {
    const v = execSync('pnpm --version', { encoding: 'utf-8' }).trim()
    console.log(`  ✅ pnpm ${v}`)
  } else {
    console.log('  ⚠️  pnpm 未安装，正在通过 npm 安装 pnpm...')
    run('npm install -g pnpm', 'pnpm 安装失败，请手动运行：npm install -g pnpm')
    console.log('  ✅ pnpm 安装完成')
  }

  // ── 3. Rust / Cargo ──────────────────────────────────────────────────────
  if (commandExists('cargo')) {
    const v = execSync('cargo --version', { encoding: 'utf-8' }).trim()
    console.log(`  ✅ ${v}`)
  } else {
    console.log('  ⚠️  Rust/Cargo 未安装，正在通过 winget 安装...')
    if (commandExists('winget')) {
      run('winget install --id Rustlang.Rustup -e --silent', 'Rust 安装失败')
    } else {
      console.error('  ❌ 未检测到 winget，无法自动安装 Rust。')
      console.error('     请手动安装：https://www.rust-lang.org/tools/install')
      process.exit(1)
    }
    // 安装后刷新当前进程的 PATH（读取注册表，无需重启终端）
    console.log('\n  🔄 正在刷新 PATH 环境变量（无需重启终端）...')
    try {
      const freshPath = execSync(
        'powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\'PATH\', \'Machine\') + \';\' + [System.Environment]::GetEnvironmentVariable(\'PATH\', \'User\')"',
        { encoding: 'utf-8' }
      ).trim()
      process.env.PATH = freshPath
      console.log('  ✅ PATH 已刷新，继续构建...')
    } catch {
      console.error('  ❌ PATH 刷新失败，请手动关闭并重新打开终端后再运行此脚本。')
      process.exit(1)
    }
  }

  // ── 4. Tauri CLI ──────────────────────────────────────────────────────────
  if (commandExists('cargo-tauri') || commandExists('tauri')) {
    console.log('  ✅ Tauri CLI 已安装')
  } else {
    console.log('  ⚠️  Tauri CLI 未安装，正在通过 cargo install 安装（首次约需几分钟）...')
    run('cargo install tauri-cli --locked', 'Tauri CLI 安装失败，请手动运行：cargo install tauri-cli --locked')
    console.log('  ✅ Tauri CLI 安装完成')
  }

  console.log('\n✅ 环境检查通过，开始构建...\n')
}
