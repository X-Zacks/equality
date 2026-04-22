/**
 * tools/builtins/index.ts — 内置工具注册
 */

import type { ToolDefinition } from '../types.js'
import { bashTool } from './bash.js'
import { readFileTool } from './read-file.js'
import { writeFileTool } from './write-file.js'
import { editFileTool } from './edit-file.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'
import { listDirTool } from './list-dir.js'
import { webFetchTool } from './web-fetch.js'
import { webSearchTool } from './web-search.js'
import { readImageTool } from './read-image.js'
import { readPdfTool } from './read-pdf.js'
import { readPdfVisionTool } from './read-pdf-vision.js'
import { processTool } from './process-tool.js'
import { applyPatchTool } from './apply-patch.js'
import { cronTool } from './cron.js'
import { browserTool } from './browser.js'
import { memorySaveTool, memorySearchTool, memoryListTool, memoryDeleteTool } from './memory.js'
import { lspHoverTool } from './lsp-hover.js'
import { lspDefinitionTool } from './lsp-definition.js'
import { lspReferencesTool } from './lsp-references.js'
import { lspDiagnosticsTool } from './lsp-diagnostics.js'
import { subagentSpawnTool, setSubagentManagerForSpawn } from './subagent-spawn.js'
import { subagentListTool, setSubagentManagerForList } from './subagent-list.js'
import { subagentSteerTool, setSubagentManagerForSteer } from './subagent-steer.js'
import { subagentKillTool, setSubagentManagerForKill } from './subagent-kill.js'
import { sessionSearchTool } from './session-search.js'
import { codebaseSearchTool } from './codebase-search.js'
import { skillViewTool, setWorkspaceDirForSkillView } from './skill-view.js'
import { skillSearchTool } from './skill-search.js'
import { imageGenerateTool } from './image-generate.js'
import { todoTool } from './todo.js'

/** 全部内置工具 */
export const builtinTools: ToolDefinition[] = [
  // 文件系统
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
  listDirTool,
  // 运行时
  bashTool,
  processTool,
  // 网络
  webFetchTool,
  webSearchTool,
  // 媒体
  readImageTool,
  readPdfTool,
  readPdfVisionTool,
  // 高级
  applyPatchTool,
  // 定时任务 (Phase 4)
  cronTool,
  // 浏览器控制 (Phase 4.5)
  browserTool,
  // 长期记忆 (Phase 12)
  memorySaveTool,
  memorySearchTool,
  // LSP 语义代码理解 (Phase B)
  lspHoverTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspDiagnosticsTool,
  // 子 Agent 管理 (Phase E3/E4)
  subagentSpawnTool,
  subagentListTool,
  subagentSteerTool,
  subagentKillTool,
  // 历史会话搜索 (Phase O4)
  sessionSearchTool,
  // 代码库语义搜索 (Phase N3)
  codebaseSearchTool,
  // Skill 按需查看 (Phase T2)
  skillViewTool,
  // Skill 搜索 (Phase 3: chat-crew-dual-mode)
  skillSearchTool,
  // 图片生成 (Phase Y3.1)
  imageGenerateTool,
  // 待办事项 (Phase Y1.1)
  todoTool,
]

export {
  bashTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
  listDirTool,
  webFetchTool,
  webSearchTool,
  readImageTool,
  readPdfTool,
  readPdfVisionTool,
  processTool,
  applyPatchTool,
  cronTool,
  browserTool,
  memorySaveTool,
  memorySearchTool,
  lspHoverTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspDiagnosticsTool,
  subagentSpawnTool,
  subagentListTool,
  subagentSteerTool,
  subagentKillTool,
  setSubagentManagerForSpawn,
  setSubagentManagerForList,
  setSubagentManagerForSteer,
  setSubagentManagerForKill,
  sessionSearchTool,
  codebaseSearchTool,
  skillViewTool,
  setWorkspaceDirForSkillView,
  skillSearchTool,
  imageGenerateTool,
  todoTool,
  memoryListTool,
  memoryDeleteTool,
}
