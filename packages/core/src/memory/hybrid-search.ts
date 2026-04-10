/**
 * memory/hybrid-search.ts — 混合检索
 *
 * Phase K2 (GAP-37): BM25 + cosine 混合检索。
 */

import { cosineSimilarity, type EmbeddingProvider } from './embeddings.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HybridSearchOptions {
  query: string
  limit?: number       // default 10
  alpha?: number       // BM25 weight [0, 1], default 0.5
  minScore?: number    // minimum combined score, default 0.0
}

export interface HybridSearchResult {
  id: string
  text: string
  score: number        // combined score
  bm25Score: number
  cosineScore: number
  category?: string
}

export interface MemoryRecord {
  id: string
  text: string
  category?: string
  embedding?: Float32Array | null
  bm25Score?: number
  /** M2: 创建时间戳(ms)，用于 time decay */
  createdAt?: number
  /** M2: 置顶标记，pinned 条目不受 time decay 影响 */
  pinned?: boolean
}

// ─── Score Fusion ───────────────────────────────────────────────────────────

/**
 * 归一化分数到 [0, 1] 范围（min-max）。
 */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return []
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min
  if (range === 0) return scores.map(() => scores[0] > 0 ? 1 : 0)
  return scores.map(s => (s - min) / range)
}

/**
 * 对 BM25 结果和向量结果做 score fusion。
 *
 * @param bm25Results — FTS5 BM25 搜索结果
 * @param queryVec — 查询向量
 * @param alpha — BM25 权重 (0~1)，默认 0.5
 */
export function fuseScores(
  bm25Results: MemoryRecord[],
  allRecords: MemoryRecord[],
  queryVec: Float32Array | null,
  alpha: number = 0.5,
): HybridSearchResult[] {
  // 构建 id → record 映射
  const recordMap = new Map<string, MemoryRecord>()
  for (const r of bm25Results) recordMap.set(r.id, r)
  for (const r of allRecords) {
    if (!recordMap.has(r.id)) recordMap.set(r.id, r)
  }

  const ids = [...recordMap.keys()]

  // BM25 分数
  const bm25Map = new Map<string, number>()
  for (const r of bm25Results) {
    bm25Map.set(r.id, r.bm25Score ?? 0)
  }
  const bm25Raw = ids.map(id => bm25Map.get(id) ?? 0)
  const bm25Norm = normalizeScores(bm25Raw)

  // Cosine 分数
  const cosineRaw: number[] = []
  if (queryVec) {
    for (const id of ids) {
      const rec = recordMap.get(id)!
      if (rec.embedding) {
        cosineRaw.push(cosineSimilarity(queryVec, rec.embedding))
      } else {
        cosineRaw.push(0)
      }
    }
  } else {
    ids.forEach(() => cosineRaw.push(0))
  }
  const cosineNorm = normalizeScores(cosineRaw)

  // Fusion + Time Decay (M2)
  const LN2_OVER_30 = Math.LN2 / 30 // half-life = 30 days
  const now = Date.now()
  const results: HybridSearchResult[] = ids.map((id, i) => {
    const rec = recordMap.get(id)!
    const rawScore = alpha * bm25Norm[i] + (1 - alpha) * cosineNorm[i]
    // Time decay: exp(-ln2/30 * ageDays), pinned records exempt
    let score = rawScore
    if (rec.createdAt && !rec.pinned) {
      const ageDays = (now - rec.createdAt) / 86_400_000
      if (ageDays > 0) {
        score *= Math.exp(-LN2_OVER_30 * ageDays)
      }
    }
    return {
      id,
      text: rec.text,
      bm25Score: bm25Norm[i],
      cosineScore: cosineNorm[i],
      score,
      category: rec.category,
    }
  })

  results.sort((a, b) => b.score - a.score)
  return results
}

/**
 * 执行混合搜索的完整流程。
 */
export async function hybridSearch(
  bm25Results: MemoryRecord[],
  allRecordsWithEmbedding: MemoryRecord[],
  queryText: string,
  embedder: EmbeddingProvider | null,
  options: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const limit = options.limit ?? 10
  const alpha = options.alpha ?? 0.5
  const minScore = options.minScore ?? 0

  // 计算查询向量
  let queryVec: Float32Array | null = null
  if (embedder) {
    const [vec] = await embedder.embed([queryText])
    queryVec = vec
  }

  // Score fusion
  const fused = fuseScores(bm25Results, allRecordsWithEmbedding, queryVec, alpha)

  // 过滤 + 截断
  return fused
    .filter(r => r.score >= minScore)
    .slice(0, limit)
}
