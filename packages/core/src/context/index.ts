export { DefaultContextEngine, trimMessages } from './default-engine.js'
export type {
  ContextEngine,
  AssembleParams, AssembleResult, AfterTurnParams,
  BeforeTurnParams, AfterToolCallParams, BeforeCompactionParams,
} from './types.js'
export { compactIfNeeded, splitIntoChunks, CHUNK_TOKEN_THRESHOLD, MAX_RETRIES } from './compaction.js'
export { extractIdentifiers, validateIdentifiers, buildProtectionPrompt } from './identifier-shield.js'
export { estimateTokens, estimateMessagesTokens } from './token-estimator.js'
