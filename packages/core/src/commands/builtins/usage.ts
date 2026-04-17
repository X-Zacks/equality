/**
 * commands/builtins/usage.ts — /usage 指令
 *
 * Phase Q: 显示 Token 消耗统计。
 * Phase U: 增加请求配额信息。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'
import { allQuotaStatuses } from '../../cost/request-quota.js'

export const usageCommand: ChatCommandDefinition = {
  name: 'usage',
  description: '显示本次会话的 Token 消耗和请求配额统计',
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

    // Phase U: 请求配额
    const quotas = allQuotaStatuses()
    if (quotas.length > 0) {
      lines.push('', '📊 **请求配额**', '')
      for (const q of quotas) {
        const pctStr = (q.pct * 100).toFixed(0)
        const icon = q.level === 'ok' ? '🟢' : q.level === 'warn' ? '🟡' : q.level === 'critical' ? '🔴' : '🚫'
        lines.push(`  ${icon} ${q.provider}/${q.tier}: ${q.used}/${q.limit} (${pctStr}%) — 剩余 ${q.remaining} 次`)
      }
    }

    return {
      data: {
        sessionKey: ctx.sessionKey,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        turns,
        estimatedCost,
        quotas,
      },
      display: lines.join('\n'),
    }
  },
}
