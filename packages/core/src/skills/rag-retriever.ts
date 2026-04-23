/**
 * skills/rag-retriever.ts — Skill RAG 检索器
 *
 * 基于 embedding 向量 + BM25 混合检索，替代纯关键词匹配。
 * 索引持久化到 SQLite，重启后毫秒级恢复。
 */

import type { Skill } from './types.js'
import type { EmbeddingProvider } from '../memory/embeddings.js'
import { cosineSimilarity } from '../memory/embeddings.js'
import { chunkSkill, type SkillChunk } from './chunker.js'
import { SkillEmbeddingDB, type StoredChunk } from './skill-embedding-db.js'
import type Database from 'better-sqlite3'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SkillSearchResult {
  skillName: string
  score: number
  matchedChunks: Array<{ heading: string; content: string; score: number }>
  skill?: Skill
}

interface IndexedChunk extends SkillChunk {
  embedding: Float32Array
  tokens: string[]
}

// ─── BM25 (简易) ────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0)
}

function bm25ScoreOne(
  queryTokens: string[],
  docTokens: string[],
  df: Map<string, number>,
  avgDl: number,
  n: number
): number {
  const k1 = 1.2
  const b = 0.75
  const dl = docTokens.length
  const tf = new Map<string, number>()
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1)

  let score = 0
  for (const term of queryTokens) {
    const termTf = tf.get(term) ?? 0
    if (termTf === 0) continue
    const termDf = df.get(term) ?? 0
    const idf = Math.log((n - termDf + 0.5) / (termDf + 0.5) + 1)
    score += idf * ((termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * (dl / avgDl))))
  }
  return score
}

// ─── SkillRAGRetriever ──────────────────────────────────────────────────────

export class SkillRAGRetriever {
  private chunks: IndexedChunk[] = []
  private df = new Map<string, number>()
  private avgDl = 0
  private skillMap = new Map<string, Skill>()
  private db: SkillEmbeddingDB | null = null
  private provider: EmbeddingProvider

  constructor(provider: EmbeddingProvider, db?: Database.Database) {
    this.provider = provider
    if (db) {
      this.db = new SkillEmbeddingDB(db)
    }
  }

  /** 构建或恢复索引 */
  async buildIndex(skills: Skill[]): Promise<void> {
    // 记录 skill map
    this.skillMap.clear()
    for (const s of skills) this.skillMap.set(s.name, s)

    // 尝试从 SQLite 恢复
    if (this.db) {
      const storedModel = this.db.getStoredModelId()
      if (storedModel === this.provider.modelId) {
        const storedNames = new Set(this.db.getStoredSkillNames())
        const currentNames = new Set(skills.map(s => s.name))

        // 如果 Skill 集合没有变化，直接从 DB 恢复
        if (storedNames.size === currentNames.size &&
            [...currentNames].every(n => storedNames.has(n))) {
          console.log('[SkillRAG] Restoring index from SQLite cache')
          const stored = this.db.getAllChunks()
          this.chunks = stored.map(s => ({
            skillName: s.skillName,
            chunkId: s.chunkId,
            heading: s.heading,
            content: s.content,
            embedding: s.embedding,
            tokens: tokenize(s.content),
          }))
          this.rebuildBM25Stats()
          return
        }

        // 增量更新：删除已移除的 Skill，添加新 Skill
        const toRemove = [...storedNames].filter(n => !currentNames.has(n))
        const toAdd = skills.filter(s => !storedNames.has(s.name))
        const unchanged = skills.filter(s => storedNames.has(s.name))

        for (const name of toRemove) this.db.deleteSkillChunks(name)

        // 恢复未变更的
        const stored = this.db.getAllChunks()
        this.chunks = stored
          .filter(s => !toRemove.includes(s.skillName))
          .map(s => ({
            skillName: s.skillName,
            chunkId: s.chunkId,
            heading: s.heading,
            content: s.content,
            embedding: s.embedding,
            tokens: tokenize(s.content),
          }))

        // 嵌入新增的
        if (toAdd.length > 0) {
          console.log(`[SkillRAG] Incrementally indexing ${toAdd.length} new skills`)
          await this.embedAndAppendSkills(toAdd)
        }

        this.rebuildBM25Stats()
        return
      } else {
        // model 不同 → 全量重建
        this.db.clear()
      }
    }

    // 全量构建
    console.log(`[SkillRAG] Building full index for ${skills.length} skills`)
    this.chunks = []
    await this.embedAndAppendSkills(skills)
    this.rebuildBM25Stats()
  }

  /** 嵌入一批 Skills 并追加到 chunks + DB */
  private async embedAndAppendSkills(skills: Skill[]): Promise<void> {
    const newChunks: SkillChunk[] = []
    for (const skill of skills) {
      newChunks.push(...chunkSkill(skill.name, skill.description, skill.body))
    }

    if (newChunks.length === 0) return

    // 批量 embed
    const texts = newChunks.map(c => c.content)
    const embeddings = await this.provider.embed(texts)

    const indexed: IndexedChunk[] = newChunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i],
      tokens: tokenize(c.content),
    }))

    this.chunks.push(...indexed)

    // 持久化到 DB
    if (this.db) {
      const stored: StoredChunk[] = indexed.map(c => ({
        chunkId: c.chunkId,
        skillName: c.skillName,
        heading: c.heading,
        content: c.content,
        embedding: c.embedding,
      }))
      this.db.upsertChunks(stored, this.provider.modelId)
    }
  }

  /** 重建 BM25 统计 */
  private rebuildBM25Stats(): void {
    this.df.clear()
    let totalLen = 0
    for (const chunk of this.chunks) {
      totalLen += chunk.tokens.length
      const seen = new Set(chunk.tokens)
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    }
    this.avgDl = this.chunks.length > 0 ? totalLen / this.chunks.length : 0
  }

  /** 搜索 */
  async search(query: string, topK = 5): Promise<SkillSearchResult[]> {
    if (this.chunks.length === 0) return []

    const queryTokens = tokenize(query)
    const queryEmb = (await this.provider.embed([query]))[0]

    // 对每个 chunk 计算混合分数
    const scored = this.chunks.map(chunk => {
      const cosine = cosineSimilarity(queryEmb, chunk.embedding)
      const bm25 = bm25ScoreOne(queryTokens, chunk.tokens, this.df, this.avgDl, this.chunks.length)

      // 归一化 BM25（粗略）
      const score = 0.7 * cosine + 0.3 * Math.min(bm25 / 10, 1)

      return { chunk, score, cosine }
    })

    // 按分数排序
    scored.sort((a, b) => b.score - a.score)

    // 按 Skill 去重，保留最高分 chunk（同一 Skill 可返回多个 chunk）
    const bySkill = new Map<string, { score: number; chunks: typeof scored }>()
    for (const item of scored) {
      const name = item.chunk.skillName
      const existing = bySkill.get(name)
      if (!existing) {
        bySkill.set(name, { score: item.score, chunks: [item] })
      } else {
        existing.chunks.push(item)
      }
    }

    return [...bySkill.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK)
      .map(([name, { score, chunks: matched }]) => ({
        skillName: name,
        score,
        matchedChunks: matched.slice(0, 3).map(m => ({
          heading: m.chunk.heading,
          content: m.chunk.content.slice(0, 300),
          score: m.score,
        })),
        skill: this.skillMap.get(name),
      }))
  }

  /** 索引单个新 Skill（对话中创建时使用） */
  async indexSkill(skill: Skill): Promise<void> {
    this.skillMap.set(skill.name, skill)
    // 先删除旧的
    this.chunks = this.chunks.filter(c => c.skillName !== skill.name)
    if (this.db) this.db.deleteSkillChunks(skill.name)
    // 嵌入新的
    await this.embedAndAppendSkills([skill])
    this.rebuildBM25Stats()
  }
}

// ─── 全局单例 ───────────────────────────────────────────────────────────────

let _globalRAGRetriever: SkillRAGRetriever | null = null

export function setGlobalRAGRetriever(r: SkillRAGRetriever): void {
  _globalRAGRetriever = r
}

export function getGlobalRAGRetriever(): SkillRAGRetriever | null {
  return _globalRAGRetriever
}
