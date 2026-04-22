/**
 * skills/retriever.ts — Skill 检索器
 *
 * BM25 + 关键词混合检索，允许 Agent 按需搜索可用 Skills。
 * 替代全量注入，降低 token 消耗。
 */

import type { Skill } from './types.js'

interface ScoredSkill {
  skill: Skill
  score: number
}

// ─── BM25 简易实现 ──────────────────────────────────────────────────────────

const BM25_K1 = 1.2
const BM25_B = 0.75

/** 中文 + 英文分词（简易） */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0)
}

interface BM25Index {
  /** 每个文档的 token 列表 */
  docs: string[][]
  /** 平均文档长度 */
  avgDl: number
  /** 倒排索引：token → 包含此 token 的文档索引集合 */
  df: Map<string, number>
  /** 文档数 */
  n: number
}

function buildBM25Index(texts: string[]): BM25Index {
  const docs = texts.map(tokenize)
  const avgDl = docs.reduce((sum, d) => sum + d.length, 0) / (docs.length || 1)
  const df = new Map<string, number>()
  for (const doc of docs) {
    const seen = new Set(doc)
    for (const token of seen) {
      df.set(token, (df.get(token) ?? 0) + 1)
    }
  }
  return { docs, avgDl, df, n: docs.length }
}

function bm25Score(query: string[], docIdx: number, index: BM25Index): number {
  const doc = index.docs[docIdx]
  const dl = doc.length
  // 统计文档中每个 token 的频次
  const tf = new Map<string, number>()
  for (const t of doc) {
    tf.set(t, (tf.get(t) ?? 0) + 1)
  }

  let score = 0
  for (const term of query) {
    const termTf = tf.get(term) ?? 0
    if (termTf === 0) continue
    const termDf = index.df.get(term) ?? 0
    const idf = Math.log((index.n - termDf + 0.5) / (termDf + 0.5) + 1)
    const numerator = termTf * (BM25_K1 + 1)
    const denominator = termTf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / index.avgDl))
    score += idf * (numerator / denominator)
  }
  return score
}

// ─── SkillRetriever 类 ──────────────────────────────────────────────────────

export class SkillRetriever {
  private skills: Skill[] = []
  private index: BM25Index | null = null
  private texts: string[] = []

  /** 重建索引 */
  rebuild(skills: Skill[]): void {
    this.skills = skills
    // 构建搜索文本：name + description + category
    this.texts = skills.map(s =>
      `${s.name} ${s.description} ${s.metadata.category ?? ''}`
    )
    this.index = buildBM25Index(this.texts)
  }

  /** 搜索 Skills */
  search(query: string, topK = 5): ScoredSkill[] {
    if (!this.index || this.skills.length === 0) return []

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    // 1. 名称精确/前缀匹配（高优先级）
    const exactMatches: ScoredSkill[] = []
    const queryLower = query.toLowerCase()
    for (const skill of this.skills) {
      if (skill.name.toLowerCase() === queryLower) {
        exactMatches.push({ skill, score: 100 })
      } else if (skill.name.toLowerCase().startsWith(queryLower)) {
        exactMatches.push({ skill, score: 50 })
      }
    }

    // 2. Category 匹配
    const categoryMatches: ScoredSkill[] = []
    for (const skill of this.skills) {
      if (skill.metadata.category && queryLower.includes(skill.metadata.category)) {
        if (!exactMatches.find(m => m.skill.name === skill.name)) {
          categoryMatches.push({ skill, score: 20 })
        }
      }
    }

    // 3. BM25 评分
    const bm25Scores: ScoredSkill[] = []
    for (let i = 0; i < this.skills.length; i++) {
      const score = bm25Score(queryTokens, i, this.index)
      if (score > 0) {
        const skill = this.skills[i]
        // 跳过已在精确/category 匹配中的
        if (!exactMatches.find(m => m.skill.name === skill.name) &&
            !categoryMatches.find(m => m.skill.name === skill.name)) {
          bm25Scores.push({ skill, score })
        }
      }
    }

    // 合并结果，按 score 降序
    const merged = [...exactMatches, ...categoryMatches, ...bm25Scores]
    merged.sort((a, b) => b.score - a.score)

    return merged.slice(0, topK)
  }
}

// ─── 全局单例 ───────────────────────────────────────────────────────────────

let _globalRetriever: SkillRetriever | null = null

export function getGlobalRetriever(): SkillRetriever {
  if (!_globalRetriever) {
    _globalRetriever = new SkillRetriever()
  }
  return _globalRetriever
}
