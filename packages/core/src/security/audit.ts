/**
 * security/audit.ts — 安全审计报告
 *
 * Phase I3 (GAP-22): 统一安全检查框架，一键生成结构化安全报告。
 *
 * 参考 OpenClaw src/security/audit.ts 的设计（1505 行），简化为 Equality 桌面场景的 6 类检查。
 */

import fs from 'node:fs'
import type {
  SecurityAuditFinding,
  SecurityAuditReport,
  SecurityAuditOptions,
  SecurityAuditSummary,
} from './audit-types.js'

// ─── 危险工具列表 ───────────────────────────────────────────────────────────

const DANGEROUS_TOOLS = ['bash', 'exec', 'process']

// ─── 检查函数 ───────────────────────────────────────────────────────────────

function checkSandbox(opts: SecurityAuditOptions): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = []

  if (opts.sandboxEnabled === false) {
    findings.push({
      checkId: 'sandbox.disabled',
      severity: 'warn',
      title: 'Bash 沙箱未启用',
      detail: 'bash 工具直接在主机执行命令，未启用路径/命令沙箱保护。',
      remediation: '设置 EQUALITY_SANDBOX=1 或在配置中启用 sandbox。',
    })
  } else if (opts.sandboxEnabled === true) {
    findings.push({
      checkId: 'sandbox.enabled',
      severity: 'info',
      title: 'Bash 沙箱已启用',
      detail: 'bash 工具受路径和命令沙箱保护。',
    })
  }

  return findings
}

function checkSecrets(opts: SecurityAuditOptions): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = []
  const mode = opts.secretStorageMode ?? 'env'

  if (mode === 'env') {
    findings.push({
      checkId: 'secrets.plain_env',
      severity: 'info',
      title: 'API 密钥存储在环境变量中',
      detail: '当前使用环境变量存储 API 密钥，进程内可见。',
      remediation: '考虑使用加密存储或系统密钥链。',
    })
  } else {
    findings.push({
      checkId: 'secrets.secure_storage',
      severity: 'info',
      title: `密钥存储模式: ${mode}`,
      detail: '使用安全存储机制管理 API 密钥。',
    })
  }

  return findings
}

function checkToolPolicy(opts: SecurityAuditOptions): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = []
  const tools = opts.registeredTools ?? []

  const hasDangerous = tools.some((t) => DANGEROUS_TOOLS.includes(t))

  if (hasDangerous && !opts.hasDenyRules) {
    findings.push({
      checkId: 'tools.dangerous_unrestricted',
      severity: 'warn',
      title: '危险工具未受策略限制',
      detail: `已注册的危险工具（${DANGEROUS_TOOLS.filter((t) => tools.includes(t)).join(', ')}）未配置 deny 规则。`,
      remediation: '在 policy-pipeline 中添加 deny 规则，或使用 tool profile 限制可用工具。',
    })
  }

  return findings
}

function checkExternalContent(opts: SecurityAuditOptions): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = []

  if (opts.externalContentWrapping === false) {
    findings.push({
      checkId: 'security.no_content_wrapping',
      severity: 'warn',
      title: '外部内容安全包装未启用',
      detail: '来自 web_search/web_fetch 的外部内容未进行安全包装，存在 prompt injection 风险。',
      remediation: '确保 external-content security 模块已集成到工具管道中。',
    })
  }

  return findings
}

function checkProxy(opts: SecurityAuditOptions): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = []

  if (opts.proxyUrl) {
    const isSecure = opts.proxyUrl.startsWith('https://')
    if (!isSecure) {
      findings.push({
        checkId: 'proxy.insecure',
        severity: 'warn',
        title: '代理使用 HTTP（非 HTTPS）',
        detail: `当前代理: ${opts.proxyUrl}。HTTP 代理可被中间人攻击。`,
        remediation: '改用 HTTPS 代理。',
      })
    }
  }

  return findings
}

function checkWorkspace(opts: SecurityAuditOptions): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = []

  if (opts.workspaceDir) {
    try {
      fs.accessSync(opts.workspaceDir, fs.constants.W_OK)
    } catch {
      findings.push({
        checkId: 'workspace.not_writable',
        severity: 'info',
        title: '工作目录不可写',
        detail: `工作目录 ${opts.workspaceDir} 不可写或不存在。`,
        remediation: '确保目录存在且有写入权限。',
      })
    }
  } else {
    findings.push({
      checkId: 'workspace.missing',
      severity: 'info',
      title: '未配置工作目录',
      detail: '未指定工作目录。',
    })
  }

  return findings
}

// ─── 统计 ───────────────────────────────────────────────────────────────────

function countBySeverity(findings: SecurityAuditFinding[]): SecurityAuditSummary {
  let critical = 0
  let warn = 0
  let info = 0
  for (const f of findings) {
    if (f.severity === 'critical') critical += 1
    else if (f.severity === 'warn') warn += 1
    else info += 1
  }
  return { critical, warn, info }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 运行安全审计，返回结构化报告。
 */
export function runSecurityAudit(opts: SecurityAuditOptions): SecurityAuditReport {
  const findings: SecurityAuditFinding[] = [
    ...checkSandbox(opts),
    ...checkSecrets(opts),
    ...checkToolPolicy(opts),
    ...checkExternalContent(opts),
    ...checkProxy(opts),
    ...checkWorkspace(opts),
  ]

  return {
    ts: Date.now(),
    summary: countBySeverity(findings),
    findings,
  }
}
