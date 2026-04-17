/**
 * tools/builtins/skill-view.ts — skill_view 工具
 *
 * Phase T2: Skills 渐进式披露
 * 允许 Agent 按名称查看 Skill 的完整内容。
 */

import { readFileSync } from 'node:fs'
import type { ToolDefinition } from '../types.js'
import { loadAllSkills } from '../../skills/loader.js'

let _workspaceDir = ''

/** 注入工作目录（由 gateway 启动时调用） */
export function setWorkspaceDirForSkillView(dir: string): void {
  _workspaceDir = dir
}

export const skillViewTool: ToolDefinition = {
  name: 'skill_view',
  description:
    '查看指定 Skill 的完整内容。当 system prompt 中的 skill 摘要不够详细时，用此工具读取 SKILL.md 全文。',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Skill 名称（与 <available_skills> 中的 <name> 对应）',
      },
    },
    required: ['name'],
  },
  execute: async (input) => {
    const name = String(input.name ?? '').trim()
    if (!name) {
      return { content: 'skill name is required', isError: true }
    }

    try {
      const skills = loadAllSkills(_workspaceDir || '.')
      const match = skills.find(s => s.skill.name.toLowerCase() === name.toLowerCase())
      if (!match) {
        const available = skills.map(s => s.skill.name).join(', ')
        return {
          content: `Skill "${name}" not found. Available: ${available}`,
          isError: true,
        }
      }

      const content = readFileSync(match.skill.filePath, 'utf-8')
      return { content }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Failed to read skill: ${msg}`, isError: true }
    }
  },
}
