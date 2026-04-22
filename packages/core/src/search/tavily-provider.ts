/**
 * search/tavily-provider.ts — Tavily Search API provider
 *
 * Tavily 是专为 AI Agent 设计的搜索 API，返回结构化结果，质量优秀。
 * 免费版每月 1000 次查询。https://tavily.com
 */

import type { WebSearchProvider, WebSearchResult } from './types.js'

const SEARCH_TIMEOUT_MS = 15_000

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyResponse {
  results: TavilyResult[]
  query: string
  answer?: string
}

export class TavilySearchProvider implements WebSearchProvider {
  readonly id = 'tavily'
  readonly name = 'Tavily Search'

  isAvailable(): boolean {
    return !!process.env.TAVILY_API_KEY
  }

  async search(query: string, options?: { count?: number; language?: string }): Promise<WebSearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) throw new Error('TAVILY_API_KEY not configured')

    const count = options?.count ?? 10

    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: count,
        search_depth: 'basic',
        include_answer: false,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })

    if (!resp.ok) {
      throw new Error(`Tavily API HTTP ${resp.status}: ${await resp.text().catch(() => '')}`)
    }

    const data = (await resp.json()) as TavilyResponse

    return (data.results ?? []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      source: 'tavily',
    }))
  }
}
