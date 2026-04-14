/**
 * commands/builtins/new-session.ts — /new 指令
 *
 * Phase Q: 新建空白会话。
 */

import type { ChatCommandDefinition, ChatCommandResult, ChatCommandContext } from '../types.js'
import { randomUUID } from 'node:crypto'

export const newSessionCommand: ChatCommandDefinition = {
  name: 'new',
  description: '新建空白会话',
  usage: '/new',
  async execute(_args: string[], ctx: ChatCommandContext): Promise<ChatCommandResult> {
    const newSessionKey = `desktop:${randomUUID()}`

    return {
      data: {
        previousSessionKey: ctx.sessionKey,
        newSessionKey,
      },
      display: [
        '✨ **新会话已创建**',
        '',
        `  新会话: \`${newSessionKey}\``,
        `  前会话: \`${ctx.sessionKey}\``,
        '',
        '切换到新会话开始对话。',
      ].join('\n'),
    }
  },
}
