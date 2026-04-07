/**
 * memory/embeddings.ts — Embedding 计算
 *
 * Phase K2 (GAP-37): 本地/API embedding 计算，用于向量搜索。
 *
 * 设计：
 *   - EmbeddingProvider 接口定义 embed() 方法
 *   - SimpleEmbeddingProvider：基于字符 n-gram 的轻量实现（无外部依赖）
 *   - 后续可替换为 transformers.js 或 OpenAI Embeddings API
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<Float32Array[]>
  readonly dimensions: number
  readonly modelId: string
}

// ─── Cosine Similarity ──────────────────────────────────────────────────────

/**
 * 计算两个向量的余弦相似度。
 * 返回值范围 [-1, 1]，1 表示完全相同。
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ─── Simple N-gram Embedding (零依赖) ───────────────────────────────────────

const DEFAULT_DIMENSIONS = 128

/**
 * 基于字符 n-gram 的轻量 embedding provider。
 *
 * 不如 transformer 模型精确，但：
 *   - 零依赖（无需下载模型文件）
 *   - 同步计算（无 GPU/WASM 开销）
 *   - 足以在词汇相近时给出合理相似度
 *
 * 实际项目中建议替换为 transformers.js 的 all-MiniLM-L6-v2。
 */
export class SimpleEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  readonly modelId = 'simple-ngram-v1'

  constructor(dimensions: number = DEFAULT_DIMENSIONS) {
    this.dimensions = dimensions
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map(text => this.embedOne(text))
  }

  private embedOne(text: string): Float32Array {
    const vec = new Float32Array(this.dimensions)
    const lower = text.toLowerCase()

    // 字符 bigram + trigram hashing
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= lower.length - n; i++) {
        const gram = lower.slice(i, i + n)
        const hash = this.hashGram(gram)
        const idx = Math.abs(hash) % this.dimensions
        vec[idx] += hash > 0 ? 1 : -1
      }
    }

    // L2 normalize
    let norm = 0
    for (let i = 0; i < this.dimensions; i++) norm += vec[i] * vec[i]
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) vec[i] /= norm
    }

    return vec
  }

  private hashGram(gram: string): number {
    // FNV-1a hash
    let h = 0x811c9dc5
    for (let i = 0; i < gram.length; i++) {
      h ^= gram.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return h | 0
  }
}

/**
 * 默认 embedding provider（轻量 n-gram）。
 */
export function createDefaultEmbeddingProvider(dimensions?: number): EmbeddingProvider {
  return new SimpleEmbeddingProvider(dimensions)
}
