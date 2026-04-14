/**
 * commands/builtins/model.ts — /model 指令
 *
 * Phase Q: 切换当前会话使用的 LLM 模型。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'

export const modelCommand: ChatCommandDefinition = {
  name: 'model',
  description: '切换当前会话使用的 LLM 模型',
  usage: '/model <name>',
  async execute(args: string[], ctx: ChatCommandContext): Promise<ChatCommandResult> {
    const available = ctx.getAvailableModels?.() ?? []

    if (args.length === 0) {
      // 无参数：列出可用模型
      const currentModel = (ctx.metadata?.model as string) ?? '(默认)'
      const lines = [
        '🤖 **可用模型**',
        '',
        `  当前: ${currentModel}`,
        '',
        ...available.map(m => `  - ${m}${m === currentModel ? ' ← 当前' : ''}`),
        '',
        '用法: `/model <name>` 切换模型',
      ]
      return {
        data: { currentModel, available },
        display: lines.join('\n'),
      }
    }

    const newModel = args[0]
    const previousModel = (ctx.metadata?.model as string) ?? '(默认)'

    // 如果有可用模型列表，验证目标模型是否存在
    if (available.length > 0 && !available.includes(newModel)) {
      return {
        data: { error: 'unknown_model', requested: newModel, available },
        display: [
          `❌ 未知模型: \`${newModel}\``,
          '',
          '可用模型:',
          ...available.map(m => `  - ${m}`),
        ].join('\n'),
      }
    }

    // 实际模型切换由 Gateway 路由层执行
    return {
      data: {
        sessionKey: ctx.sessionKey,
        previousModel,
        newModel,
        action: 'switch_model',
      },
      display: [
        '🔄 **模型已切换**',
        '',
        `  ${previousModel} → **${newModel}**`,
      ].join('\n'),
    }
  },
}
