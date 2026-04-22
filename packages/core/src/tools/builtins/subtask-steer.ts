/**
 * tools/builtins/subtask-steer.ts — subtask_steer 工具
 *
 * Phase E3 (GAP-8): 向运行中的子任务 注入方向调整消息
 * Phase E4: execute 通过延迟绑定接入 SubtaskManager
 */

import type { ToolDefinition } from '../types.js'
import type { SubtaskManager } from '../../agent/subtask-manager.js'

let _manager: SubtaskManager | null = null

/** 延迟绑定 */
export function setSubtaskManagerForSteer(manager: SubtaskManager): void {
  _manager = manager
}

export const subtaskSteerTool: ToolDefinition = {
  name: 'subtask_steer',
  description:
    '向运行中的子任务 发送方向调整消息。子任务 会在下一轮适当时机消费该消息。',
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
      return { content: 'SubtaskManager not initialized', isError: true }
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
      return { content: `subtask_steer failed: ${msg}`, isError: true }
    }
  },
}
