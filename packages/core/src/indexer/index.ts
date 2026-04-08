/**
 * indexer/index.ts — 代码索引模块统一导出
 *
 * Phase N3 (N3.5.1)
 */

// ─── FileScanner ──────────────────────────────────────────────────────────────

export { FileScanner, DEFAULT_SCANNER_CONFIG } from './file-scanner.js'
export type {
  FileScannerConfig,
  ScannedFile,
  ScanResult,
  ProjectManifest,
} from './file-scanner.js'

// ─── ChunkIndexer ─────────────────────────────────────────────────────────────

export { ChunkIndexer, DEFAULT_CHUNK_CONFIG } from './chunk-indexer.js'
export type {
  CodeChunk,
  CodeChunkType,
  ChunkIndexerConfig,
} from './chunk-indexer.js'

// ─── SearchEngine ─────────────────────────────────────────────────────────────

export { CodeSearchEngine } from './search-engine.js'
export type {
  CodeSearchResult,
  SearchOptions,
  MatchType,
  IndexStats,
} from './search-engine.js'
