/**
 * search/ddg-provider.ts — DuckDuckGo HTML 抓取 provider
 *
 * Phase I.5b G5: 将 web-search.ts 中的 DuckDuckGo 逻辑抽取为 WebSearchProvider 实现。
 */

import type { WebSearchProvider, WebSearchResult } from './types.js'
import { ProxyAgent } from 'undici'

const SEARCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly id = 'duckduckgo'
  readonly name = 'DuckDuckGo'

  private proxyUrl?: string

  constructor(opts?: { proxyUrl?: string }) {
    this.proxyUrl = opts?.proxyUrl
  }

  /** DuckDuckGo 不需要 API key，始终可用 */
  isAvailable(): boolean {
    return true
  }

  async search(query: string, options?: { count?: number; language?: string }): Promise<WebSearchResult[]> {
    const count = options?.count ?? 10
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

    if (this.proxyUrl) {
      (fetchOpts as Record<string, unknown>).dispatcher = new ProxyAgent({
        uri: this.proxyUrl,
        connect: { rejectUnauthorized: false },
      })
    }

    const resp = await fetch(url, fetchOpts)
    if (!resp.ok) {
      throw new Error(`DuckDuckGo HTTP ${resp.status}`)
    }

    const html = await resp.text()
    const results: WebSearchResult[] = []

    // DuckDuckGo HTML 结果在 <a class="result__a"> 和 <a class="result__snippet">
    const resultBlocks = html.split(/class="result\s/)
    for (let i = 1; i < resultBlocks.length && results.length < count; i++) {
      const block = resultBlocks[i]

      // 提取 URL
      const urlMatch = block.match(/href="([^"]*?)"/)
      let resultUrl = urlMatch?.[1] ?? ''
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
        results.push({
          title,
          url: resultUrl,
          snippet: description,
          source: this.id,
        })
      }
    }

    return results
  }
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
