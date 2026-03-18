/**
 * proxy.ts — HTTP/HTTPS 代理支持
 *
 * 代理 URL 查找优先级：
 * 1. settings.json 中的 HTTPS_PROXY
 * 2. 环境变量 HTTPS_PROXY / https_proxy / HTTP_PROXY / http_proxy
 *
 * 企业代理通常会使用自签名证书做 TLS 拦截，
 * 因此当启用代理时，自动放宽 TLS 证书验证。
 */

import { HttpsProxyAgent } from 'https-proxy-agent'

let cachedUrl: string | null = null
let cachedAgent: HttpsProxyAgent<string> | null = null

/**
 * 获取当前有效的代理 URL（无代理时返回 null）
 */
export function getProxyUrl(): string | null {
  // 1. 运行时缓存（由 setProxyUrl 设置，或从 initProxy 初始化）
  if (cachedUrl) return cachedUrl

  // 2. 环境变量
  const env =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.https_proxy?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.http_proxy?.trim()
  if (env) return env

  return null
}

/**
 * 设置代理 URL（由 secrets 初始化或用户配置时调用）
 */
export function setProxyUrl(url: string | null): void {
  cachedUrl = url?.trim() || null
  cachedAgent = null // 清缓存，下次 getProxyAgent 重建
}

/**
 * 获取可复用的 HttpsProxyAgent 实例
 * 无代理时返回 undefined（传给 https.request 时等同于无 agent）
 * 企业代理场景自动设置 rejectUnauthorized: false
 */
export function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const url = getProxyUrl()
  if (!url) return undefined

  if (!cachedAgent || cachedUrl !== url) {
    cachedAgent = new HttpsProxyAgent(url, {
      rejectUnauthorized: false,
    })
    cachedUrl = url
  }
  return cachedAgent
}

/**
 * 当使用代理时，返回 { rejectUnauthorized: false }，否则返回空对象。
 * 用于合并到 https.request options 中。
 */
export function getTlsOptions(): { rejectUnauthorized?: boolean } {
  return getProxyUrl() ? { rejectUnauthorized: false } : {}
}

/**
 * 初始化代理设置（从 secrets cache 读取 HTTPS_PROXY）
 * 在 initSecrets() 之后调用
 */
export function initProxy(proxyUrl?: string): void {
  if (proxyUrl) {
    setProxyUrl(proxyUrl)
  }
  // 如果没有显式传入，getProxyUrl() 仍会从环境变量中查找

  // 企业代理场景：代理做 TLS 拦截时使用自签名证书，
  // 需要全局禁用 Node.js 的证书验证，否则 OpenAI SDK 等第三方库会报
  // UNABLE_TO_VERIFY_LEAF_SIGNATURE 错误。
  // 只在检测到代理配置时才设置，非代理环境保持默认安全策略。
  if (getProxyUrl()) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }
}
