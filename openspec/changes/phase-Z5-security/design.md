# Design: Phase Z5-security

## S1: 统一 URL 验证层

### 方案

新建 `packages/core/src/tools/url-validator.ts`：

```ts
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
  // 1. 协议检查
  for (const proto of BLOCKED_PROTOCOLS) {
    if (urlStr.toLowerCase().trim().startsWith(proto)) {
      return { allowed: false, reason: `Blocked protocol: ${proto}` }
    }
  }
  // 2. 解析 URL
  let url: URL
  try { url = new URL(urlStr) } catch { return { allowed: false, reason: 'Invalid URL' } }
  // 3. 仅允许 http/https
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { allowed: false, reason: `Protocol not allowed: ${url.protocol}` }
  }
  // 4. 内网 IP / localhost 检查
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
```

## S2: web_fetch 加固

在 `web-fetch.ts` 的 `execute()` 入口处调用 `validateUrl(url)`，不通过则返回错误。

## S3: browser 加固

在 `browser.ts` 的 `navigate` action 处调用 `validateUrl(url)`。

## S4: 审计日志

browser 工具每次 `navigate`、`click`、`type` 操作均输出结构化日志：
```
[browser-audit] action=navigate url=https://... timestamp=...
[browser-audit] action=click selector=#btn timestamp=...
```
使用已有的 logger 基础设施。
