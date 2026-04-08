/**
 * indexer/chunk-indexer.ts — 代码分块索引器
 *
 * Phase N3 (N3.2.1): 复用 Phase K 的 chunking + embeddings
 * - 按 chunkSize 分块，带 overlap
 * - 符号提取（函数名、类名、变量名）
 * - 延迟嵌入计算
 */

import { chunkText } from '../memory/chunking.js'
import type { EmbeddingProvider } from '../memory/embeddings.js'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type CodeChunkType = 'function' | 'class' | 'import' | 'comment' | 'block'

export interface CodeChunk {
  /** 确定性 hash（filePath + startLine + endLine） */
  id: string
  /** 文件路径（相对于项目根） */
  filePath: string
  /** 起始行号（1-based） */
  startLine: number
  /** 结束行号（1-based） */
  endLine: number
  /** 块内容 */
  content: string
  /** 编程语言 */
  language: string
  /** 块类型 */
  type: CodeChunkType
  /** 从块中提取的符号名 */
  symbols: string[]
  /** 嵌入向量（延迟计算） */
  embedding?: number[]
}

export interface ChunkIndexerConfig {
  /** 每块最大字符数（默认 1500） */
  chunkSize: number
  /** 块重叠字符数（默认 200） */
  chunkOverlap: number
  /** 嵌入提供器（可选，不提供则不计算嵌入） */
  embeddingProvider?: EmbeddingProvider
}

export const DEFAULT_CHUNK_CONFIG: ChunkIndexerConfig = {
  chunkSize: 1500,
  chunkOverlap: 200,
}

// ─── 语言推断 ─────────────────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.md': 'markdown',
  '.json': 'json',
  '.css': 'css',
  '.html': 'html',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.sh': 'shell',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
}

function inferLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return EXT_TO_LANG[ext] ?? 'text'
}

// ─── 符号提取 ─────────────────────────────────────────────────────────────────

/**
 * 从代码片段中提取符号名（函数、类、变量、接口、类型等）。
 * 使用正则表达式，覆盖常见的 TypeScript/JavaScript/Python 声明。
 */
function extractSymbols(content: string, language: string): string[] {
  const symbols = new Set<string>()

  // TypeScript / JavaScript
  if (language === 'typescript' || language === 'javascript') {
    // function foo(), async function bar()
    for (const m of content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) {
      symbols.add(m[1])
    }
    // class Foo
    for (const m of content.matchAll(/(?:export\s+)?class\s+(\w+)/g)) {
      symbols.add(m[1])
    }
    // interface Foo
    for (const m of content.matchAll(/(?:export\s+)?interface\s+(\w+)/g)) {
      symbols.add(m[1])
    }
    // type Foo =
    for (const m of content.matchAll(/(?:export\s+)?type\s+(\w+)\s*=/g)) {
      symbols.add(m[1])
    }
    // const/let/var foo =
    for (const m of content.matchAll(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/g)) {
      symbols.add(m[1])
    }
    // method foo() inside class
    for (const m of content.matchAll(/^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm)) {
      if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'import', 'export'].includes(m[1])) {
        symbols.add(m[1])
      }
    }
  }

  // Python
  if (language === 'python') {
    for (const m of content.matchAll(/(?:async\s+)?def\s+(\w+)/g)) {
      symbols.add(m[1])
    }
    for (const m of content.matchAll(/class\s+(\w+)/g)) {
      symbols.add(m[1])
    }
    for (const m of content.matchAll(/^(\w+)\s*=/gm)) {
      symbols.add(m[1])
    }
  }

  return [...symbols]
}

/**
 * 推断块的类型。
 */
function inferChunkType(content: string, language: string): CodeChunkType {
  const trimmed = content.trim()

  if (language === 'typescript' || language === 'javascript') {
    if (/^import\s/.test(trimmed)) return 'import'
    if (/^\/\*\*|^\/\//.test(trimmed) && !trimmed.includes('function') && !trimmed.includes('class')) return 'comment'
    if (/(?:export\s+)?class\s+\w+/.test(trimmed)) return 'class'
    if (/(?:export\s+)?(?:async\s+)?function\s+\w+/.test(trimmed)) return 'function'
  }

  if (language === 'python') {
    if (/^#/.test(trimmed)) return 'comment'
    if (/^class\s+\w+/.test(trimmed)) return 'class'
    if (/^(?:async\s+)?def\s+\w+/.test(trimmed)) return 'function'
    if (/^import\s|^from\s/.test(trimmed)) return 'import'
  }

  return 'block'
}

// ─── 哈希函数 ─────────────────────────────────────────────────────────────────

function chunkId(filePath: string, startLine: number, endLine: number): string {
  const input = `${filePath}:${startLine}:${endLine}`
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

// ─── ChunkIndexer 类 ─────────────────────────────────────────────────────────

export class ChunkIndexer {
  private readonly _config: ChunkIndexerConfig
  private _allChunks: CodeChunk[] = []

  constructor(config?: Partial<ChunkIndexerConfig>) {
    this._config = { ...DEFAULT_CHUNK_CONFIG, ...config }
  }

  /**
   * 索引单个文件。
   * @param filePath 相对路径
   * @param content 文件内容
   * @returns 分块列表
   */
  indexFile(filePath: string, content: string): CodeChunk[] {
    const language = inferLanguage(filePath)

    // 使用 Phase K 的 chunkText
    const textChunks = chunkText(content, {
      maxChars: this._config.chunkSize,
      overlapChars: this._config.chunkOverlap,
    })

    const lines = content.split('\n')

    const codeChunks: CodeChunk[] = textChunks.map(tc => {
      // 计算行号
      const startLine = content.substring(0, tc.startOffset).split('\n').length
      const endLine = content.substring(0, tc.endOffset).split('\n').length

      const symbols = extractSymbols(tc.text, language)
      const type = inferChunkType(tc.text, language)

      return {
        id: chunkId(filePath, startLine, endLine),
        filePath,
        startLine,
        endLine,
        content: tc.text,
        language,
        type,
        symbols,
      }
    })

    this._allChunks.push(...codeChunks)
    return codeChunks
  }

  /**
   * 批量索引多个文件。
   * @param files [relativePath, content] 数组
   * @returns 总分块数
   */
  indexBatch(files: Array<{ path: string; content: string }>): number {
    let total = 0
    for (const file of files) {
      const chunks = this.indexFile(file.path, file.content)
      total += chunks.length
    }
    return total
  }

  /**
   * 为所有未计算嵌入的块计算嵌入。
   * 需要 embeddingProvider 已配置。
   */
  async computeEmbeddings(): Promise<number> {
    if (!this._config.embeddingProvider) return 0

    const pending = this._allChunks.filter(c => !c.embedding)
    if (pending.length === 0) return 0

    const texts = pending.map(c => c.content)
    const embeddings = await this._config.embeddingProvider.embed(texts)

    for (let i = 0; i < pending.length; i++) {
      pending[i].embedding = Array.from(embeddings[i])
    }

    return pending.length
  }

  /** 获取所有已索引块 */
  get allChunks(): readonly CodeChunk[] {
    return this._allChunks
  }

  /** 块总数 */
  get chunkCount(): number {
    return this._allChunks.length
  }

  /** 清空索引 */
  clear(): void {
    this._allChunks = []
  }
}
