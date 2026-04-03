/**
 * tools/builtins/subagent-kill.ts — subagent_kill 工具
 *
 * Phase E3 (GAP-8): 取消运行中的子 Agent 任务
 * Phase E4: execute 通过延迟绑定接入 SubagentManager
 */

import type { ToolDefinition } from '../types.js'
import type { SubagentManager } from '../../agent/subagent-manager.js'

let _manager: SubagentManager | null = null

/** 延迟绑定 */
export function setSubagentManagerForKill(manager: SubagentManager): void {
  _manager = manager
}

export const subagentKillTool: ToolDefinition = {
  name: 'subagent_kill',
  description:
    '取消一个运行中的子 Agent 任务。被取消的任务会立即中止执行。',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: '要取消的子任务的 taskId',
      },
    },
    required: ['task_id'],
  },
  execute: async (input, _ctx) => {
    if (!_manager) {
      return { content: 'SubagentManager not initialized', isError: true }
    }
    const taskId = String(input.task_id ?? '')
    if (!taskId) {
      return { content: 'task_id is required', isError: true }
    }

    try {
      _manager.kill(taskId)
      return { content: JSON.stringify({ ok: true, state: 'cancelled' }) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `subagent_kill failed: ${msg}`, isError: true }
    }
  },
}
