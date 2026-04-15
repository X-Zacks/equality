/**
 * secrets.ts — API Key 存储
 *
 * Phase 1.5：持久化到 %APPDATA%\Equality\settings.json（明文 JSON）
 * Phase 2：改用 Windows DPAPI 加密
 *   接入点：setSecret / getSecret 内部切换，外部接口不变
 *   依赖：node-dpapi（原生 .node 模块，需验证 SEA 兼容性）
 *
 * 安全说明（cors-and-secrets-hardening）：
 *   - settings.json 目前为明文存储，路径 %APPDATA%\Equality\settings.json
 *   - 当前防线：文件系统权限（Windows 默认当前用户专属）
 *   - Phase 2 将加入 DPAPI 加密，实现后 getStorageMode() 返回 'dpapi'
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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
  'AGENT_MAX_TOOL_CALLS',
  'AGENT_MAX_LLM_TURNS',
  'BRAVE_SEARCH_API_KEY',
  'CHROME_PATH',
  'MINIMAX_API_KEY',
  'MINIMAX_SHOW_THINKING',
  'WORKSPACE_DIR',
  'MCP_SERVERS',
  'MEMORY_AUTO_CAPTURE',
  'INTENT_JUDGE_PROVIDER',
  'INTENT_JUDGE_MODEL',
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
    return JSON.parse(raw) as Partial<Record<SecretKey, string>>
  } catch {
    return {}
  }
}

function saveFile(data: Partial<Record<SecretKey, string>>): void {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(data, null, 2), 'utf-8')
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
    const masked = k.endsWith('_URL') || k === 'CUSTOM_MODEL' || k === 'COPILOT_MODEL' || k === 'HTTPS_PROXY' || k === 'MODEL_ROUTING' || k === 'SELECTED_MODEL' || k.startsWith('BASH_') || k.startsWith('AGENT_MAX_') || k === 'WORKSPACE_DIR' || k === 'CHROME_PATH' || k === 'MINIMAX_SHOW_THINKING'
      ? val
      : val.length > 6 ? val.slice(0, 4) + '****' + val.slice(-2) : '******'
    return { key: k, masked }
  })
}

/**
 * 返回当前 Secrets 存储模式。
 * Phase 2 实现 DPAPI 后返回 'dpapi'；当前始终返回 'plaintext'。
 */
export function getStorageMode(): 'plaintext' | 'dpapi' {
  // Phase 2 接入点：检测 DPAPI 可用性并返回 'dpapi'
  return 'plaintext'
}
