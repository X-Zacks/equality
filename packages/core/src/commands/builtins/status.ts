/**
 * commands/builtins/status.ts — /status 指令
 *
 * Phase Q: 显示当前会话状态。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'

export const statusCommand: ChatCommandDefinition = {
  name: 'status',
  description: '显示当前会话状态',
  usage: '/status',
  async execute(_args: string[], ctx: ChatCommandContext): Promise<ChatCommandResult> {
    const messageCount = ctx.messages.length
    const userMessages = ctx.messages.filter(m => m.role === 'user').length
    const assistantMessages = ctx.messages.filter(m => m.role === 'assistant').length
    const toolMessages = ctx.messages.filter(m => m.role === 'tool').length

    const model = ctx.metadata?.model as string | undefined ?? '(默认)'
    const provider = ctx.metadata?.provider as string | undefined ?? '(自动)'

    const lines = [
      '📊 **会话状态**',
      '',
      `  会话: \`${ctx.sessionKey}\``,
      `  消息数: ${messageCount} (用户 ${userMessages}, AI ${assistantMessages}, 工具 ${toolMessages})`,
      `  模型: ${model}`,
      `  Provider: ${provider}`,
    ]

    return {
      data: {
        sessionKey: ctx.sessionKey,
        messageCount,
        userMessages,
        assistantMessages,
        toolMessages,
        model,
        provider,
      },
      display: lines.join('\n'),
    }
  },
}
