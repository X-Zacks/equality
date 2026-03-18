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
import { processTool } from './process-tool.js'
import { applyPatchTool } from './apply-patch.js'
import { cronTool } from './cron.js'
import { browserTool } from './browser.js'
import { memorySaveTool, memorySearchTool } from './memory.js'

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
  // 高级
  applyPatchTool,
  // 定时任务 (Phase 4)
  cronTool,
  // 浏览器控制 (Phase 4.5)
  browserTool,
  // 长期记忆 (Phase 12)
  memorySaveTool,
  memorySearchTool,
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
  processTool,
  applyPatchTool,
  cronTool,
  browserTool,
  memorySaveTool,
  memorySearchTool,
}
