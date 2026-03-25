/**
 * tools/index.ts — Tools 模块公开 API
 */

export { ToolRegistry } from './registry.js'
export { truncateToolResult, calcMaxToolResultChars, HARD_MAX_TOOL_RESULT_CHARS, DEFAULT_MAX_TOOL_RESULT_CHARS } from './truncation.js'
export { applyToolPolicy } from './policy.js'
export { LoopDetector, computeArgsHash, computeResultHash } from './loop-detector.js'
export type { DetectorVerdict, DetectorAction } from './loop-detector.js'
export { builtinTools, bashTool, readFileTool, writeFileTool, globTool, webFetchTool } from './builtins/index.js'
export type {
  ToolDefinition,
  ToolResult,
  ToolResultMetadata,
  ToolContext,
  ToolPolicy,
  ToolInputSchema,
  OpenAIToolSchema,
} from './types.js'
