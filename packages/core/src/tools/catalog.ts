/**
 * tools/catalog.ts — 工具目录与 Profile 系统
 *
 * Phase I1 (GAP-21): 工具元数据注册、section 分组、4 种 profile 策略。
 *
 * 参考 OpenClaw tool-catalog.ts 的设计：
 *   - 静态定义所有核心工具的 id/label/description/section/profiles
 *   - Profile 解析为 allow/deny 策略
 *   - 支持 group:xxx 分组引用
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToolProfileId = 'minimal' | 'coding' | 'messaging' | 'full'

export type ToolProfilePolicy = {
  allow?: string[]
  deny?: string[]
}

export type CoreToolSection = {
  id: string
  label: string
  tools: Array<{ id: string; label: string; description: string }>
}

type CoreToolDefinition = {
  id: string
  label: string
  description: string
  sectionId: string
  profiles: ToolProfileId[]
}

// ─── Section Order ──────────────────────────────────────────────────────────

const CORE_TOOL_SECTION_ORDER: Array<{ id: string; label: string }> = [
  { id: 'fs', label: 'Files' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'lsp', label: 'Language Server' },
  { id: 'web', label: 'Web' },
  { id: 'memory', label: 'Memory' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'ui', label: 'UI' },
  { id: 'automation', label: 'Automation' },
  { id: 'media', label: 'Media' },
]

// ─── Core Tool Definitions ──────────────────────────────────────────────────

const CORE_TOOL_DEFINITIONS: CoreToolDefinition[] = [
  // Files
  { id: 'read_file', label: 'read_file', description: 'Read file contents', sectionId: 'fs', profiles: ['coding'] },
  { id: 'write_file', label: 'write_file', description: 'Create or overwrite files', sectionId: 'fs', profiles: ['coding'] },
  { id: 'edit_file', label: 'edit_file', description: 'Make precise edits to files', sectionId: 'fs', profiles: ['coding'] },
  { id: 'apply_patch', label: 'apply_patch', description: 'Apply unified diff patches', sectionId: 'fs', profiles: ['coding'] },
  { id: 'list_dir', label: 'list_dir', description: 'List directory contents', sectionId: 'fs', profiles: ['coding'] },
  { id: 'glob', label: 'glob', description: 'Find files by pattern', sectionId: 'fs', profiles: ['coding'] },
  { id: 'grep', label: 'grep', description: 'Search file contents', sectionId: 'fs', profiles: ['coding'] },
  { id: 'read_pdf', label: 'read_pdf', description: 'Extract text from PDF files', sectionId: 'fs', profiles: ['coding'] },

  // Runtime
  { id: 'bash', label: 'bash', description: 'Execute shell commands', sectionId: 'runtime', profiles: ['coding'] },
  { id: 'process', label: 'process', description: 'Manage background processes', sectionId: 'runtime', profiles: ['coding'] },

  // LSP
  { id: 'lsp_definition', label: 'lsp_definition', description: 'Go to definition', sectionId: 'lsp', profiles: ['coding'] },
  { id: 'lsp_references', label: 'lsp_references', description: 'Find references', sectionId: 'lsp', profiles: ['coding'] },
  { id: 'lsp_hover', label: 'lsp_hover', description: 'Hover information', sectionId: 'lsp', profiles: ['coding'] },
  { id: 'lsp_diagnostics', label: 'lsp_diagnostics', description: 'Show diagnostics', sectionId: 'lsp', profiles: ['coding'] },

  // Web
  { id: 'web_search', label: 'web_search', description: 'Search the web', sectionId: 'web', profiles: ['coding'] },
  { id: 'web_fetch', label: 'web_fetch', description: 'Fetch web page content', sectionId: 'web', profiles: ['coding'] },

  // Memory
  { id: 'memory_save', label: 'memory_save', description: 'Save to memory', sectionId: 'memory', profiles: ['coding'] },
  { id: 'memory_search', label: 'memory_search', description: 'Semantic memory search', sectionId: 'memory', profiles: ['coding'] },

  // Sessions
  { id: 'subagent_spawn', label: 'subagent_spawn', description: 'Spawn sub-agent', sectionId: 'sessions', profiles: ['coding'] },
  { id: 'subagent_list', label: 'subagent_list', description: 'List sub-agents', sectionId: 'sessions', profiles: ['coding', 'messaging'] },
  { id: 'subagent_steer', label: 'subagent_steer', description: 'Steer sub-agent', sectionId: 'sessions', profiles: ['coding'] },
  { id: 'subagent_kill', label: 'subagent_kill', description: 'Kill sub-agent', sectionId: 'sessions', profiles: ['coding'] },

  // UI
  { id: 'browser', label: 'browser', description: 'Control web browser', sectionId: 'ui', profiles: ['coding'] },
  { id: 'read_image', label: 'read_image', description: 'Understand images', sectionId: 'media', profiles: ['coding'] },

  // Automation
  { id: 'cron', label: 'cron', description: 'Schedule recurring tasks', sectionId: 'automation', profiles: ['coding'] },
]

// ─── Lookup Map ─────────────────────────────────────────────────────────────

const CORE_TOOL_BY_ID = new Map<string, CoreToolDefinition>(
  CORE_TOOL_DEFINITIONS.map((tool) => [tool.id, tool]),
)

// ─── Profile Resolution ─────────────────────────────────────────────────────

function listCoreToolIdsForProfile(profile: ToolProfileId): string[] {
  return CORE_TOOL_DEFINITIONS
    .filter((tool) => tool.profiles.includes(profile))
    .map((tool) => tool.id)
}

const CORE_TOOL_PROFILES: Record<ToolProfileId, ToolProfilePolicy> = {
  minimal: {
    allow: listCoreToolIdsForProfile('minimal'),
  },
  coding: {
    allow: listCoreToolIdsForProfile('coding'),
  },
  messaging: {
    allow: listCoreToolIdsForProfile('messaging'),
  },
  full: {
    // No restrictions
  },
}

// ─── Tool Groups ────────────────────────────────────────────────────────────

function buildCoreToolGroupMap(): Record<string, string[]> {
  const sectionToolMap = new Map<string, string[]>()
  for (const tool of CORE_TOOL_DEFINITIONS) {
    const groupId = `group:${tool.sectionId}`
    const list = sectionToolMap.get(groupId) ?? []
    list.push(tool.id)
    sectionToolMap.set(groupId, list)
  }
  return Object.fromEntries(sectionToolMap.entries())
}

export const CORE_TOOL_GROUPS: Record<string, string[]> = buildCoreToolGroupMap()

// ─── Public API ─────────────────────────────────────────────────────────────

export const PROFILE_OPTIONS = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'coding', label: 'Coding' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'full', label: 'Full' },
] as const

/**
 * 根据 profile 名称解析工具策略。
 * - 已知 profile（minimal/coding/messaging）返回 allow 列表
 * - `full` 返回 undefined（不过滤）
 * - 未知 profile 返回 undefined
 */
export function resolveCoreToolProfilePolicy(profile?: string): ToolProfilePolicy | undefined {
  if (!profile) return undefined

  const resolved = CORE_TOOL_PROFILES[profile as ToolProfileId]
  if (!resolved) return undefined

  // full profile: no restrictions
  if (!resolved.allow && !resolved.deny) return undefined

  return {
    allow: resolved.allow ? [...resolved.allow] : undefined,
    deny: resolved.deny ? [...resolved.deny] : undefined,
  }
}

/**
 * 返回按 section 分组的工具列表。
 */
export function listCoreToolSections(): CoreToolSection[] {
  return CORE_TOOL_SECTION_ORDER
    .map((section) => ({
      id: section.id,
      label: section.label,
      tools: CORE_TOOL_DEFINITIONS
        .filter((tool) => tool.sectionId === section.id)
        .map((tool) => ({
          id: tool.id,
          label: tool.label,
          description: tool.description,
        })),
    }))
    .filter((section) => section.tools.length > 0)
}

/**
 * 获取指定工具所属的 profile 列表。
 */
export function resolveCoreToolProfiles(toolId: string): ToolProfileId[] {
  const tool = CORE_TOOL_BY_ID.get(toolId)
  if (!tool) return []
  return [...tool.profiles]
}

/**
 * 判断是否为已知的核心工具 ID。
 */
export function isKnownCoreToolId(toolId: string): boolean {
  return CORE_TOOL_BY_ID.has(toolId)
}
