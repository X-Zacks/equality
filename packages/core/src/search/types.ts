/**
 * search/types.ts — Web Search 类型定义
 *
 * Phase L2 (GAP-29): Web 搜索 provider 抽象层。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string    // provider id
}

export interface WebSearchOptions {
  count?: number
  language?: string
  providerId?: string
}

export interface WebSearchProvider {
  readonly id: string
  readonly name: string
  isAvailable(): boolean | Promise<boolean>
  search(query: string, options?: { count?: number; language?: string }): Promise<WebSearchResult[]>
}
