/**
 * tools/builtins/subagent-spawn.ts — subagent_spawn 工具
 *
 * Phase E3 (GAP-8): 让主 Agent 创建子 Agent 任务
 */

import type { ToolDefinition } from '../types.js'

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
  execute: async (_input, _ctx) => {
    // 实际执行逻辑由 SubagentManager 通过注入完成
    // 这里只是 schema 占位，真正的 execute 在注册时被覆盖
    return {
      content: 'subagent_spawn 需要通过 SubagentManager 执行',
      isError: true,
    }
  },
}
