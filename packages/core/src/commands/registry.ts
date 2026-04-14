/**
 * commands/registry.ts — Chat Command 注册表
 *
 * Phase Q: 可扩展的指令注册与查找系统。
 */

import type { ChatCommandDefinition } from './types.js'

// ─── ChatCommandRegistry ────────────────────────────────────────────────────

export class ChatCommandRegistry {
  private commands = new Map<string, ChatCommandDefinition>()

  /**
   * 注册指令。如果同名已存在则替换。
   */
  register(command: ChatCommandDefinition): void {
    this.commands.set(command.name, command)
  }

  /**
   * 获取指令定义。
   */
  get(name: string): ChatCommandDefinition | undefined {
    return this.commands.get(name)
  }

  /**
   * 移除指令。
   */
  unregister(name: string): boolean {
    return this.commands.delete(name)
  }

  /**
   * 列出所有指令的名称。
   */
  list(): string[] {
    return [...this.commands.keys()].sort()
  }

  /**
   * 列出所有指令的摘要信息（供前端 / help 使用）。
   */
  listDetails(): Array<{ name: string; description: string; usage?: string }> {
    return [...this.commands.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => ({
        name: c.name,
        description: c.description,
        usage: c.usage,
      }))
  }

  /**
   * 已注册指令数量。
   */
  get size(): number {
    return this.commands.size
  }

  /**
   * 清除所有指令（测试用）。
   */
  clear(): void {
    this.commands.clear()
  }
}
