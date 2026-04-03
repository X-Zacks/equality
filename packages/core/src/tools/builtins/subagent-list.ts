/**
 * tools/builtins/subagent-list.ts — subagent_list 工具
 *
 * Phase E3 (GAP-8): 列出当前会话下的子 Agent 任务
 */

import type { ToolDefinition } from '../types.js'

export const subagentListTool: ToolDefinition = {
  name: 'subagent_list',
  description:
    '列出当前会话下已创建的子 Agent 任务，包括 taskId、标题、状态和创建时间。',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, _ctx) => {
    return {
      content: 'subagent_list 需要通过 SubagentManager 执行',
      isError: true,
    }
  },
}
