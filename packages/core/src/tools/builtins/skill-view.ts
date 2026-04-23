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
    'View the full content of a specified Skill. Use this tool to read the complete SKILL.md when the skill summary in system prompt is insufficient.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Skill name (matches <name> in <available_skills>)',
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
