/**
 * tools/builtins/subtask-spawn.ts — subtask_spawn 工具
 *
 * Phase E3 (GAP-8): 让主 Agent 创建子任务 任务
 * Phase E4: execute 通过延迟绑定接入 SubtaskManager
 */

import type { ToolDefinition } from '../types.js'
import type { SubtaskManager } from '../../agent/subtask-manager.js'

let _manager: SubtaskManager | null = null

/** 延迟绑定：Gateway 创建 SubtaskManager 后调用此函数注入引用 */
export function setSubtaskManagerForSpawn(manager: SubtaskManager): void {
  _manager = manager
}

export const subtaskSpawnTool: ToolDefinition = {
  name: 'subtask_spawn',
  description:
    'Create a subtask to execute a specific task. Subtasks run in an independent context and return a summary result upon completion. ' +
    'The subtask inherits the user\'s selected model. ' +
    'Suitable for work requiring independent investigation, execution, or analysis. ' +
    'To run multiple subtasks in parallel, call multiple subtask_spawn in a SINGLE turn (they execute concurrently).',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Initial task instructions for the subtask',
      },
      goal: {
        type: 'string',
        description: 'Goal description for the subtask (shown in task list)',
      },
      allowed_tools: {
        type: 'string',
        description: 'Comma-separated list of tool names available to the subtask. If not specified, inherits parent Agent\'s tool whitelist',
      },
      timeout_seconds: {
        type: 'string',
        description: 'Subtask timeout in seconds. Default 0 (no limit, protected by 30-minute safety valve). Set a positive value to override.',
      },
    },
    required: ['prompt'],
  },
  execute: async (input, ctx) => {
    if (!_manager) {
      return { content: 'SubtaskManager not initialized', isError: true }
    }
    const parentSessionKey = ctx.sessionKey
    if (!parentSessionKey) {
      return { content: 'sessionKey is required for subtask_spawn', isError: true }
    }

    const prompt = String(input.prompt ?? '')
    const goal = input.goal ? String(input.goal) : undefined
    const allowedTools = input.allowed_tools
      ? String(input.allowed_tools).split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    const timeoutSeconds = input.timeout_seconds ? Number(input.timeout_seconds) : 0
    const timeoutMs = timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0

    // 从 ToolContext 中提取父会话的 Provider 信息
    const parentProviderInfo = ctx.provider
      ? { providerId: ctx.provider.providerId, modelId: ctx.provider.modelId }
      : undefined

    try {
      const result = await _manager.spawn(parentSessionKey, {
        prompt,
        goal,
        allowedTools,
        timeoutMs,
        parentProviderInfo,
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
      return { content: `subtask_spawn failed: ${msg}`, isError: true }
    }
  },
}
