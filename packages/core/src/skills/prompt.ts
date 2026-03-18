/**
 * skills/prompt.ts — Skills → System Prompt XML 索引
 *
 * 懒加载模式：只注入 name + description + location 索引，
 * 模型通过 read_file 按需读取 SKILL.md 全文。
 */

import os from 'node:os'
import type { Skill } from './types.js'

const MAX_SKILLS_IN_PROMPT = 150
const MAX_SKILLS_PROMPT_CHARS = 30_000

/**
 * 构建 Skills 的 XML 索引字符串（用于注入 System Prompt）
 *
 * 流程：路径压缩 → 应用限制 → 生成 XML
 */
export function buildSkillsPromptBlock(skills: Skill[]): string {
  if (skills.length === 0) return ''

  // 1. 路径压缩：home → ~
  const compacted = skills.map(s => ({
    ...s,
    filePath: compactPath(s.filePath),
  }))

  // 2. always 的排在前面
  compacted.sort((a, b) => {
    const aAlways = a.metadata.always ? 1 : 0
    const bAlways = b.metadata.always ? 1 : 0
    return bAlways - aAlways
  })

  // 3. 应用限制（150 个 / 30K 字符）
  const selected = applyLimits(compacted)

  // 4. 生成 XML
  return formatSkillsXml(selected)
}

// ─── XML 格式化 ───────────────────────────────────────────────────────────────

function formatSkillsXml(skills: Skill[]): string {
  if (skills.length === 0) return ''

  let xml = '<available_skills>\n'
  for (const skill of skills) {
    xml += '  <skill>\n'
    xml += `    <name>${escapeXml(skill.name)}</name>\n`
    xml += `    <description>${escapeXml(skill.description)}</description>\n`
    xml += `    <location>${escapeXml(skill.filePath)}</location>\n`
    xml += '  </skill>\n'
  }
  xml += '</available_skills>'
  return xml
}

// ─── 限制控制 ──────────────────────────────────────────────────────────────────

function applyLimits(skills: Skill[]): Skill[] {
  // 先按数量截断
  let selected = skills.slice(0, MAX_SKILLS_IN_PROMPT)

  // 检查字符预算
  let xml = formatSkillsXml(selected)
  if (xml.length <= MAX_SKILLS_PROMPT_CHARS) return selected

  // 二分搜索：找到在字符预算内的最大前缀
  let lo = 0
  let hi = selected.length

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const testXml = formatSkillsXml(selected.slice(0, mid))
    if (testXml.length <= MAX_SKILLS_PROMPT_CHARS) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return selected.slice(0, lo)
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 路径压缩：home 目录 → ~ */
function compactPath(p: string): string {
  const home = os.homedir()
  if (p.startsWith(home)) {
    return '~' + p.slice(home.length).replace(/\\/g, '/')
  }
  return p.replace(/\\/g, '/')
}

/** XML 特殊字符转义 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
