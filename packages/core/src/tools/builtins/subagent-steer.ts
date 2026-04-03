/**
 * tools/builtins/subagent-steer.ts — subagent_steer 工具
 *
 * Phase E3 (GAP-8): 向运行中的子 Agent 注入方向调整消息
 * Phase E4: execute 通过延迟绑定接入 SubagentManager
 */

import type { ToolDefinition } from '../types.js'
import type { SubagentManager } from '../../agent/subagent-manager.js'

let _manager: SubagentManager | null = null

/** 延迟绑定 */
export function setSubagentManagerForSteer(manager: SubagentManager): void {
  _manager = manager
}

export const subagentSteerTool: ToolDefinition = {
  name: 'subagent_steer',
  description:
    '向运行中的子 Agent 发送方向调整消息。子 Agent 会在下一轮适当时机消费该消息。',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: '目标子任务的 taskId',
      },
      message: {
        type: 'string',
        description: '方向调整消息内容',
      },
    },
    required: ['task_id', 'message'],
  },
  execute: async (input, _ctx) => {
    if (!_manager) {
      return { content: 'SubagentManager not initialized', isError: true }
    }
    const taskId = String(input.task_id ?? '')
    const message = String(input.message ?? '')
    if (!taskId || !message) {
      return { content: 'task_id and message are required', isError: true }
    }

    try {
      _manager.steer(taskId, message)
      return { content: JSON.stringify({ ok: true }) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `subagent_steer failed: ${msg}`, isError: true }
    }
  },
}
