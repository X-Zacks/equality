/**
 * skills/frontmatter.ts — SKILL.md 解析器
 *
 * 提取 YAML frontmatter + Markdown body，验证安全性。
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { Skill, SkillMetadata } from './types.js'

const MAX_SKILL_FILE_BYTES = 256_000
const SKILL_NAME_RE = /^[a-z0-9_-]{1,64}$/
const MAX_DESCRIPTION_LENGTH = 120

/**
 * 解析 SKILL.md 文件
 * @returns Skill 对象，解析失败返回 null（不抛错）
 */
export function parseSkillFile(filePath: string): Skill | null {
  try {
    // 文件大小检查
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_SKILL_FILE_BYTES) {
      console.warn(`[skills] 跳过过大的 Skill 文件 (${stat.size} bytes): ${filePath}`)
      return null
    }

    const raw = fs.readFileSync(filePath, 'utf-8')
    const { frontmatter, body } = splitFrontmatter(raw)

    if (!frontmatter) {
      console.warn(`[skills] 没有 frontmatter: ${filePath}`)
      return null
    }

    // 解析 YAML
    let meta: Record<string, unknown>
    try {
      meta = YAML.parse(frontmatter)
    } catch (e) {
      console.warn(`[skills] YAML 解析失败: ${filePath}`, e)
      return null
    }

    if (!meta || typeof meta !== 'object') return null

    // 必填字段
    const name = String(meta.name ?? '')
    const description = String(meta.description ?? '')

    if (!name || !description) {
      console.warn(`[skills] 缺少 name 或 description: ${filePath}`)
      return null
    }

    // 安全验证
    if (!SKILL_NAME_RE.test(name)) {
      console.warn(`[skills] 非法 name "${name}": ${filePath}`)
      return null
    }

    const descTrimmed = description.slice(0, MAX_DESCRIPTION_LENGTH)

    // 构造元数据
    const eq = (meta.equality ?? meta) as Record<string, unknown>
    const metadata: SkillMetadata = {
      name,
      description: descTrimmed,
      tools: asStringArray(meta.tools),
      userInvocable: meta['user-invocable'] !== false,
      always: eq.always === true,
      emoji: typeof eq.emoji === 'string' ? eq.emoji : undefined,
      requires: meta.requires ? {
        bins: asStringArray((meta.requires as Record<string, unknown>).bins),
        env: asStringArray((meta.requires as Record<string, unknown>).env),
        config: asStringArray((meta.requires as Record<string, unknown>).config),
      } : undefined,
      install: parseInstallSpecs(meta.install),
    }

    return {
      name,
      description: descTrimmed,
      filePath,
      baseDir: path.dirname(filePath),
      body: body.trim(),
      metadata,
    }
  } catch (err) {
    console.warn(`[skills] 解析失败: ${filePath}`, err)
    return null
  }
}

// ─── 内部工具函数 ─────────────────────────────────────────────────────────────

/** 分离 frontmatter 和 body */
function splitFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: null, body: raw }
  return { frontmatter: match[1], body: match[2] }
}

/** 安全转换为 string[] */
function asStringArray(val: unknown): string[] | undefined {
  if (!val) return undefined
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean)
  if (Array.isArray(val)) return val.map(String)
  return undefined
}

/** 解析安装指令列表 */
function parseInstallSpecs(val: unknown): SkillInstallSpec[] | undefined {
  if (!Array.isArray(val)) return undefined
  const specs: SkillInstallSpec[] = []
  for (const item of val) {
    if (typeof item === 'object' && item && 'kind' in item && 'spec' in item) {
      const kind = String((item as Record<string, unknown>).kind)
      if (['pip', 'npm', 'go', 'conda', 'apt', 'download'].includes(kind)) {
        specs.push({
          kind: kind as SkillInstallSpec['kind'],
          spec: String((item as Record<string, unknown>).spec),
          mirror: (item as Record<string, unknown>).mirror ? String((item as Record<string, unknown>).mirror) : undefined,
        })
      }
    }
  }
  return specs.length > 0 ? specs : undefined
}

// Re-export type for convenience
type SkillInstallSpec = import('./types.js').SkillInstallSpec
