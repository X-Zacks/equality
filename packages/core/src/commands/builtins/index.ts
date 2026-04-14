/**
 * commands/builtins/index.ts — 注册全部内建指令
 *
 * Phase Q: 汇总所有 builtin chat commands 并提供 registerBuiltins() 函数。
 */

import type { ChatCommandRegistry } from '../registry.js'
import { createHelpCommand } from './help.js'
import { statusCommand } from './status.js'
import { newSessionCommand } from './new-session.js'
import { resetCommand } from './reset.js'
import { compactCommand } from './compact.js'
import { usageCommand } from './usage.js'
import { modelCommand } from './model.js'

/**
 * 将全部 7 个内建指令注册到 registry。
 * /help 需要引用 registry 自身（列出所有指令），故使用 factory 模式。
 */
export function registerBuiltins(registry: ChatCommandRegistry): void {
  registry.register(statusCommand)
  registry.register(newSessionCommand)
  registry.register(resetCommand)
  registry.register(compactCommand)
  registry.register(usageCommand)
  registry.register(modelCommand)
  // help 最后注册，确保能列出其他所有指令
  registry.register(createHelpCommand(registry))
}

export {
  statusCommand,
  newSessionCommand,
  resetCommand,
  compactCommand,
  usageCommand,
  modelCommand,
  createHelpCommand,
}
