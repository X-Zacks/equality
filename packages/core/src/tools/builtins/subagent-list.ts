/**
 * tools/builtins/subagent-list.ts — subagent_list 工具
 *
 * Phase E3 (GAP-8): 列出当前会话下的子 Agent 任务
 * Phase E4: execute 通过延迟绑定接入 SubagentManager
 */

import type { ToolDefinition } from '../types.js'
import type { SubagentManager } from '../../agent/subagent-manager.js'

let _manager: SubagentManager | null = null

/** 延迟绑定 */
export function setSubagentManagerForList(manager: SubagentManager): void {
  _manager = manager
}

export const subagentListTool: ToolDefinition = {
  name: 'subagent_list',
  description:
    '列出当前会话下已创建的子 Agent 任务，包括 taskId、标题、状态和创建时间。',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, ctx) => {
    if (!_manager) {
      return { content: 'SubagentManager not initialized', isError: true }
    }
    const parentSessionKey = ctx.sessionKey
    if (!parentSessionKey) {
      return { content: 'sessionKey is required for subagent_list', isError: true }
    }

    const list = _manager.list(parentSessionKey)
    return {
      content: JSON.stringify(list.map(info => ({
        taskId: info.taskId,
        title: info.title,
        state: info.state,
        createdAt: info.createdAt,
      }))),
    }
  },
}
