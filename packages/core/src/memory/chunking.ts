/**
 * memory/chunking.ts — 文本分块
 *
 * Phase K2 (GAP-37): 将长文本切分为适合 embedding 的片段。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChunkOptions {
  /** 每块最大字符数（近似 token：1 token ≈ 4 字符） */
  maxChars?: number
  /** 相邻块重叠字符数 */
  overlapChars?: number
}

export interface TextChunk {
  text: string
  index: number
  startOffset: number
  endOffset: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 2048   // ~512 tokens
const DEFAULT_OVERLAP = 200      // ~50 tokens

// 句子边界正则（中英文）
const SENTENCE_BOUNDARY = /(?<=[.!?。！？\n])\s*/g

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 将长文本切分为块，在句子边界对齐。
 */
export function chunkText(text: string, opts?: ChunkOptions): TextChunk[] {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS
  const overlapChars = opts?.overlapChars ?? DEFAULT_OVERLAP

  if (!text || text.length <= maxChars) {
    return text ? [{ text, index: 0, startOffset: 0, endOffset: text.length }] : []
  }

  // 先按句子拆分
  const sentences = splitSentences(text)
  const chunks: TextChunk[] = []
  let currentChars = 0
  let currentSentences: string[] = []
  let startOffset = 0
  let currentOffset = 0

  for (const sentence of sentences) {
    if (currentChars + sentence.length > maxChars && currentSentences.length > 0) {
      // 输出当前块
      const chunkText = currentSentences.join('')
      chunks.push({
        text: chunkText,
        index: chunks.length,
        startOffset,
        endOffset: currentOffset,
      })

      // 回溯 overlap
      const overlapSentences: string[] = []
      let overlapLen = 0
      for (let i = currentSentences.length - 1; i >= 0 && overlapLen < overlapChars; i--) {
        overlapSentences.unshift(currentSentences[i])
        overlapLen += currentSentences[i].length
      }

      startOffset = currentOffset - overlapLen
      currentSentences = overlapSentences
      currentChars = overlapLen
    }

    currentSentences.push(sentence)
    currentChars += sentence.length
    currentOffset += sentence.length
  }

  // 最后一块
  if (currentSentences.length > 0) {
    chunks.push({
      text: currentSentences.join(''),
      index: chunks.length,
      startOffset,
      endOffset: currentOffset,
    })
  }

  return chunks
}

/**
 * 按句子边界拆分文本。
 */
function splitSentences(text: string): string[] {
  const parts = text.split(SENTENCE_BOUNDARY)
  return parts.filter(p => p.length > 0)
}
