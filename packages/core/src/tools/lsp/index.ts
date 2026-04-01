/**
 * tools/lsp/index.ts — LSP 模块导出
 */

export { LspClient } from './client.js'
export { LspLifecycle } from './lifecycle.js'
export { ALL_CONFIGS, getConfigByLanguage } from './server-configs.js'
export {
  pathToFileUri,
  fileUriToPath,
  detectLanguage,
  detectLanguageId,
  isMissingDependency,
} from './types.js'
export type {
  MissingDependency,
  Position,
  Range,
  Location,
  Diagnostic,
  HoverResult,
} from './types.js'
