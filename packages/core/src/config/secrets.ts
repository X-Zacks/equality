/**
 * secrets.ts — API Key 存储
 *
 * Phase 1.5：持久化到 %APPDATA%\Equality\settings.json（明文 JSON）
 * Phase 2：改用 Windows DPAPI 加密（当前实现）
 *   接入点：setSecret / getSecret 内部透明切换，外部接口不变
 *   依赖：@primno/dpapi（预编译原生 .node 模块，SEA 环境用 process.dlopen 加载）
 *
 * 安全说明（cors-and-secrets-hardening）：
 *   - 加密后 settings.json 存 Base64 密文（"dpapi:<base64>" 格式）
 *   - DPAPI 绑定当前用户，即使拷贝文件到其他账户也无法解密
 *   - 非 Windows 或加载失败时自动降级到明文，不影响功能
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ─── DPAPI 加载（使用 process.dlopen，兼容 Node SEA + 便携版） ──────────────

interface DpapiBindings {
  protectData(data: Uint8Array, entropy: Uint8Array | null, scope: string): Uint8Array
  unprotectData(data: Uint8Array, entropy: Uint8Array | null, scope: string): Uint8Array
}

let _dpapi: DpapiBindings | null = null
let _dpapiTried = false

function getDpapi(): DpapiBindings | null {
  if (_dpapiTried) return _dpapi
  _dpapiTried = true

  if (process.platform !== 'win32') return null

  // 候选路径：与 exe 同级或 resources 子目录（兼容便携版 + 安装版）
  const exeDir = path.dirname(process.execPath)
  const candidates = [
    path.join(exeDir, '@primno+dpapi.node'),
    path.join(exeDir, 'resources', '@primno+dpapi.node'),
    // 开发环境：从 node_modules 加载
    path.resolve(__dirname, '../../node_modules/@primno/dpapi/prebuilds/win32-x64/@primno+dpapi.node'),
    path.resolve(__dirname, '../../../node_modules/@primno/dpapi/prebuilds/win32-x64/@primno+dpapi.node'),
  ]

  for (const nodePath of candidates) {
    if (!fs.existsSync(nodePath)) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = { exports: {} } as any
      process.dlopen(mod, nodePath)
      _dpapi = mod.exports as DpapiBindings
      console.log('[secrets] DPAPI 已加载:', nodePath)
      return _dpapi
    } catch (e) {
      console.warn('[secrets] DPAPI dlopen 失败:', nodePath, e)
    }
  }

  console.warn('[secrets] DPAPI 不可用，降级到明文存储')
  return null
}

/** DPAPI 加密：返回 "dpapi:<base64>" 格式字符串 */
function encryptValue(plaintext: string): string {
  const dpapi = getDpapi()
  if (!dpapi) return plaintext
  try {
    const buf = Buffer.from(plaintext, 'utf-8')
    const encrypted = dpapi.protectData(buf, null, 'CurrentUser')
    return 'dpapi:' + Buffer.from(encrypted).toString('base64')
  } catch (e) {
    console.warn('[secrets] 加密失败，存明文:', e)
    return plaintext
  }
}

/** DPAPI 解密：识别 "dpapi:<base64>" 前缀 */
function decryptValue(stored: string): string {
  if (!stored.startsWith('dpapi:')) return stored
  const dpapi = getDpapi()
  if (!dpapi) {
    console.warn('[secrets] 读取到加密值但 DPAPI 不可用，跳过')
    return ''
  }
  try {
    const encBuf = Buffer.from(stored.slice(6), 'base64')
    const decrypted = dpapi.unprotectData(encBuf, null, 'CurrentUser')
    return Buffer.from(decrypted).toString('utf-8')
  } catch (e) {
    console.warn('[secrets] 解密失败:', e)
    return ''
  }
}

const KEY_NAMES = [
  'DEEPSEEK_API_KEY',
  'QWEN_API_KEY',
  'VOLC_API_KEY',
  'CUSTOM_API_KEY',
  'CUSTOM_BASE_URL',
  'CUSTOM_MODEL',
  'GITHUB_TOKEN',
  'COPILOT_MODEL',
  'HTTPS_PROXY',
  'MODEL_ROUTING',
  'SELECTED_MODEL',
  'BASH_TIMEOUT_MS',
  'BASH_IDLE_TIMEOUT_MS',
  'BASH_MAX_TIMEOUT_MS',
  'BRAVE_SEARCH_API_KEY',
  'CHROME_PATH',
  'MINIMAX_API_KEY',
] as const
export type SecretKey = (typeof KEY_NAMES)[number]

// ─── 持久化文件路径 ────────────────────────────────────────────────────────────
function settingsPath(): string {
  const base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  const dir = path.join(base, 'Equality')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'settings.json')
}

function loadFile(): Partial<Record<SecretKey, string>> {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8')
    const stored = JSON.parse(raw) as Partial<Record<SecretKey, string>>
    // 解密所有值（透明降级：非 dpapi: 前缀的直接返回原文）
    const result: Partial<Record<SecretKey, string>> = {}
    for (const key of KEY_NAMES) {
      const val = stored[key]
      if (val) result[key] = decryptValue(val)
    }
    return result
  } catch {
    return {}
  }
}

function saveFile(data: Partial<Record<SecretKey, string>>): void {
  try {
    // 加密所有值后写入
    const toWrite: Partial<Record<SecretKey, string>> = {}
    for (const key of KEY_NAMES) {
      const val = data[key]
      if (val !== undefined) toWrite[key] = encryptValue(val)
    }
    fs.writeFileSync(settingsPath(), JSON.stringify(toWrite, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[secrets] 写入 settings.json 失败:', e)
  }
}

// ─── 运行时内存缓存 ───────────────────────────────────────────────────────────
const cache = new Map<SecretKey, string>()

/**
 * 初始化：优先级 = 持久化文件 > 环境变量
 * 这样用户通过界面保存的 Key 优先于 .env.local（方便生产环境）
 */
export function initSecrets(): void {
  // 1. 先读环境变量（作为默认值）
  for (const name of KEY_NAMES) {
    const val = process.env[name]?.trim()
    if (val) cache.set(name, val)
  }
  // 2. 再用文件覆盖（用户界面设置的优先级更高）
  const stored = loadFile()
  for (const name of KEY_NAMES) {
    const val = stored[name]
    if (val) cache.set(name, val)
  }
}

/** 获取 Secret；不存在则抛出 */
export function getSecret(name: SecretKey): string {
  const val = cache.get(name)
  if (!val) throw new Error(`Secret not configured: ${name}`)
  return val
}

/** 是否已配置 */
export function hasSecret(name: SecretKey): boolean {
  return cache.has(name) && !!cache.get(name)
}

/** 写入内存 + 持久化到文件 */
export function setSecret(name: SecretKey, value: string): void {
  cache.set(name, value.trim())
  // 读当前文件内容后合并写回，避免覆盖其他 key
  const stored = loadFile()
  stored[name] = value
  saveFile(stored)
}

/** 从内存和文件中彻底删除一个 Secret */
export function deleteSecret(name: SecretKey): void {
  cache.delete(name)
  const stored = loadFile()
  delete stored[name]
  saveFile(stored)
}

/** 读取所有已配置的 key（值用 * 遮掩，仅供 UI 显示） */
export function listSecrets(): Array<{ key: SecretKey; masked: string }> {
  return KEY_NAMES.filter(k => hasSecret(k)).map(k => {
    const val = cache.get(k)!
    // URL / Model / Proxy 不遮掩；API Key / Token 只显示前4位
    const masked = k.endsWith('_URL') || k === 'CUSTOM_MODEL' || k === 'COPILOT_MODEL' || k === 'HTTPS_PROXY' || k === 'MODEL_ROUTING' || k === 'SELECTED_MODEL' || k.startsWith('BASH_')
      ? val
      : val.length > 6 ? val.slice(0, 4) + '****' + val.slice(-2) : '******'
    return { key: k, masked }
  })
}

/**
 * 返回当前 Secrets 存储模式。
 * DPAPI 加载成功时返回 'dpapi'，否则返回 'plaintext'。
 */
export function getStorageMode(): 'plaintext' | 'dpapi' {
  return getDpapi() !== null ? 'dpapi' : 'plaintext'
}
