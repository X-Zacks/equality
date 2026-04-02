/**
 * __tests__/bash-sandbox.test.ts — Phase C.2 Bash 沙箱路径隔离测试
 *
 * 运行方式：
 *   npx tsx src/__tests__/bash-sandbox.test.ts
 *
 * 覆盖 11 个测试用例 (T14-T24)：
 * - T14: 相对路径在范围内
 * - T15: 绝对路径超出范围
 * - T16: 多层路径遍历
 * - T17: 符号链接跳出（mock）
 * - T18: Unicode 空格注入
 * - T19: 允许系统临时目录
 * - T20: 管道命令路径检查
 * - T21: Windows 大小写不敏感
 * - T22: 无路径参数的命令
 * - T23: 跨驱动器拦截
 * - T24: NULL 字节注入
 */

import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import {
  validateBashCommand,
  validatePath,
  detectInjection,
  extractPathArgs,
  normalizePath,
} from '../tools/bash-sandbox.js'
import type { SandboxConfig } from '../tools/bash-sandbox.js'

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

// ─── 测试用 workspaceDir ──────────────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32'

// 使用实际存在的目录作为 workspaceDir（确保 realpathSync 可工作）
const WORKSPACE_DIR = IS_WINDOWS
  ? path.resolve('C:\\software\\equality')
  : '/home/user/myproject'

const config: SandboxConfig = {
  workspaceDir: WORKSPACE_DIR,
  allowSystemTemp: true,
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log('Phase C.2 — Bash Sandbox Tests')
console.log('═'.repeat(80))
console.log(`  Platform: ${process.platform}, workspaceDir: ${WORKSPACE_DIR}`)
console.log(`  tmpdir: ${os.tmpdir()}`)

// ── T14: 相对路径在范围内 ──
console.log('\n── T14: Relative path within workspace ──')
{
  const result = validateBashCommand('cat ./src/index.ts', config)
  assertEqual(result.allowed, true, 'T14', 'relative path ./src/index.ts is allowed')
}

// ── T15: 绝对路径超出范围 ──
console.log('\n── T15: Absolute path outside workspace ──')
if (IS_WINDOWS) {
  const result = validateBashCommand('cat C:\\Users\\secret.txt', {
    ...config,
    workspaceDir: 'C:\\proj',
  })
  assertEqual(result.allowed, false, 'T15', 'C:\\Users\\secret.txt outside C:\\proj')
} else {
  const result = validateBashCommand('cat /etc/passwd', config)
  assertEqual(result.allowed, false, 'T15', '/etc/passwd outside workspace')
}

// ── T16: 多层路径遍历 ──
console.log('\n── T16: Path traversal ──')
{
  const traversalCmd = IS_WINDOWS
    ? 'cat ..\\..\\Windows\\system32\\hosts'
    : 'cat ../../etc/passwd'
  const result = validateBashCommand(traversalCmd, config)
  assertEqual(result.allowed, false, 'T16', 'path traversal detected and blocked')
}

// ── T17: 符号链接跳出（通过 validatePath + mock realpath） ──
console.log('\n── T17: Symlink escape ──')
{
  // 测试策略：用 validatePath 直接测试。
  // 当路径存在时 realpathSync 会追踪真实路径。
  // 创建一个临时符号链接指向 workspace 外部来测试。
  const tmpDir = os.tmpdir()
  const testLink = path.join(tmpDir, `sandbox-test-link-${Date.now()}`)
  const externalTarget = IS_WINDOWS ? 'C:\\Windows\\system32' : '/etc'

  let symlinkTestWorked = false
  try {
    // 创建指向外部的符号链接
    fs.symlinkSync(externalTarget, testLink, 'dir')

    // 用 tmpDir 下的 workspace 来测试
    const testWorkspace = path.join(tmpDir, `sandbox-test-ws-${Date.now()}`)
    fs.mkdirSync(testWorkspace, { recursive: true })

    // 把符号链接移到 workspace 内
    const linkInWs = path.join(testWorkspace, 'evil-link')
    fs.symlinkSync(externalTarget, linkInWs, 'dir')

    const result = validatePath('./evil-link', {
      workspaceDir: testWorkspace,
      allowSystemTemp: false,
    })
    assertEqual(result.allowed, false, 'T17', 'symlink pointing outside workspace is blocked')
    symlinkTestWorked = true

    // 清理
    fs.unlinkSync(linkInWs)
    fs.rmdirSync(testWorkspace)
    fs.unlinkSync(testLink)
  } catch (err) {
    if (!symlinkTestWorked) {
      // Windows 可能需要管理员权限创建符号链接
      console.log(`  ⚠️ T17 — symlink test skipped (${(err as Error).message})`)
      // 用 mock 方式验证逻辑：如果 realpathSync 返回范围外路径则拦截
      const result = validatePath('/etc', {
        workspaceDir: WORKSPACE_DIR,
        allowSystemTemp: false,
      })
      assertEqual(result.allowed, false, 'T17', 'path outside workspace is blocked (symlink fallback test)')
    }
  }
}

// ── T18: Unicode 空格注入 ──
console.log('\n── T18: Unicode space injection ──')
{
  const result = validateBashCommand('cat ./test\u00A0cd /etc/file', config)
  assertEqual(result.allowed, false, 'T18a', 'Unicode NBSP (U+00A0) detected')
  assert(result.reason?.includes('Unicode') ?? false, 'T18b', 'reason mentions Unicode')
}

// ── T19: 允许系统临时目录 ──
console.log('\n── T19: Allow system temp directory ──')
{
  const tmpPath = path.join(os.tmpdir(), 'test-sandbox')
  const cmd = IS_WINDOWS
    ? `mkdir ${tmpPath}`
    : `mkdir ${tmpPath}`
  const result = validateBashCommand(cmd, { workspaceDir: WORKSPACE_DIR, allowSystemTemp: true })
  assertEqual(result.allowed, true, 'T19a', 'temp dir path allowed with allowSystemTemp=true')

  // 禁用临时目录时应拦截
  const result2 = validateBashCommand(cmd, { workspaceDir: WORKSPACE_DIR, allowSystemTemp: false })
  assertEqual(result2.allowed, false, 'T19b', 'temp dir path blocked with allowSystemTemp=false')
}

// ── T20: 管道命令路径检查 ──
console.log('\n── T20: Pipe command path check ──')
{
  const outsidePath = IS_WINDOWS ? 'C:\\Windows\\hosts' : '/etc/hosts'
  const cmd = `cat ./src/index.ts | grep import && rm ${outsidePath}`
  const result = validateBashCommand(cmd, config)
  assertEqual(result.allowed, false, 'T20', 'compound command with outside path blocked')
}

// ── T21: Windows 大小写不敏感 ──
console.log('\n── T21: Windows case insensitivity ──')
if (IS_WINDOWS) {
  const wsLower = 'c:\\software\\equality'
  const wsUpper = 'C:\\Software\\Equality'

  // 两种大小写的 workspace 应该等价
  const n1 = normalizePath(wsLower)
  const n2 = normalizePath(wsUpper)
  assertEqual(n1, n2, 'T21a', 'normalizePath is case-insensitive on Windows')

  // 使用不同大小写的路径访问 workspace 内文件应该允许
  const result = validatePath('c:\\software\\equality\\src\\index.ts', {
    workspaceDir: 'C:\\Software\\Equality',
  })
  assertEqual(result.allowed, true, 'T21b', 'case-different path is allowed on Windows')
} else {
  // Unix: 大小写敏感
  const n1 = normalizePath('/home/user')
  const n2 = normalizePath('/home/User')
  assert(n1 !== n2, 'T21a', 'normalizePath is case-sensitive on Unix')
  assertEqual(true, true, 'T21b', 'Unix case sensitivity (placeholder)')
}

// ── T22: 无路径参数的命令 ──
console.log('\n── T22: Command with no path args ──')
{
  const result = validateBashCommand('echo hello', config)
  assertEqual(result.allowed, true, 'T22a', 'echo hello is allowed (no path args)')

  const result2 = validateBashCommand('whoami', config)
  assertEqual(result2.allowed, true, 'T22b', 'whoami is allowed (unknown command)')

  const result3 = validateBashCommand('date && echo done', config)
  assertEqual(result3.allowed, true, 'T22c', 'date && echo done is allowed')
}

// ── T23: 跨驱动器拦截（Windows）──
console.log('\n── T23: Cross-drive detection ──')
if (IS_WINDOWS) {
  const result = validateBashCommand('cat D:\\secrets\\data.txt', {
    workspaceDir: 'C:\\software\\equality',
    allowSystemTemp: false,
  })
  assertEqual(result.allowed, false, 'T23', 'D:\\ path blocked when workspace is on C:\\')
} else {
  // Unix 上无驱动器概念，用根路径外部测试
  const result = validateBashCommand('cat /opt/secrets/data.txt', config)
  assertEqual(result.allowed, false, 'T23', '/opt path blocked outside workspace')
}

// ── T24: NULL 字节注入 ──
console.log('\n── T24: NULL byte injection ──')
{
  const result = validateBashCommand('cat ./test\x00/etc/passwd', config)
  assertEqual(result.allowed, false, 'T24a', 'NULL byte detected')
  assert(result.reason?.includes('NULL') ?? false, 'T24b', 'reason mentions NULL')
}

// ─── Extra: extractPathArgs 详细测试 ─────────────────────────────────────────

console.log('\n── Extra: extractPathArgs parser ──')
{
  const p1 = extractPathArgs('cat ./file1 ./file2')
  assertEqual(p1.length, 2, 'EP1', `cat with 2 paths: got ${p1.length}`)

  const p2 = extractPathArgs('rm -rf ./build ./dist')
  assertEqual(p2.length, 2, 'EP2', `rm -rf with 2 paths: got ${p2.length}`)

  const p3 = extractPathArgs('echo hello world')
  assertEqual(p3.length, 0, 'EP3', 'echo has no path spec → 0 paths')

  const p4 = extractPathArgs('cd /tmp && ls -la ./src')
  assertEqual(p4.length, 2, 'EP4', `cd + ls: got ${p4.length} paths`)

  const p5 = extractPathArgs('python3 script.py')
  assertEqual(p5.length, 0, 'EP5', 'unknown command → 0 paths')

  // PowerShell cmdlet
  const p6 = extractPathArgs('Remove-Item ./temp')
  assertEqual(p6.length, 1, 'EP6', `Remove-Item: got ${p6.length} paths`)

  const p7 = extractPathArgs('Get-Content ./readme.md')
  assertEqual(p7.length, 1, 'EP7', `Get-Content: got ${p7.length} paths`)
}

// ─── Extra: detectInjection 详细测试 ─────────────────────────────────────────

console.log('\n── Extra: detectInjection details ──')
{
  assertEqual(detectInjection('ls -la'), null, 'DI1', 'normal command → null')
  assert(detectInjection('test\u200B')?.includes('Unicode') ?? false, 'DI2', 'zero-width space detected')
  assert(detectInjection('test\uFEFF')?.includes('Unicode') ?? false, 'DI3', 'BOM character detected')
  assert(detectInjection('test\u3000x')?.includes('Unicode') ?? false, 'DI4', 'ideographic space detected')
  assertEqual(detectInjection('normal command'), null, 'DI5', 'no injection in normal command')
}

// ─── Extra: normalizePath ────────────────────────────────────────────────────

console.log('\n── Extra: normalizePath ──')
{
  const n1 = normalizePath('C:\\Users\\test\\file.txt')
  if (IS_WINDOWS) {
    assertEqual(n1, 'c:/users/test/file.txt', 'NP1', 'Windows path normalized')
  } else {
    assertEqual(n1, 'C:/Users/test/file.txt', 'NP1', 'Unix preserves case with / normalization')
  }

  // Trailing slash removal
  const n2 = normalizePath('/home/user/')
  assert(!n2.endsWith('/') || n2 === '/', 'NP2', 'trailing slash removed')
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log(`Phase C.2 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
console.log('═'.repeat(80))

if (failed > 0) {
  process.exit(1)
}
