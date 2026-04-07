/**
 * diagnostics/redact.ts — 敏感数据脱敏
 *
 * Phase I4 (GAP-23): LLM 调用追踪中的敏感字段替换。
 */

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys: sk-xxx, key-xxx
  { pattern: /\b(sk-|key-)[A-Za-z0-9_-]{8,}\b/g, replacement: '$1***' },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9._\-/+=]{8,}/gi, replacement: 'Bearer ***' },
  // Generic long hex/base64 tokens (32+ chars, likely secrets)
  { pattern: /\b[A-Fa-f0-9]{32,}\b/g, replacement: '***' },
]

const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'apiKey',
  'secret', 'secretkey', 'secret_key', 'secretKey',
  'password', 'passwd', 'token',
  'authorization', 'auth',
])

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase())
}

function redactString(value: string): string {
  let result = value
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * 递归脱敏对象中的敏感字段。
 * - 已知敏感字段名 → 值替换为 '***'
 * - 字符串值 → 正则匹配替换
 * - 返回新对象（不修改原始输入）
 */
export function sanitizeDiagnosticPayload<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactString(value) as T
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticPayload(item)) as T
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key) && typeof val === 'string') {
        result[key] = '***'
      } else {
        result[key] = sanitizeDiagnosticPayload(val)
      }
    }
    return result as T
  }
  return value
}
