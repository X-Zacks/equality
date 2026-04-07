/**
 * security/audit-types.ts — 安全审计类型定义
 *
 * Phase I3 (GAP-22)
 */

export type SecurityAuditSeverity = 'info' | 'warn' | 'critical'

export interface SecurityAuditFinding {
  checkId: string
  severity: SecurityAuditSeverity
  title: string
  detail: string
  remediation?: string
}

export interface SecurityAuditSummary {
  critical: number
  warn: number
  info: number
}

export interface SecurityAuditReport {
  ts: number
  summary: SecurityAuditSummary
  findings: SecurityAuditFinding[]
}

export interface SecurityAuditOptions {
  /** 是否启用了 bash sandbox */
  sandboxEnabled?: boolean
  /** 是否有 deny 规则 */
  hasDenyRules?: boolean
  /** 是否启用了外部内容安全包装 */
  externalContentWrapping?: boolean
  /** 代理 URL（检查是否为 HTTPS） */
  proxyUrl?: string
  /** 工作目录路径 */
  workspaceDir?: string
  /** Secret 存储模式 */
  secretStorageMode?: 'env' | 'encrypted' | 'keychain'
  /** 注册的工具名称列表 */
  registeredTools?: string[]
}
