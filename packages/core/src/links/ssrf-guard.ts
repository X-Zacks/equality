/**
 * links/ssrf-guard.ts — SSRF 防护
 *
 * Phase K3 (GAP-28): 阻止内网 URL 访问。
 */

import { URL } from 'node:url'
import dns from 'node:dns/promises'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SSRFCheckResult {
  safe: boolean
  reason?: string
  resolvedIP?: string
}

// ─── Private IP ranges ──────────────────────────────────────────────────────

const PRIVATE_RANGES = [
  // IPv4
  { start: ip4ToNum('10.0.0.0'), end: ip4ToNum('10.255.255.255'), label: '10.0.0.0/8' },
  { start: ip4ToNum('172.16.0.0'), end: ip4ToNum('172.31.255.255'), label: '172.16.0.0/12' },
  { start: ip4ToNum('192.168.0.0'), end: ip4ToNum('192.168.255.255'), label: '192.168.0.0/16' },
  { start: ip4ToNum('127.0.0.0'), end: ip4ToNum('127.255.255.255'), label: '127.0.0.0/8' },
  { start: ip4ToNum('169.254.0.0'), end: ip4ToNum('169.254.255.255'), label: '169.254.0.0/16' },
  { start: ip4ToNum('0.0.0.0'), end: ip4ToNum('0.0.0.0'), label: '0.0.0.0' },
]

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', '[::1]'])

function ip4ToNum(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isPrivateIPv4(ip: string): string | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const num = ip4ToNum(ip)
  for (const range of PRIVATE_RANGES) {
    if (num >= range.start && num <= range.end) return range.label
  }
  return null
}

function isIPv6Loopback(ip: string): boolean {
  return ip === '::1' || ip === '0:0:0:0:0:0:0:1'
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 检查 URL 是否安全（非内网地址）。
 *
 * 如果传入 resolveHost 函数，则使用它解析 DNS；
 * 否则使用 node:dns/promises.resolve4。
 */
export async function checkSSRF(
  rawUrl: string,
  resolveHost?: (hostname: string) => Promise<string[]>,
): Promise<SSRFCheckResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { safe: false, reason: `Invalid URL: ${rawUrl}` }
  }

  const hostname = parsed.hostname.toLowerCase()

  // 直接阻止已知主机名
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: 'loopback address' }
  }

  // IPv6 loopback
  if (isIPv6Loopback(hostname)) {
    return { safe: false, reason: 'IPv6 loopback' }
  }

  // 直接是 IP 地址？
  const directPrivate = isPrivateIPv4(hostname)
  if (directPrivate) {
    return { safe: false, reason: `private IPv4: ${hostname}`, resolvedIP: hostname }
  }

  // DNS 解析
  try {
    const resolve = resolveHost ?? ((h: string) => dns.resolve4(h))
    const ips = await resolve(hostname)
    for (const ip of ips) {
      const privateRange = isPrivateIPv4(ip)
      if (privateRange) {
        return { safe: false, reason: `private IPv4: ${ip} (${privateRange})`, resolvedIP: ip }
      }
      if (isIPv6Loopback(ip)) {
        return { safe: false, reason: `IPv6 loopback: ${ip}`, resolvedIP: ip }
      }
    }
    return { safe: true, resolvedIP: ips[0] }
  } catch {
    // DNS 解析失败 → 视为安全（让后续 fetch 处理错误）
    return { safe: true }
  }
}

/**
 * 同步检查 URL 是否明显不安全（仅检查字面 IP/hostname，不做 DNS）。
 * 用于快速过滤，不需要 await。
 */
export function checkSSRFSync(rawUrl: string): SSRFCheckResult {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { safe: false, reason: `Invalid URL: ${rawUrl}` }
  }

  const hostname = parsed.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: 'loopback address' }
  }

  if (isIPv6Loopback(hostname)) {
    return { safe: false, reason: 'IPv6 loopback' }
  }

  const directPrivate = isPrivateIPv4(hostname)
  if (directPrivate) {
    return { safe: false, reason: `private IPv4: ${hostname}`, resolvedIP: hostname }
  }

  return { safe: true }
}
