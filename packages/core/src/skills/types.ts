/**
 * skills/types.ts — Skills 系统类型定义
 */

/** Skill 来源优先级（数字越大优先级越高） */
export type SkillSource =
  | 'extra'             // 1: 额外目录（config.skills.extraDirs）
  | 'bundled'           // 2: 内置（随安装包分发）
  | 'managed'           // 3: 用户管理（%APPDATA%\Equality\skills）
  | 'personal-agents'   // 4: 用户个人（~/.agents/skills）
  | 'project-agents'    // 5: 项目级（<cwd>/.agents/skills）
  | 'workspace'         // 6: 工作区本地（<cwd>/skills）

/** 安装指令 */
export interface SkillInstallSpec {
  kind: 'pip' | 'npm' | 'go' | 'conda' | 'apt' | 'download'
  spec: string
  mirror?: string
}

/** Skill 元数据（来自 YAML frontmatter） */
export interface SkillMetadata {
  name: string
  description: string
  tools?: string[]
  userInvocable?: boolean
  always?: boolean
  emoji?: string
  requires?: {
    bins?: string[]
    env?: string[]
    config?: string[]
  }
  install?: SkillInstallSpec[]
}

/** 解析后的完整 Skill */
export interface Skill {
  name: string
  description: string
  filePath: string        // 绝对路径
  baseDir: string         // 所在目录
  body: string            // Markdown 正文
  metadata: SkillMetadata
}

/** 带来源信息的 Skill 条目 */
export interface SkillEntry {
  skill: Skill
  source: SkillSource
  /** 安全扫描结果（Phase 7） */
  blocked?: boolean
  scanSummary?: SkillScanSummary
}

// ─── Phase 7: 安全扫描类型 ────────────────────────────────────────────────────

export type SkillScanSeverity = 'info' | 'warn' | 'critical'

export interface SkillScanFinding {
  ruleId: string
  severity: SkillScanSeverity
  file: string           // 相对于 Skill 目录的路径
  line: number
  message: string
  evidence: string       // 触发行内容（截断至 120 字符）
}

export interface SkillScanSummary {
  scannedFiles: number
  critical: number
  warn: number
  info: number
  findings: SkillScanFinding[]
}

// ─── Phase 7: 状态报告类型 ────────────────────────────────────────────────────

export interface SkillStatusEntry {
  name: string
  description: string
  source: SkillSource
  emoji?: string
  filePath: string
  baseDir: string

  // 状态标记
  enabled: boolean
  eligible: boolean
  blocked: boolean
  always: boolean

  // 依赖检测结果
  requirements: {
    bins: Array<{ name: string; found: boolean }>
    env: Array<{ name: string; found: boolean }>
  }
  missing: {
    bins: string[]
    env: string[]
  }
}

export interface SkillStatusReport {
  total: number
  eligible: number
  blocked: number
  disabled: number
  missingDeps: number
  skills: SkillStatusEntry[]
}
