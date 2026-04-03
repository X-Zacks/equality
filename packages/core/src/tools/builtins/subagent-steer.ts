/**
 * tools/builtins/subagent-steer.ts — subagent_steer 工具
 *
 * Phase E3 (GAP-8): 向运行中的子 Agent 注入方向调整消息
 */

import type { ToolDefinition } from '../types.js'

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
  execute: async (_input, _ctx) => {
    return {
      content: 'subagent_steer 需要通过 SubagentManager 执行',
      isError: true,
    }
  },
}
