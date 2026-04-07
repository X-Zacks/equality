/**
 * links/understand.ts — 链接理解管道
 *
 * Phase K3 (GAP-28): URL 提取 → SSRF 检查 → 抓取 → 摘要 → 注入。
 */

import { detectLinks, type ExtractedLink } from './detect.js'
import { checkSSRFSync, type SSRFCheckResult } from './ssrf-guard.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LinkUnderstandingResult {
  url: string
  title?: string
  content: string
  fetchedAt: number
  charCount: number
  blocked?: boolean
  blockReason?: string
}

export interface LinkUnderstandingOptions {
  /** 内容截断字符数 */
  maxContentChars?: number
  /** 抓取超时（ms） */
  fetchTimeoutMs?: number
  /** 自定义抓取函数（测试用） */
  fetcher?: (url: string) => Promise<{ title?: string; text: string } | null>
  /** 自定义 SSRF 检查（测试用） */
  ssrfChecker?: (url: string) => SSRFCheckResult
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_CONTENT = 2000
const DEFAULT_FETCH_TIMEOUT = 10_000

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 处理单个 URL：SSRF 检查 → 抓取 → 截断。
 */
export async function fetchAndSummarize(
  url: string,
  opts?: LinkUnderstandingOptions,
): Promise<LinkUnderstandingResult | null> {
  const maxContent = opts?.maxContentChars ?? DEFAULT_MAX_CONTENT
  const ssrfCheck = opts?.ssrfChecker ?? checkSSRFSync

  // 1. SSRF 检查
  const ssrf = ssrfCheck(url)
  if (!ssrf.safe) {
    return {
      url,
      content: '',
      fetchedAt: Date.now(),
      charCount: 0,
      blocked: true,
      blockReason: ssrf.reason,
    }
  }

  // 2. 抓取
  try {
    const fetcher = opts?.fetcher ?? defaultFetcher
    const result = await withTimeout(fetcher(url), opts?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT)
    if (!result) return null

    // 3. 截断
    const content = result.text.slice(0, maxContent)

    return {
      url,
      title: result.title,
      content,
      fetchedAt: Date.now(),
      charCount: content.length,
    }
  } catch {
    // 超时或网络错误 → 静默降级
    return null
  }
}

/**
 * 处理一条消息中的所有链接。
 */
export async function understandLinks(
  messageText: string,
  opts?: LinkUnderstandingOptions,
): Promise<LinkUnderstandingResult[]> {
  const links = detectLinks(messageText, 'user-message')
  if (links.length === 0) return []

  const results: LinkUnderstandingResult[] = []
  for (const link of links) {
    const result = await fetchAndSummarize(link.url, opts)
    if (result) results.push(result)
  }

  return results
}

/**
 * 将链接理解结果格式化为可注入 context 的文本。
 */
export function formatLinkContext(results: LinkUnderstandingResult[]): string {
  return results
    .filter(r => !r.blocked && r.content)
    .map(r => `[Link: ${r.url}]${r.title ? ` - ${r.title}` : ''}\n${r.content}`)
    .join('\n\n')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function defaultFetcher(_url: string): Promise<{ title?: string; text: string } | null> {
  // 实际实现时应复用 web-fetch 的 cheerio 逻辑
  // 此处为占位，由 Gateway 集成时替换
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ])
}
