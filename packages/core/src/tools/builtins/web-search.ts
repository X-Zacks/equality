/**
 * tools/builtins/web-search.ts — 网页搜索工具
 *
 * 借鉴 OpenClaw 的 web_search 设计，支持多个搜索引擎：
 * - Brave Search API（主力）
 * - 回退到 web_fetch + DuckDuckGo HTML scrape
 *
 * 环境变量:
 *   BRAVE_SEARCH_API_KEY — Brave Search API 密钥（免费版每月 2000 次）
 *
 * 特性：代理穿透、结果缓存、超时控制。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { ProxyAgent } from 'undici'
import { wrapExternalContent } from '../../security/external-content.js'

const SEARCH_TIMEOUT_MS = 15_000
const MAX_RESULTS = 10
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// 简单的内存缓存
const cache = new Map<string, { data: string; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

interface BraveWebResult {
  title?: string
  url?: string
  description?: string
  age?: string
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] }
  query?: { original?: string }
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    '搜索网页，返回相关结果列表（标题 + URL + 摘要）。' +
    '需要 BRAVE_SEARCH_API_KEY 环境变量（Brave Search API）。' +
    '如果没有 API key，会回退到 DuckDuckGo 抓取。',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      count: {
        type: 'number',
        description: '返回结果数量（默认 10，最多 20）',
      },
      language: {
        type: 'string',
        description: '搜索语言/地区（如 "zh-CN"、"en-US"），默认 zh-CN',
      },
    },
    required: ['query'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = String(input.query ?? '').trim()
    if (!query) {
      return { content: 'Error: query is required', isError: true }
    }

    const count = Math.min(Math.max(Number(input.count) || MAX_RESULTS, 1), 20)
    const language = String(input.language ?? 'zh-CN')

    // 检查缓存
    const cacheKey = `${query}|${count}|${language}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { content: cached.data }
    }

    const startMs = Date.now()

    // 尝试 Brave Search API
    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY
    if (braveApiKey) {
      try {
        const rawResult = await searchBrave(query, count, language, braveApiKey, ctx)
        const { content: result } = wrapExternalContent(rawResult, 'web_search')
        cache.set(cacheKey, { data: result, ts: Date.now() })
        return { content: result, metadata: { durationMs: Date.now() - startMs } }
      } catch (err) {
        // Brave 失败，回退到 DuckDuckGo
        console.warn('[web_search] Brave API failed, falling back to DuckDuckGo:', (err as Error).message)
      }
    }

    // 回退：DuckDuckGo HTML 抓取
    try {
      const rawResult = await searchDuckDuckGo(query, count, ctx)
      const { content: result } = wrapExternalContent(rawResult, 'web_search')
      cache.set(cacheKey, { data: result, ts: Date.now() })
      return { content: result, metadata: { durationMs: Date.now() - startMs } }
    } catch (err) {
      return {
        content: `Error: 搜索失败 — ${(err as Error).message}\n\n提示：设置 BRAVE_SEARCH_API_KEY 环境变量可使用 Brave Search API（免费版每月 2000 次查询）。`,
        isError: true,
        metadata: { durationMs: Date.now() - startMs },
      }
    }
  },
}

/* ── Brave Search API ─────────────────────────── */

async function searchBrave(
  query: string,
  count: number,
  language: string,
  apiKey: string,
  ctx: ToolContext,
): Promise<string> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  url.searchParams.set('search_lang', language.split('-')[0] || 'zh')
  url.searchParams.set('result_filter', 'web')

  const fetchOpts: RequestInit = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  }

  // 企业代理
  if (ctx.proxyUrl) {
    (fetchOpts as Record<string, unknown>).dispatcher = new ProxyAgent({
      uri: ctx.proxyUrl,
      connect: { rejectUnauthorized: false },
    })
  }

  const resp = await fetch(url.toString(), fetchOpts)
  if (!resp.ok) {
    throw new Error(`Brave API HTTP ${resp.status}: ${await resp.text().catch(() => '')}`)
  }

  const data = (await resp.json()) as BraveResponse
  const results = data.web?.results ?? []

  if (results.length === 0) {
    return `搜索 "${query}" 无结果`
  }

  return formatResults(query, results, 'Brave Search')
}

/* ── DuckDuckGo HTML 抓取（备用） ─────────────── */

async function searchDuckDuckGo(
  query: string,
  count: number,
  ctx: ToolContext,
): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

  const fetchOpts: RequestInit = {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  }

  if (ctx.proxyUrl) {
    (fetchOpts as Record<string, unknown>).dispatcher = new ProxyAgent({
      uri: ctx.proxyUrl,
      connect: { rejectUnauthorized: false },
    })
  }

  const resp = await fetch(url, fetchOpts)
  if (!resp.ok) {
    throw new Error(`DuckDuckGo HTTP ${resp.status}`)
  }

  const html = await resp.text()

  // 简单 HTML 解析提取搜索结果
  const results: BraveWebResult[] = []

  // DuckDuckGo HTML 结果在 <a class="result__a"> 和 <a class="result__snippet">
  const resultBlocks = html.split(/class="result\s/)
  for (let i = 1; i < resultBlocks.length && results.length < count; i++) {
    const block = resultBlocks[i]

    // 提取 URL
    const urlMatch = block.match(/href="([^"]*?)"/)
    let resultUrl = urlMatch?.[1] ?? ''
    // DuckDuckGo 的链接可能是重定向格式
    if (resultUrl.includes('uddg=')) {
      const decoded = decodeURIComponent(resultUrl.split('uddg=')[1]?.split('&')[0] ?? '')
      if (decoded) resultUrl = decoded
    }

    // 提取标题
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
    const title = stripHtml(titleMatch?.[1] ?? '').trim()

    // 提取摘要
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\//)
    const description = stripHtml(snippetMatch?.[1] ?? '').trim()

    if (title && resultUrl && resultUrl.startsWith('http')) {
      results.push({ title, url: resultUrl, description })
    }
  }

  if (results.length === 0) {
    return `搜索 "${query}" 无结果（DuckDuckGo）`
  }

  return formatResults(query, results, 'DuckDuckGo')
}

/* ── 通用格式化 ───────────────────────────────── */

function formatResults(query: string, results: BraveWebResult[], provider: string): string {
  const lines: string[] = [
    `🔍 搜索: "${query}" (${provider}, ${results.length} 条结果)`,
    '',
  ]

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    lines.push(`${i + 1}. **${r.title ?? '(无标题)'}**`)
    lines.push(`   ${r.url}`)
    if (r.description) {
      lines.push(`   ${r.description}`)
    }
    if (r.age) {
      lines.push(`   📅 ${r.age}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function stripHtml(html: string): string {
  return html
    .replace(/<b>/gi, '')
    .replace(/<\/b>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
