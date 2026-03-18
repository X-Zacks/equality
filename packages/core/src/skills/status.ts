/**
 * skills/status.ts — Skill 状态报告与依赖检测
 *
 * Phase 7: Skills V2
 * Spec: openspec/specs/skills/skills-v2-spec.md「Skill 状态报告与依赖检测」
 *
 * 提供 buildSkillStatus() 生成完整的状态报告，
 * 包含每个 Skill 的启用状态、安全扫描结果、依赖满足情况。
 */

import { execSync } from 'node:child_process'
import type { SkillEntry, SkillStatusEntry, SkillStatusReport } from './types.js'

// ─── 依赖检测缓存 ─────────────────────────────────────────────────────────────

interface BinCacheEntry {
  found: boolean
  cachedAt: number
}

const binCache = new Map<string, BinCacheEntry>()
const BIN_CACHE_TTL_MS = 30_000  // 30 秒

/**
 * 检测系统命令是否存在（Windows: where.exe）
 */
export function checkBinExists(name: string): boolean {
  // 缓存命中
  const cached = binCache.get(name)
  if (cached && Date.now() - cached.cachedAt < BIN_CACHE_TTL_MS) {
    return cached.found
  }

  let found = false
  try {
    // Windows: where.exe, Unix: which
    const cmd = process.platform === 'win32' ? `where.exe ${name}` : `which ${name}`
    execSync(cmd, { stdio: 'pipe', timeout: 5000 })
    found = true
  } catch {
    found = false
  }

  binCache.set(name, { found, cachedAt: Date.now() })
  return found
}

/**
 * 检测环境变量是否存在且非空
 */
export function checkEnvExists(name: string): boolean {
  const val = process.env[name]
  return val !== undefined && val !== ''
}

// ─── 状态报告 ─────────────────────────────────────────────────────────────────

/**
 * 构建完整的 Skills 状态报告
 */
export function buildSkillStatus(entries: SkillEntry[]): SkillStatusReport {
  const skills: SkillStatusEntry[] = []

  for (const entry of entries) {
    const { skill, source, blocked, scanSummary } = entry
    const meta = skill.metadata

    // 依赖检测
    const requiredBins = meta.requires?.bins ?? []
    const requiredEnv = meta.requires?.env ?? []

    const binsResult = requiredBins.map(name => ({ name, found: checkBinExists(name) }))
    const envResult = requiredEnv.map(name => ({ name, found: checkEnvExists(name) }))

    const missingBins = binsResult.filter(b => !b.found).map(b => b.name)
    const missingEnv = envResult.filter(e => !e.found).map(e => e.name)

    // eligible = enabled AND NOT blocked AND bins全部found AND env全部found
    const enabled = true  // TODO: 从配置读取禁用列表
    const isBlocked = blocked ?? false
    const eligible = enabled && !isBlocked && missingBins.length === 0 && missingEnv.length === 0

    skills.push({
      name: skill.name,
      description: skill.description,
      source,
      emoji: meta.emoji,
      filePath: skill.filePath,
      baseDir: skill.baseDir,
      enabled,
      eligible,
      blocked: isBlocked,
      always: meta.always ?? false,
      requirements: {
        bins: binsResult,
        env: envResult,
      },
      missing: {
        bins: missingBins,
        env: missingEnv,
      },
    })
  }

  const total = skills.length
  const eligible = skills.filter(s => s.eligible).length
  const blockedCount = skills.filter(s => s.blocked).length
  const disabled = skills.filter(s => !s.enabled).length
  const missingDeps = skills.filter(s => s.missing.bins.length > 0 || s.missing.env.length > 0).length

  return {
    total,
    eligible,
    blocked: blockedCount,
    disabled,
    missingDeps,
    skills,
  }
}
