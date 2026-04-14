/**
 * search/brave-provider.ts — Brave Search API provider
 *
 * Phase I.5b G5: 将 web-search.ts 中的 Brave 逻辑抽取为 WebSearchProvider 实现。
 */

import type { WebSearchProvider, WebSearchResult } from './types.js'
import { ProxyAgent } from 'undici'

const SEARCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

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

export class BraveSearchProvider implements WebSearchProvider {
  readonly id = 'brave'
  readonly name = 'Brave Search'

  private proxyUrl?: string

  constructor(opts?: { proxyUrl?: string }) {
    this.proxyUrl = opts?.proxyUrl
  }

  isAvailable(): boolean {
    return !!process.env.BRAVE_SEARCH_API_KEY
  }

  async search(query: string, options?: { count?: number; language?: string }): Promise<WebSearchResult[]> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY
    if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY not configured')

    const count = options?.count ?? 10
    const language = options?.language ?? 'zh-CN'

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

    if (this.proxyUrl) {
      (fetchOpts as Record<string, unknown>).dispatcher = new ProxyAgent({
        uri: this.proxyUrl,
        connect: { rejectUnauthorized: false },
      })
    }

    const resp = await fetch(url.toString(), fetchOpts)
    if (!resp.ok) {
      throw new Error(`Brave API HTTP ${resp.status}: ${await resp.text().catch(() => '')}`)
    }

    const data = (await resp.json()) as BraveResponse
    const results = data.web?.results ?? []

    return results.map(r => ({
      title: r.title ?? '(无标题)',
      url: r.url ?? '',
      snippet: r.description ?? '',
      source: this.id,
    }))
  }
}
