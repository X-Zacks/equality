/**
 * tools/builtins/subagent-kill.ts — subagent_kill 工具
 *
 * Phase E3 (GAP-8): 取消运行中的子 Agent 任务
 */

import type { ToolDefinition } from '../types.js'

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
  execute: async (_input, _ctx) => {
    return {
      content: 'subagent_kill 需要通过 SubagentManager 执行',
      isError: true,
    }
  },
}
