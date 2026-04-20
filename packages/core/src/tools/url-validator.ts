/**
 * tools/url-validator.ts — Unified URL safety validation
 *
 * Blocks dangerous protocols (javascript:, file:, data:, etc.)
 * and SSRF vectors (localhost, private IPs).
 */

export interface UrlValidationResult {
  allowed: boolean
  reason?: string
}

const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'file:', 'ftp:', 'blob:', 'vbscript:']
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
]
const BLOCKED_HOSTNAMES = ['localhost', '0.0.0.0', '[::1]']

export function validateUrl(urlStr: string): UrlValidationResult {
  const trimmed = urlStr.trim().toLowerCase()

  // 1. Blocked protocol check
  for (const proto of BLOCKED_PROTOCOLS) {
    if (trimmed.startsWith(proto)) {
      return { allowed: false, reason: `Blocked protocol: ${proto}` }
    }
  }

  // 2. Parse URL
  let url: URL
  try { url = new URL(urlStr) } catch { return { allowed: false, reason: 'Invalid URL' } }

  // 3. Only allow http/https
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { allowed: false, reason: `Protocol not allowed: ${url.protocol}` }
  }

  // 4. Block localhost / private IPs
  const hostname = url.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { allowed: false, reason: `Blocked hostname: ${hostname}` }
  }
  for (const re of PRIVATE_IP_RANGES) {
    if (re.test(hostname)) {
      return { allowed: false, reason: `Private IP range blocked: ${hostname}` }
    }
  }

  return { allowed: true }
}
