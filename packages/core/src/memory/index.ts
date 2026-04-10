export {
  memorySave, memorySearch, memoryList, memoryDelete, memoryCount,
  memoryGetById, memoryUpdate, memoryListPaged, memoryStats,
  checkMemoryDuplicate, scanMemoryThreats,
  getAllMemoriesWithEmbedding, backfillEmbeddings, getDefaultEmbedder,
} from './db.js'
export type {
  MemoryEntry, MemorySearchResult,
  MemorySaveOptions, MemoryListPagedOptions, MemoryListPagedResult,
  MemoryStats, DuplicateCheckResult, ThreatScanResult,
} from './db.js'
export { hybridSearch, fuseScores } from './hybrid-search.js'
export type { HybridSearchOptions, HybridSearchResult, MemoryRecord } from './hybrid-search.js'
export { createDefaultEmbeddingProvider, cosineSimilarity } from './embeddings.js'
export type { EmbeddingProvider } from './embeddings.js'
