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

// ─── Transformers.js Embedding (all-MiniLM-L6-v2, 384 维) ──────────────────

/**
 * 基于 @huggingface/transformers 的高质量 embedding provider。
 * 使用 all-MiniLM-L6-v2 ONNX 量化模型（~22MB），384 维输出。
 * 支持中英文语义搜索。
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 384
  readonly modelId = 'all-MiniLM-L6-v2'
  private pipe: any = null
  private initPromise: Promise<void> | null = null
  private failed = false

  constructor(private modelPath?: string) {}

  /**
   * 查找本地缓存的模型目录。
   * 优先级：1. 构造函数传入的 modelPath
   *         2. %APPDATA%/Equality/models/all-MiniLM-L6-v2/
   */
  private async resolveModelPath(): Promise<string> {
    if (this.modelPath) return this.modelPath

    const { join } = await import('node:path')
    const { existsSync } = await import('node:fs')
    const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
    const localDir = join(appData, 'Equality', 'models', 'all-MiniLM-L6-v2')
    const configFile = join(localDir, 'config.json')

    if (existsSync(configFile)) {
      console.log(`[Embedding] Found local model cache: ${localDir}`)
      return localDir
    }

    console.warn(`[Embedding] No local model cache found at ${localDir}`)
    console.warn(`[Embedding] Run "node scripts/download-model.mjs" to download from hf-mirror.com`)
    return 'Xenova/all-MiniLM-L6-v2'
  }

  async initialize(): Promise<void> {
    if (this.pipe) return
    if (this.failed) throw new Error('TransformersProvider previously failed to initialize')
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      try {
        const modelSource = await this.resolveModelPath()
        const isLocal = modelSource.includes('\\') || modelSource.includes(':') || modelSource.startsWith('/')
        // Dynamic import to avoid bundling issues when transformers.js is not available
        const { pipeline, env } = await import('@huggingface/transformers')

        // 如果是本地路径，禁用远程下载
        if (isLocal) {
          env.allowRemoteModels = false
          env.localModelPath = ''  // 使用绝对路径时不需要 prefix
        }

        this.pipe = await pipeline(
          'feature-extraction',
          modelSource,
          {
            dtype: 'q8',
            local_files_only: isLocal,
          }
        )
      } catch (err) {
        this.failed = true
        throw err
      }
    })()
    return this.initPromise
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    await this.initialize()
    const results: Float32Array[] = []
    for (const text of texts) {
      const output = await this.pipe!(text, { pooling: 'mean', normalize: true })
      results.push(new Float32Array(output.data as ArrayLike<number>))
    }
    return results
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * 创建 embedding provider，优先使用 transformers.js，失败则降级到 n-gram。
 */
export async function createEmbeddingProvider(
  modelPath?: string
): Promise<EmbeddingProvider> {
  try {
    const provider = new TransformersEmbeddingProvider(modelPath)
    await provider.initialize()
    console.log('[Embedding] TransformersProvider initialized (384d, all-MiniLM-L6-v2)')
    return provider
  } catch (err) {
    console.warn('[Embedding] TransformersProvider failed, falling back to SimpleProvider:', err)
    return new SimpleEmbeddingProvider()
  }
}

/**
 * 默认 embedding provider（轻量 n-gram）。
 * @deprecated 使用 createEmbeddingProvider() 获取最佳可用 provider
 */
export function createDefaultEmbeddingProvider(dimensions?: number): EmbeddingProvider {
  return new SimpleEmbeddingProvider(dimensions)
}
