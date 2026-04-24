/**
 * tools/builtins/subtask-spawn-parallel.ts — subtask_spawn_parallel 工具
 *
 * 一次性并行启动多个子任务，等待全部完成后返回汇总结果。
 * 比连续调用 subtask_spawn 更可靠（不依赖 LLM 在一个回合发多个 tool_call）。
 */

import type { ToolDefinition } from '../types.js'
import type { SubtaskManager } from '../../agent/subtask-manager.js'

let _manager: SubtaskManager | null = null

export function setSubtaskManagerForSpawnParallel(manager: SubtaskManager): void {
  _manager = manager
}

export const subtaskSpawnParallelTool: ToolDefinition = {
  name: 'subtask_spawn_parallel',
  description:
    'Launch multiple subtasks in parallel and wait for ALL to complete. ' +
    'More reliable than calling subtask_spawn multiple times. ' +
    'Each subtask runs in an independent context. Returns an array of results. ' +
    'Use this when you have multiple independent tasks that can be done simultaneously (e.g., analyzing multiple files, processing multiple images).',
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'string',
        description:
          'JSON array of task objects. Each object has: ' +
          '{ "prompt": "task instructions (required)", "goal": "short description (optional)", "allowed_tools": "comma-separated tool names (optional)" }. ' +
          'Example: [{"prompt":"Analyze file A","goal":"Analyze A"},{"prompt":"Analyze file B","goal":"Analyze B"}]',
      },
      timeout_seconds: {
        type: 'string',
        description: 'Per-task timeout in seconds. Default 0 (no limit, protected by 30-minute safety valve).',
      },
    },
    required: ['tasks'],
  },
  execute: async (input, ctx) => {
    if (!_manager) {
      return { content: 'SubtaskManager not initialized', isError: true }
    }
    const parentSessionKey = ctx.sessionKey
    if (!parentSessionKey) {
      return { content: 'sessionKey is required for subtask_spawn_parallel', isError: true }
    }

    // 解析 tasks JSON
    let tasks: Array<{ prompt: string; goal?: string; allowed_tools?: string }>
    try {
      tasks = JSON.parse(String(input.tasks ?? '[]'))
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { content: 'tasks must be a non-empty JSON array', isError: true }
      }
    } catch (err) {
      return { content: `Invalid tasks JSON: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }

    if (tasks.length > 10) {
      return { content: `Too many parallel tasks (${tasks.length}). Maximum is 10.`, isError: true }
    }

    const timeoutSeconds = input.timeout_seconds ? Number(input.timeout_seconds) : 0
    const timeoutMs = timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0

    // 从 ToolContext 中提取父会话的 Provider 信息
    const parentProviderInfo = ctx.provider
      ? { providerId: ctx.provider.providerId, modelId: ctx.provider.modelId }
      : undefined

    try {
      const items = tasks.map(t => ({
        params: {
          prompt: String(t.prompt),
          goal: t.goal ? String(t.goal) : undefined,
          allowedTools: t.allowed_tools
            ? String(t.allowed_tools).split(',').map(s => s.trim()).filter(Boolean)
            : undefined,
          timeoutMs,
          parentProviderInfo,
        },
      }))

      const results = await _manager.spawnParallel(parentSessionKey, items)

      return {
        content: JSON.stringify({
          totalTasks: results.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results: results.map((r, i) => ({
            index: i,
            taskId: r.taskId,
            success: r.success,
            summary: r.summary,
          })),
        }, null, 2),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `subtask_spawn_parallel failed: ${msg}`, isError: true }
    }
  },
}
