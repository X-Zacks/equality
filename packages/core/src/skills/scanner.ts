/**
 * skills/scanner.ts — Skill 安全扫描器
 *
 * Phase 7: Skills V2
 * Spec: openspec/specs/skills/skills-v2-spec.md「Skill 安全扫描」
 *
 * 扫描 Skill 目录中的脚本文件，检测危险模式。
 * critical 级 → blocked: true（不注入 System Prompt）
 * warn 级 → 日志警告，正常加载
 */

import fs from 'node:fs'
import path from 'node:path'
import type { SkillScanFinding, SkillScanSummary, SkillScanSeverity } from './types.js'

// ─── 可扫描文件扩展名 ─────────────────────────────────────────────────────────

const SCANNABLE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.mjs', '.cjs', '.sh', '.ps1', '.bat', '.cmd',
])

// ─── 扫描规则 ─────────────────────────────────────────────────────────────────

interface ScanRule {
  id: string
  severity: SkillScanSeverity
  pattern: RegExp
  message: string
}

const SCAN_RULES: ScanRule[] = [
  // ── critical ──
  {
    id: 'dangerous-exec',
    severity: 'critical',
    pattern: /\b(subprocess\.call|subprocess\.Popen|os\.system|child_process\.exec|child_process\.spawn|execSync|spawnSync)\b/,
    message: '未受控的 shell 执行',
  },
  {
    id: 'dynamic-code',
    severity: 'critical',
    pattern: /\b(eval\s*\(|exec\s*\(|new\s+Function\s*\()/,
    message: '动态代码执行',
  },
  {
    id: 'env-harvesting',
    severity: 'critical',
    pattern: /\b(os\.environ|process\.env)\b[\s\S]{0,200}\b(requests\.|fetch\(|http\.request|urllib|axios)/,
    message: '疑似凭证窃取（环境变量 + HTTP 请求）',
  },
  {
    id: 'crypto-mining',
    severity: 'critical',
    pattern: /\b(stratum\+tcp|xmrig|coinhive|cryptonight|minergate)\b/i,
    message: '挖矿行为',
  },
  // ── warn ──
  {
    id: 'data-exfiltration',
    severity: 'warn',
    pattern: /\b(open\(|readFile|readFileSync)\b[\s\S]{0,300}\b(requests\.|fetch\(|http\.request|urllib|axios)/,
    message: '文件读取 + HTTP 请求组合，可能的数据外泄',
  },
  {
    id: 'obfuscated-code',
    severity: 'warn',
    pattern: /[A-Fa-f0-9]{200,}|[A-Za-z0-9+/=]{200,}/,
    message: '大段 hex/base64 编码（≥200 字符），代码混淆',
  },
  {
    id: 'suspicious-network',
    severity: 'warn',
    pattern: /\b(WebSocket|ws:\/\/|wss:\/\/|:\d{4,5}[/"'\s])/,
    message: '非标准端口的 WebSocket/HTTP 连接',
  },
  {
    id: 'powershell-bypass',
    severity: 'warn',
    pattern: /(-ExecutionPolicy\s+Bypass|Set-ExecutionPolicy\s+Unrestricted)/i,
    message: 'Windows 安全策略绕过',
  },
]

// ─── 缓存 ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  findings: SkillScanFinding[]
  accessedAt: number
}

/** 缓存 key = `${filePath}:${mtimeMs}:${size}` */
const scanCache = new Map<string, CacheEntry>()
const CACHE_MAX_SIZE = 5000

function getCacheKey(filePath: string, stat: fs.Stats): string {
  return `${filePath}:${stat.mtimeMs}:${stat.size}`
}

function evictCache(): void {
  if (scanCache.size <= CACHE_MAX_SIZE) return
  // LRU 淘汰：删除 accessedAt 最老的 25%
  const entries = [...scanCache.entries()].sort((a, b) => a[1].accessedAt - b[1].accessedAt)
  const toRemove = Math.floor(CACHE_MAX_SIZE * 0.25)
  for (let i = 0; i < toRemove; i++) {
    scanCache.delete(entries[i][0])
  }
}

// ─── 扫描函数 ─────────────────────────────────────────────────────────────────

/**
 * 扫描单个文件，返回发现列表
 */
function scanFile(filePath: string, relPath: string, useCache: boolean): SkillScanFinding[] {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return []
  }

  // 缓存命中
  if (useCache) {
    const key = getCacheKey(filePath, stat)
    const cached = scanCache.get(key)
    if (cached) {
      cached.accessedAt = Date.now()
      return cached.findings
    }
  }

  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  const findings: SkillScanFinding[] = []
  const lines = content.split('\n')

  for (const rule of SCAN_RULES) {
    // env-harvesting 和 data-exfiltration 需要跨行匹配
    if (rule.id === 'env-harvesting' || rule.id === 'data-exfiltration') {
      if (rule.pattern.test(content)) {
        // 找到第一个匹配位置的行号
        const match = content.match(rule.pattern)
        const matchIdx = match?.index ?? 0
        const lineNum = content.slice(0, matchIdx).split('\n').length
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          file: relPath,
          line: lineNum,
          message: rule.message,
          evidence: lines[lineNum - 1]?.slice(0, 120) ?? '',
        })
      }
      continue
    }

    // 逐行匹配
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          file: relPath,
          line: i + 1,
          message: rule.message,
          evidence: lines[i].slice(0, 120),
        })
        // 同一规则在同一文件只报第一个
        break
      }
    }
  }

  // 写缓存
  if (useCache) {
    const key = getCacheKey(filePath, stat)
    scanCache.set(key, { findings, accessedAt: Date.now() })
    evictCache()
  }

  return findings
}

/**
 * 扫描 Skill 目录下的所有脚本文件
 */
export function scanSkillDir(baseDir: string, useCache = true): SkillScanSummary {
  const findings: SkillScanFinding[] = []
  let scannedFiles = 0

  function walkDir(dir: string): void {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const item of items) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        // 跳过常见无关目录
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === '__pycache__') continue
        walkDir(fullPath)
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase()
        if (SCANNABLE_EXTENSIONS.has(ext)) {
          scannedFiles++
          const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/')
          findings.push(...scanFile(fullPath, relPath, useCache))
        }
      }
    }
  }

  walkDir(baseDir)

  return {
    scannedFiles,
    critical: findings.filter(f => f.severity === 'critical').length,
    warn: findings.filter(f => f.severity === 'warn').length,
    info: findings.filter(f => f.severity === 'info').length,
    findings,
  }
}

/**
 * 强制扫描（忽略缓存），用于 POST /skills/:name/scan
 */
export function scanSkillDirNoCache(baseDir: string): SkillScanSummary {
  return scanSkillDir(baseDir, false)
}
