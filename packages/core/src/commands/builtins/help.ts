/**
 * commands/builtins/help.ts — /help 指令
 *
 * Phase Q: 列出所有可用指令。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'
import type { ChatCommandRegistry } from '../registry.js'

export function createHelpCommand(registry: ChatCommandRegistry): ChatCommandDefinition {
  return {
    name: 'help',
    description: '列出所有可用的 / 指令',
    usage: '/help',
    async execute(_args: string[], _ctx: ChatCommandContext): Promise<ChatCommandResult> {
      const commands = registry.listDetails()
      const lines = [
        '📋 **可用指令**',
        '',
        ...commands.map(c => `  \`/${c.name}\` — ${c.description}${c.usage && c.usage !== `/${c.name}` ? ` (用法: ${c.usage})` : ''}`),
      ]
      return {
        data: { commands },
        display: lines.join('\n'),
      }
    },
  }
}
