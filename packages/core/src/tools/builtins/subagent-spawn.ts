/**
 * tools/builtins/subagent-spawn.ts — subagent_spawn 工具
 *
 * Phase E3 (GAP-8): 让主 Agent 创建子 Agent 任务
 * Phase E4: execute 通过延迟绑定接入 SubagentManager
 */

import type { ToolDefinition } from '../types.js'
import type { SubagentManager } from '../../agent/subagent-manager.js'

let _manager: SubagentManager | null = null

/** 延迟绑定：Gateway 创建 SubagentManager 后调用此函数注入引用 */
export function setSubagentManagerForSpawn(manager: SubagentManager): void {
  _manager = manager
}

export const subagentSpawnTool: ToolDefinition = {
  name: 'subagent_spawn',
  description:
    '创建一个子 Agent 来执行特定任务。子 Agent 在独立上下文中运行，完成后返回摘要结果。' +
    '适用于需要独立调查、执行或分析的工作。',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '子 Agent 的初始任务指令',
      },
      goal: {
        type: 'string',
        description: '子任务的目标描述（用于任务列表展示）',
      },
      allowed_tools: {
        type: 'string',
        description: '子 Agent 可用的工具名列表（逗号分隔）。不指定则继承父 Agent 的工具白名单',
      },
      timeout_seconds: {
        type: 'string',
        description: '子任务超时时间（秒），默认 300',
      },
    },
    required: ['prompt'],
  },
  execute: async (input, ctx) => {
    if (!_manager) {
      return { content: 'SubagentManager not initialized', isError: true }
    }
    const parentSessionKey = ctx.sessionKey
    if (!parentSessionKey) {
      return { content: 'sessionKey is required for subagent_spawn', isError: true }
    }

    const prompt = String(input.prompt ?? '')
    const goal = input.goal ? String(input.goal) : undefined
    const allowedTools = input.allowed_tools
      ? String(input.allowed_tools).split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    const timeoutMs = input.timeout_seconds
      ? Number(input.timeout_seconds) * 1000
      : undefined

    try {
      const result = await _manager.spawn(parentSessionKey, {
        prompt,
        goal,
        allowedTools,
        timeoutMs,
      })
      if (!result.success) {
        return { content: result.summary, isError: true }
      }
      return {
        content: JSON.stringify({
          taskId: result.taskId,
          success: result.success,
          summary: result.summary,
        }),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `subagent_spawn failed: ${msg}`, isError: true }
    }
  },
}
