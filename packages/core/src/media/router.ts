/**
 * media/router.ts — 媒体路由器
 *
 * Phase M1 (GAP-30): 根据文件类型自动路由到合适的 MediaProvider。
 */

import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { MediaProvider, MediaResult, MediaType, MediaInput } from './types.js'
import { EXTENSION_MAP, DEFAULT_SIZE_LIMITS } from './types.js'

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: MediaResult
  expiresAt: number
}

const DEFAULT_CACHE_TTL = 10 * 60 * 1000 // 10 min

// ─── MediaRouter ────────────────────────────────────────────────────────────

export interface MediaRouterOptions {
  cacheTtlMs?: number
  enableCache?: boolean
}

export class MediaRouter {
  private providers = new Map<string, MediaProvider>()
  private order: string[] = []
  private cache = new Map<string, CacheEntry>()
  private cacheTtl: number
  private cacheEnabled: boolean

  constructor(opts?: MediaRouterOptions) {
    this.cacheTtl = opts?.cacheTtlMs ?? DEFAULT_CACHE_TTL
    this.cacheEnabled = opts?.enableCache ?? true
  }

  /**
   * 注册媒体 provider。
   */
  register(provider: MediaProvider): void {
    this.providers.set(provider.id, provider)
    if (!this.order.includes(provider.id)) {
      this.order.push(provider.id)
    }
  }

  /**
   * 移除 provider。
   */
  unregister(providerId: string): boolean {
    const existed = this.providers.delete(providerId)
    this.order = this.order.filter(id => id !== providerId)
    return existed
  }

  /**
   * 根据文件扩展名检测媒体类型。
   */
  detectType(filePath: string): MediaType | null {
    const ext = extname(filePath).toLowerCase().replace('.', '')
    return EXTENSION_MAP[ext] ?? null
  }

  /**
   * 路由文件到合适的 provider 并处理。
   *
   * @returns 处理结果，或 null（无法处理时）
   */
  async route(filePath: string, opts?: { sizeBytes?: number }): Promise<MediaResult | null> {
    const type = this.detectType(filePath)
    if (!type) return null

    // 查找可用 provider
    const provider = await this.findProvider(type)
    if (!provider) return null

    // 文件大小检查
    const sizeBytes = opts?.sizeBytes ?? await this.getFileSize(filePath)
    const maxSize = provider.maxSizeBytes[type] ?? DEFAULT_SIZE_LIMITS[type]
    if (sizeBytes > maxSize) {
      return null // 超过大小限制
    }

    // 缓存检查
    if (this.cacheEnabled) {
      const cacheKey = await this.getCacheKey(filePath, sizeBytes)
      const cached = this.cache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.result, cached: true }
      }
    }

    // 构造输入
    const input: MediaInput = {
      type,
      filePath,
      mimeType: this.getMimeType(type, filePath),
      sizeBytes,
    }

    // 执行处理
    const startMs = Date.now()
    const result = await provider.process(input)

    // 缓存结果
    if (this.cacheEnabled) {
      const cacheKey = await this.getCacheKey(filePath, sizeBytes)
      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.cacheTtl,
      })
    }

    return result
  }

  /**
   * 列出已注册 provider 及其状态。
   */
  async listProviders(): Promise<Array<{ id: string; types: MediaType[]; available: boolean }>> {
    const results = []
    for (const id of this.order) {
      const p = this.providers.get(id)
      if (p) {
        results.push({
          id: p.id,
          types: [...p.supportedTypes],
          available: await p.isAvailable(),
        })
      }
    }
    return results
  }

  /**
   * 已注册 provider 数量。
   */
  get size(): number {
    return this.providers.size
  }

  /**
   * 清除缓存。
   */
  clearCache(): void {
    this.cache.clear()
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async findProvider(type: MediaType): Promise<MediaProvider | undefined> {
    for (const id of this.order) {
      const p = this.providers.get(id)
      if (p && p.supportedTypes.includes(type) && await p.isAvailable()) {
        return p
      }
    }
    return undefined
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      const s = await stat(filePath)
      return s.size
    } catch {
      return 0
    }
  }

  private async getCacheKey(filePath: string, sizeBytes: number): Promise<string> {
    // 基于路径 + 大小的简单 hash（不读完整文件内容，性能优先）
    return createHash('sha256').update(`${filePath}:${sizeBytes}`).digest('hex').slice(0, 16)
  }

  private getMimeType(type: MediaType, filePath: string): string {
    const ext = extname(filePath).toLowerCase().replace('.', '')
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/m4a',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      webm: 'audio/webm',
      pdf: 'application/pdf',
    }
    return mimeMap[ext] ?? `${type}/*`
  }
}
