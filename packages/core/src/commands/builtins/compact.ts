/**
 * commands/builtins/compact.ts — /compact 指令
 *
 * Phase Q: 手动触发上下文压缩。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'

export const compactCommand: ChatCommandDefinition = {
  name: 'compact',
  description: '手动触发当前会话的上下文压缩',
  usage: '/compact',
  async execute(_args: string[], ctx: ChatCommandContext): Promise<ChatCommandResult> {
    const beforeMessages = ctx.messages.length

    // 实际压缩操作由 Gateway 路由层执行
    return {
      data: {
        sessionKey: ctx.sessionKey,
        beforeMessages,
        action: 'compact',
      },
      display: [
        '📦 **上下文压缩**',
        '',
        `  当前消息数: ${beforeMessages}`,
        `  会话: \`${ctx.sessionKey}\``,
        '',
        '压缩已触发，将在后台执行。',
      ].join('\n'),
    }
  },
}
