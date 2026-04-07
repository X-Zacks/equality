/**
 * search/registry.ts — Web Search 注册中心
 *
 * Phase L2 (GAP-29): 管理搜索 provider 的注册、选择和调用。
 */

import type { WebSearchProvider, WebSearchResult, WebSearchOptions } from './types.js'

// ─── Registry ───────────────────────────────────────────────────────────────

export class WebSearchRegistry {
  private providers = new Map<string, WebSearchProvider>()
  private order: string[] = []  // 注册顺序（用于优先级）

  /**
   * 注册搜索 provider。
   */
  register(provider: WebSearchProvider): void {
    this.providers.set(provider.id, provider)
    if (!this.order.includes(provider.id)) {
      this.order.push(provider.id)
    }
  }

  /**
   * 移除搜索 provider。
   */
  unregister(providerId: string): boolean {
    const existed = this.providers.delete(providerId)
    this.order = this.order.filter(id => id !== providerId)
    return existed
  }

  /**
   * 获取指定 provider。
   */
  getProvider(id: string): WebSearchProvider | undefined {
    return this.providers.get(id)
  }

  /**
   * 自动选择第一个可用的 provider（按注册顺序）。
   */
  async getDefaultProvider(): Promise<WebSearchProvider | undefined> {
    for (const id of this.order) {
      const p = this.providers.get(id)
      if (p && await p.isAvailable()) return p
    }
    return undefined
  }

  /**
   * 列出所有 provider 信息。
   */
  async listProviders(): Promise<Array<{ id: string; name: string; available: boolean }>> {
    const results = []
    for (const [id, p] of this.providers) {
      results.push({
        id,
        name: p.name,
        available: await p.isAvailable(),
      })
    }
    return results
  }

  /**
   * 通过 registry 搜索。
   */
  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    let provider: WebSearchProvider | undefined

    if (options?.providerId) {
      provider = this.providers.get(options.providerId)
      if (!provider) throw new Error(`WebSearch provider "${options.providerId}" not found`)
    } else {
      provider = await this.getDefaultProvider()
    }

    if (!provider) return []

    return provider.search(query, {
      count: options?.count,
      language: options?.language,
    })
  }

  /**
   * 已注册 provider 数量。
   */
  get size(): number {
    return this.providers.size
  }

  /**
   * 清除所有 provider（测试用）。
   */
  clear(): void {
    this.providers.clear()
    this.order = []
  }
}
