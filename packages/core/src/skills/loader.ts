/**
 * skills/loader.ts — Skills 6 级优先级加载器
 *
 * 按顺序扫描 6 个来源目录，同名高优先级覆盖低优先级。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseSkillFile } from './frontmatter.js'
import type { Skill, SkillEntry, SkillSource } from './types.js'
import { scanSkillDir } from './scanner.js'

const MAX_SKILLS_PER_SOURCE = 200

/** 加载顺序（低优先级 → 高优先级，高覆盖低） */
const SKILLS_LOAD_ORDER: Array<{
  source: SkillSource
  resolveDir: (workspaceDir: string) => string | string[]
}> = [
  { source: 'extra',           resolveDir: () => '' },  // TODO: 从配置读取 extraDirs
  { source: 'bundled',         resolveDir: () => getBundledSkillsDir() },
  { source: 'synced-bundled',  resolveDir: (ws) => path.join(ws, '.equality', 'skills') },
  { source: 'managed',         resolveDir: () => path.join(getAppDataDir(), 'Equality', 'skills') },
  { source: 'personal-agents', resolveDir: () => path.join(os.homedir(), '.agents', 'skills') },
  { source: 'project-agents',  resolveDir: (ws) => path.join(ws, '.agents', 'skills') },
  { source: 'workspace',       resolveDir: (ws) => path.join(ws, 'skills') },
]

/**
 * 加载所有 Skills（去重后返回）
 *
 * 同名 Skill 按优先级覆盖：workspace > project-agents > personal-agents > managed > bundled > extra
 */
export function loadAllSkills(workspaceDir: string): SkillEntry[] {
  const skillMap = new Map<string, SkillEntry>()

  for (const { source, resolveDir } of SKILLS_LOAD_ORDER) {
    const dirs = resolveDir(workspaceDir)
    const dirList = Array.isArray(dirs) ? dirs : [dirs]

    for (const dir of dirList) {
      if (!dir || !fs.existsSync(dir)) continue

      const skills = scanDirectory(dir, source)
      for (const entry of skills) {
        // 高优先级覆盖低优先级
        skillMap.set(entry.skill.name, entry)
      }
    }
  }

  const result = [...skillMap.values()]
  
  // Phase 7: 安全扫描每个 Skill
  for (const entry of result) {
    const scanResult = scanSkillDir(entry.skill.baseDir)
    entry.scanSummary = scanResult
    if (scanResult.critical > 0) {
      entry.blocked = true
      const criticalFindings = scanResult.findings
        .filter(f => f.severity === 'critical')
        .map(f => `${f.ruleId} in ${f.file}:${f.line}`)
        .join(', ')
      console.warn(`[skills/security] ⚠️ Skill "${entry.skill.name}" blocked: ${criticalFindings}`)
    } else {
      entry.blocked = false
      if (scanResult.warn > 0) {
        const warnFindings = scanResult.findings
          .filter(f => f.severity === 'warn')
          .map(f => `${f.ruleId} in ${f.file}:${f.line}`)
          .join(', ')
        console.warn(`[skills/security] ⚠ Skill "${entry.skill.name}" warnings: ${warnFindings}`)
      }
    }
  }

  const eligible = result.filter(e => !e.blocked)
  const blocked = result.filter(e => e.blocked)
  console.log(`[skills] 加载完成: ${result.length} 个 Skills (${eligible.length} eligible, ${blocked.length} blocked)`)
  return result
}

/** 获取所有 Skills 目录列表（用于 watcher） */
export function getSkillsDirs(workspaceDir: string): string[] {
  const dirs: string[] = []
  for (const { resolveDir } of SKILLS_LOAD_ORDER) {
    const d = resolveDir(workspaceDir)
    const list = Array.isArray(d) ? d : [d]
    for (const dir of list) {
      if (dir && fs.existsSync(dir)) dirs.push(dir)
    }
  }
  return dirs
}

// ─── 内部函数 ─────────────────────────────────────────────────────────────────

/** 扫描单个目录下的 SKILL.md 文件 */
function scanDirectory(dir: string, source: SkillSource): SkillEntry[] {
  const entries: SkillEntry[] = []

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })

    for (const item of items) {
      if (entries.length >= MAX_SKILLS_PER_SOURCE) break

      const fullPath = path.join(dir, item.name)

      if (item.isFile()) {
        // 直接是 SKILL.md 或 xxx.skill.md
        if (item.name === 'SKILL.md' || item.name.endsWith('.skill.md')) {
          const skill = parseSkillFile(fullPath)
          if (skill) entries.push({ skill, source })
        }
      } else if (item.isDirectory()) {
        // 子目录下的 SKILL.md
        const skillMd = path.join(fullPath, 'SKILL.md')
        if (fs.existsSync(skillMd)) {
          const skill = parseSkillFile(skillMd)
          if (skill) entries.push({ skill, source })
        }
      }
    }
  } catch (err) {
    console.warn(`[skills] 扫描目录失败: ${dir}`, err)
  }

  return entries
}

/** 获取内置 Skills 目录（开发时 packages/core/skills/，SEA 时与 exe 同级的 skills/） */
export function getBundledSkillsDir(): string {
  // SEA / 便携版：与 equality-core.exe 同级的 skills/ 目录
  const exeDir = path.dirname(process.execPath)
  const seaDir = path.join(exeDir, 'skills')
  if (fs.existsSync(seaDir)) return seaDir

  // 开发时：packages/core/skills/
  const devDir = path.resolve(import.meta.dirname ?? __dirname, '../../skills')
  if (fs.existsSync(devDir)) return devDir

  // Fallback: 工作区根 skills/
  return path.resolve(process.cwd(), 'skills')
}

/** 获取 AppData 目录 */
function getAppDataDir(): string {
  return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
}

/** 获取 managed skills 目录（用于 Skill 沉淀写入） */
export function getManagedSkillsDir(): string {
  return path.join(getAppDataDir(), 'Equality', 'skills')
}
