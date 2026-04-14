/**
 * commands/builtins/usage.ts — /usage 指令
 *
 * Phase Q: 显示 Token 消耗统计。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'

export const usageCommand: ChatCommandDefinition = {
  name: 'usage',
  description: '显示本次会话的 Token 消耗统计',
  usage: '/usage',
  async execute(_args: string[], ctx: ChatCommandContext): Promise<ChatCommandResult> {
    const totalInputTokens = (ctx.metadata?.totalInputTokens as number) ?? 0
    const totalOutputTokens = (ctx.metadata?.totalOutputTokens as number) ?? 0
    const totalTokens = totalInputTokens + totalOutputTokens
    const turns = (ctx.metadata?.turns as number) ?? 0

    // 粗略估算费用（以 GPT-4o 价格：$2.5/M input, $10/M output）
    const estimatedCost = (totalInputTokens * 2.5 + totalOutputTokens * 10) / 1_000_000

    const lines = [
      '📈 **Token 用量统计**',
      '',
      `  会话: \`${ctx.sessionKey}\``,
      `  输入 Tokens: ${totalInputTokens.toLocaleString()}`,
      `  输出 Tokens: ${totalOutputTokens.toLocaleString()}`,
      `  合计: ${totalTokens.toLocaleString()}`,
      `  对话轮次: ${turns}`,
      `  估算费用: $${estimatedCost.toFixed(4)}`,
    ]

    return {
      data: {
        sessionKey: ctx.sessionKey,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        turns,
        estimatedCost,
      },
      display: lines.join('\n'),
    }
  },
}
