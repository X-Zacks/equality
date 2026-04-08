/**
 * indexer/search-engine.ts — 代码搜索引擎
 *
 * Phase N3 (N3.3.1): 混合检索（语义 + 关键词 + 符号）
 * 复用 Phase K 的 RRF 融合算法。
 */

import type { CodeChunk } from './chunk-indexer.js'
import type { EmbeddingProvider } from '../memory/embeddings.js'
import { cosineSimilarity } from '../memory/embeddings.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type MatchType = 'semantic' | 'keyword' | 'symbol'

export interface CodeSearchResult {
  /** 文件路径 */
  filePath: string
  /** 起始行号 */
  startLine: number
  /** 结束行号 */
  endLine: number
  /** 块内容 */
  content: string
  /** 融合分数 (0-1) */
  score: number
  /** 最佳匹配类型 */
  matchType: MatchType
  /** 块中的符号 */
  symbols: string[]
}

export interface SearchOptions {
  /** 最大返回结果数（默认 10） */
  maxResults?: number
  /** 文件过滤 glob 模式 */
  fileFilter?: string[]
  /** 搜索模式：all=全部, semantic=仅语义, keyword=仅关键词, symbol=仅符号 */
  mode?: 'all' | 'semantic' | 'keyword' | 'symbol'
}

export interface IndexStats {
  totalFiles: number
  totalChunks: number
  totalSymbols: number
  indexSizeBytes: number
  lastBuildAt: number
  lastBuildDurationMs: number
}

// ─── RRF 融合 ────────────────────────────────────────────────────────────────

/** Reciprocal Rank Fusion (RRF) 参数 */
const RRF_K = 60

/**
 * RRF 分数计算。
 * 给定多个排名列表中的排名（1-based），计算 RRF 融合分数。
 */
function rrfScore(ranks: number[]): number {
  let score = 0
  for (const rank of ranks) {
    if (rank > 0) {
      score += 1 / (RRF_K + rank)
    }
  }
  return score
}

// ─── 简易 glob 匹配 ──────────────────────────────────────────────────────────

function matchGlobSimple(pattern: string, path: string): boolean {
  const regStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/§§/g, '.*')
  return new RegExp(`^${regStr}$`).test(path.replace(/\\/g, '/'))
}

// ─── CodeSearchEngine 类 ─────────────────────────────────────────────────────

export class CodeSearchEngine {
  private _chunks: CodeChunk[] = []
  private _embeddingProvider?: EmbeddingProvider
  private _buildStats: Pick<IndexStats, 'lastBuildAt' | 'lastBuildDurationMs'> = {
    lastBuildAt: 0,
    lastBuildDurationMs: 0,
  }

  constructor(embeddingProvider?: EmbeddingProvider) {
    this._embeddingProvider = embeddingProvider
  }

  /**
   * 导入分块数据到搜索引擎。
   */
  loadChunks(chunks: CodeChunk[]): void {
    const start = Date.now()
    this._chunks = [...chunks]
    this._buildStats = {
      lastBuildAt: Date.now(),
      lastBuildDurationMs: Date.now() - start,
    }
  }

  /**
   * 追加分块。
   */
  addChunks(chunks: CodeChunk[]): void {
    this._chunks.push(...chunks)
  }

  /**
   * 搜索代码。
   *
   * 混合搜索策略：
   * 1. 符号搜索 — 精确匹配 symbols 数组
   * 2. 关键词搜索 — 文本 token overlap
   * 3. 语义搜索 — 嵌入向量余弦相似度（需要 embeddingProvider）
   *
   * 使用 RRF 融合所有排名。
   */
  async search(query: string, options?: SearchOptions): Promise<CodeSearchResult[]> {
    const maxResults = options?.maxResults ?? 10
    const mode = options?.mode ?? 'all'

    if (this._chunks.length === 0) return []

    // 过滤文件
    let candidates = this._chunks
    if (options?.fileFilter?.length) {
      candidates = candidates.filter(c =>
        options.fileFilter!.some(p => matchGlobSimple(p, c.filePath)),
      )
    }

    if (candidates.length === 0) return []

    // 各子搜索的排名 Map<chunkId, rank>
    const symbolRanks = new Map<string, number>()
    const keywordRanks = new Map<string, number>()
    const semanticRanks = new Map<string, number>()

    // 1. 符号搜索
    if (mode === 'all' || mode === 'symbol') {
      const queryLower = query.toLowerCase()
      const scored = candidates
        .map(c => ({
          chunk: c,
          score: c.symbols.some(s => s.toLowerCase() === queryLower) ? 1
            : c.symbols.some(s => s.toLowerCase().includes(queryLower)) ? 0.5
            : 0,
        }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)

      scored.forEach((s, i) => symbolRanks.set(s.chunk.id, i + 1))
    }

    // 2. 关键词搜索（token overlap）
    if (mode === 'all' || mode === 'keyword') {
      const queryTokens = tokenize(query)
      if (queryTokens.length > 0) {
        const scored = candidates
          .map(c => {
            const contentTokens = tokenize(c.content)
            const overlap = queryTokens.filter(t => contentTokens.includes(t)).length
            return { chunk: c, score: overlap / queryTokens.length }
          })
          .filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score)

        scored.forEach((s, i) => keywordRanks.set(s.chunk.id, i + 1))
      }
    }

    // 3. 语义搜索
    if ((mode === 'all' || mode === 'semantic') && this._embeddingProvider) {
      const chunksWithEmbedding = candidates.filter(c => c.embedding?.length)
      if (chunksWithEmbedding.length > 0) {
        const queryEmbeddingArr = await this._embeddingProvider.embed([query])
        const queryEmb = queryEmbeddingArr[0]

        const scored = chunksWithEmbedding
          .map(c => ({
            chunk: c,
            score: cosineSimilarity(queryEmb, new Float32Array(c.embedding!)),
          }))
          .sort((a, b) => b.score - a.score)

        scored.forEach((s, i) => semanticRanks.set(s.chunk.id, i + 1))
      }
    }

    // RRF 融合
    const allChunkIds = new Set([
      ...symbolRanks.keys(),
      ...keywordRanks.keys(),
      ...semanticRanks.keys(),
    ])

    const fused: Array<{ chunk: CodeChunk; score: number; bestType: MatchType }> = []

    for (const chunkId of allChunkIds) {
      const chunk = candidates.find(c => c.id === chunkId)
      if (!chunk) continue

      const ranks: number[] = []
      if (symbolRanks.has(chunkId)) ranks.push(symbolRanks.get(chunkId)!)
      if (keywordRanks.has(chunkId)) ranks.push(keywordRanks.get(chunkId)!)
      if (semanticRanks.has(chunkId)) ranks.push(semanticRanks.get(chunkId)!)

      const score = rrfScore(ranks)

      // 确定最佳匹配类型
      let bestType: MatchType = 'keyword'
      const sr = symbolRanks.get(chunkId) ?? Infinity
      const kr = keywordRanks.get(chunkId) ?? Infinity
      const mr = semanticRanks.get(chunkId) ?? Infinity
      if (sr <= kr && sr <= mr) bestType = 'symbol'
      else if (mr <= kr) bestType = 'semantic'

      fused.push({ chunk, score, bestType })
    }

    // 排序 + 截断
    fused.sort((a, b) => b.score - a.score)

    return fused.slice(0, maxResults).map(f => ({
      filePath: f.chunk.filePath,
      startLine: f.chunk.startLine,
      endLine: f.chunk.endLine,
      content: f.chunk.content,
      score: f.score,
      matchType: f.bestType,
      symbols: f.chunk.symbols,
    }))
  }

  /** 获取索引统计 */
  getStats(): IndexStats {
    const uniqueFiles = new Set(this._chunks.map(c => c.filePath))
    const allSymbols = new Set(this._chunks.flatMap(c => c.symbols))
    const indexSize = this._chunks.reduce((acc, c) => acc + c.content.length, 0)

    return {
      totalFiles: uniqueFiles.size,
      totalChunks: this._chunks.length,
      totalSymbols: allSymbols.size,
      indexSizeBytes: indexSize,
      lastBuildAt: this._buildStats.lastBuildAt,
      lastBuildDurationMs: this._buildStats.lastBuildDurationMs,
    }
  }

  /** 清空索引 */
  clear(): void {
    this._chunks = []
  }
}

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

/** 简单分词（空格 + 标点） */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(t => t.length > 1)
}
