/**
 * commands/builtins/reset.ts — /reset 指令
 *
 * Phase Q: 清空当前会话消息。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'

export const resetCommand: ChatCommandDefinition = {
  name: 'reset',
  description: '清空当前会话的所有消息',
  usage: '/reset',
  async execute(_args: string[], ctx: ChatCommandContext): Promise<ChatCommandResult> {
    const cleared = ctx.messages.length

    // 实际清空操作由 Gateway 路由层执行（从 session store 清除）
    // 此处只返回意图和数据，路由层负责执行
    return {
      data: {
        sessionKey: ctx.sessionKey,
        cleared,
        action: 'reset',
      },
      display: [
        '🗑️ **会话已重置**',
        '',
        `  已清除 ${cleared} 条消息`,
        `  会话: \`${ctx.sessionKey}\``,
      ].join('\n'),
    }
  },
}
