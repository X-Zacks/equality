/**
 * copilot-auth.ts — GitHub Copilot OAuth Device Flow + Token 管理
 *
 * 双层 Token 架构：
 * 1. GitHub OAuth Token（永久，持久化到 settings.json）
 * 2. Copilot Bearer Token（~30min，仅内存缓存）
 */

import https from 'node:https'
import { getSecret, hasSecret, deleteSecret } from '../config/secrets.js'
import { getProxyAgent, getTlsOptions } from '../config/proxy.js'

// ─── Constants ────────────────────────────────────────────────────────────────

/** VS Code Copilot 扩展的 OAuth App Client ID */
const CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const SCOPE = 'read:user'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeviceFlowResult {
  userCode: string
  verificationUri: string
  deviceCode: string
  expiresIn: number
  interval: number
}

export interface CopilotLoginStatus {
  status: 'pending' | 'ok' | 'expired' | 'denied' | 'error'
  message?: string
  user?: string
}

interface CopilotTokenResponse {
  token: string
  expires_at: number
}

// ─── In-memory Bearer Token cache ─────────────────────────────────────────────

let bearerToken: string | null = null
let bearerExpiresAt = 0 // Unix seconds
let apiHostname = 'api.individual.githubcopilot.com' // 从 bearer token 动态解析
let loggedOut = false   // 用户主动退出后，不再从备用源自动登录

// 正在进行的 Device Flow 状态
let activeDeviceCode: string | null = null
let activeInterval = 5
let activeExpiresAt = 0

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsPost(hostname: string, urlPath: string, body: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      port: 443,
      path: urlPath,
      method: 'POST',
      agent: getProxyAgent(),
      ...getTlsOptions(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Equality/1.0',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function httpsGet(hostname: string, urlPath: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      port: 443,
      path: urlPath,
      method: 'GET',
      agent: getProxyAgent(),
      ...getTlsOptions(),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Equality/1.0',
        ...headers,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

// ─── Device Flow ──────────────────────────────────────────────────────────────

/**
 * Step 1: 请求 Device Code 和 User Code
 */
export async function startDeviceFlow(): Promise<DeviceFlowResult> {
  const body = JSON.stringify({
    client_id: CLIENT_ID,
    scope: SCOPE,
  })

  const resp = await httpsPost('github.com', '/login/device/code', body)
  if (resp.status !== 200) {
    throw new Error(`GitHub Device Flow 启动失败: HTTP ${resp.status} - ${resp.body}`)
  }

  const data = JSON.parse(resp.body)
  activeDeviceCode = data.device_code
  activeInterval = data.interval ?? 5
  activeExpiresAt = Date.now() + (data.expires_in ?? 900) * 1000

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    expiresIn: data.expires_in ?? 900,
    interval: data.interval ?? 5,
  }
}

/**
 * Step 3: 单次轮询检查用户是否已授权
 */
export async function pollForToken(): Promise<CopilotLoginStatus> {
  if (!activeDeviceCode) {
    return { status: 'error', message: '请先调用 /copilot/login 启动登录流程' }
  }

  if (Date.now() > activeExpiresAt) {
    activeDeviceCode = null
    return { status: 'expired', message: '验证码已过期，请重新登录' }
  }

  const body = JSON.stringify({
    client_id: CLIENT_ID,
    device_code: activeDeviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })

  const resp = await httpsPost('github.com', '/login/oauth/access_token', body)
  const data = JSON.parse(resp.body)

  if (data.error) {
    switch (data.error) {
      case 'authorization_pending':
        return { status: 'pending', message: '等待用户授权…' }
      case 'slow_down':
        activeInterval += 5
        return { status: 'pending', message: '等待用户授权（降速中）…' }
      case 'expired_token':
        activeDeviceCode = null
        return { status: 'expired', message: '验证码已过期，请重新登录' }
      case 'access_denied':
        activeDeviceCode = null
        return { status: 'denied', message: '用户拒绝了授权' }
      default:
        return { status: 'error', message: data.error_description ?? data.error }
    }
  }

  if (data.access_token) {
    const githubToken = data.access_token
    activeDeviceCode = null
    loggedOut = false

    // 持久化 GitHub Token
    const { setSecret } = await import('../config/secrets.js')
    setSecret('GITHUB_TOKEN', githubToken)

    // 尝试兑换 Bearer Token 并获取用户信息
    try {
      await exchangeBearerToken(githubToken)
    } catch (e) {
      console.warn('[copilot-auth] Bearer Token 兑换失败，但 GitHub Token 已保存:', e)
    }

    // 获取 GitHub 用户名
    let user = 'GitHub User'
    try {
      const userResp = await httpsGet('api.github.com', '/user', {
        Authorization: `Bearer ${githubToken}`,
      })
      if (userResp.status === 200) {
        const u = JSON.parse(userResp.body)
        user = u.login ?? u.name ?? 'GitHub User'
      }
    } catch { /* ignore */ }

    return { status: 'ok', user }
  }

  return { status: 'error', message: '未知响应格式' }
}

// ─── Token Exchange ───────────────────────────────────────────────────────────

/**
 * 用 GitHub OAuth Token 兑换 Copilot Bearer Token
 */
async function exchangeBearerToken(githubToken: string): Promise<string> {
  const resp = await httpsGet('api.github.com', '/copilot_internal/v2/token', {
    Authorization: `Token ${githubToken}`,
  })

  if (resp.status === 401) {
    // Token 无效，自动清除并要求重新登录
    bearerToken = null
    bearerExpiresAt = 0
    deleteSecret('GITHUB_TOKEN')
    throw new Error('GitHub Token 无效或已过期，请在设置中重新登录 GitHub Copilot')
  }

  if (resp.status !== 200) {
    throw new Error(`Copilot Token 兑换失败: HTTP ${resp.status} - ${resp.body}`)
  }

  const data: CopilotTokenResponse = JSON.parse(resp.body)
  bearerToken = data.token
  bearerExpiresAt = data.expires_at

  // 从 token 中解析 proxy-ep 得到正确的 API hostname
  // token 格式: "tid=xxx;proxy-ep=proxy.individual.githubcopilot.com;..."
  const proxyMatch = data.token.match(/(?:^|;)\s*proxy-ep=([^;\s]+)/i)
  if (proxyMatch?.[1]) {
    // proxy.xxx → api.xxx
    apiHostname = proxyMatch[1].trim().replace(/^proxy\./i, 'api.')
  }

  return data.token
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 获取有效的 Copilot Bearer Token（自动缓存 + 刷新）
 * 如果 GitHub Token 不存在，抛出错误
 */
export async function getValidBearerToken(): Promise<string> {
  // 如果 Bearer Token 在缓存中且未过期（预留 5min 缓冲）
  const now = Math.floor(Date.now() / 1000)
  if (bearerToken && bearerExpiresAt > now + 300) {
    return bearerToken
  }

  // 需要（重新）兑换
  const githubToken = loadGitHubToken()
  if (!githubToken) {
    throw new Error('未配置 GitHub Token，请先登录 GitHub Copilot')
  }

  return exchangeBearerToken(githubToken)
}

/**
 * 获取当前 Copilot API hostname（从 bearer token 动态解析）
 */
export function getApiHostname(): string {
  return apiHostname
}

/**
 * 强制刷新 Bearer Token（用于 401 后重试）
 */
export async function forceRefreshBearerToken(): Promise<string> {
  bearerToken = null
  bearerExpiresAt = 0
  return getValidBearerToken()
}

/**
 * 查找 GitHub Token（仅信任 settings.json 和环境变量）
 * 不自动读取 gh CLI / Copilot 扩展的凭据，因为它们的 OAuth Token
 * 是通过其他 Client ID 获取的，无法用于 Copilot API 兑换。
 */
export function loadGitHubToken(): string | null {
  // 1. settings.json（Device Flow 写入）
  if (hasSecret('GITHUB_TOKEN')) {
    return getSecret('GITHUB_TOKEN')
  }

  // 2. 环境变量（用户显式设置）
  const envToken = process.env.GITHUB_TOKEN?.trim()
  if (envToken) return envToken

  return null
}

/**
 * 清除所有 Copilot 相关凭据
 */
export function clearCopilotAuth(): void {
  bearerToken = null
  bearerExpiresAt = 0
  activeDeviceCode = null
  loggedOut = true
  deleteSecret('GITHUB_TOKEN')
  deleteSecret('COPILOT_MODEL')
}

/**
 * 检查 Copilot 是否已登录
 */
export function isCopilotLoggedIn(): boolean {
  if (loggedOut) return false
  return !!loadGitHubToken()
}

/**
 * 返回 Device Flow 的轮询间隔（秒）
 */
export function getPollingInterval(): number {
  return activeInterval
}
