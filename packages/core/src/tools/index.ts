/**
 * tools/index.ts — Tools 模块公开 API
 */

export { ToolRegistry } from './registry.js'
export { truncateToolResult, calcMaxToolResultChars, HARD_MAX_TOOL_RESULT_CHARS, DEFAULT_MAX_TOOL_RESULT_CHARS } from './truncation.js'
export { applyToolPolicy } from './policy.js'
export { resolvePolicyForTool } from './policy-pipeline.js'
export type { PolicyLevel, PolicyContext, PolicyDecision } from './policy-pipeline.js'
export { classifyMutation, isMutatingOperation, extractFingerprint, extractCommandWords, MutationType } from './mutation.js'
export type { MutationClassification, OperationFingerprint } from './mutation.js'
export { validateBashCommand, validatePath, detectInjection, extractPathArgs, normalizePath } from './bash-sandbox.js'
export type { SandboxConfig, SandboxResult } from './bash-sandbox.js'
export { LoopDetector, computeArgsHash, computeResultHash } from './loop-detector.js'
export type { DetectorVerdict, DetectorAction } from './loop-detector.js'
export { cleanToolSchemas, resolveProviderFamily } from './schema-compat.js'
export { builtinTools, bashTool, readFileTool, writeFileTool, globTool, webFetchTool, setSubtaskManagerForSpawn, setSubtaskManagerForSpawnParallel, setSubtaskManagerForList, setSubtaskManagerForSteer, setSubtaskManagerForKill } from './builtins/index.js'
export type {
  ToolDefinition,
  ToolResult,
  ToolResultMetadata,
  ToolContext,
  ToolPolicy,
  ToolInputSchema,
  OpenAIToolSchema,
} from './types.js'

// ── MCP (Phase D.2) ──────────────────────────────────────────────────────────
export { McpClientManager, McpClient, mcpToolToDefinition, parseMcpServersConfig, mcpToolName } from './mcp/index.js'
export type { McpServerConfig, McpServerState, McpServerStatus } from './mcp/index.js'
