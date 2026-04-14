/**
 * commands/types.ts — Chat Commands 类型定义
 *
 * Phase Q: / 指令系统类型。
 */

// ─── Session 消息类型（避免循环依赖，只取需要的部分） ─────────────────────────

export interface ChatCommandMessage {
  role: string
  content: string
}

// ─── Core Types ─────────────────────────────────────────────────────────────

/**
 * 指令执行上下文。
 */
export interface ChatCommandContext {
  /** 当前 session key */
  sessionKey: string
  /** 当前 session 消息列表（可能为空） */
  messages: ChatCommandMessage[]
  /** 获取可用模型列表 */
  getAvailableModels?: () => string[]
  /** 获取当前 session 的 metadata */
  metadata?: Record<string, unknown>
}

/**
 * 指令执行结果。
 */
export interface ChatCommandResult {
  /** 结构化数据 */
  data: Record<string, unknown>
  /** 给用户看的格式化文本 */
  display: string
}

/**
 * 单个 Chat Command 定义。
 */
export interface ChatCommandDefinition {
  /** 指令名（不含 /），如 "status" */
  name: string
  /** 简要说明 */
  description: string
  /** 用法提示，如 "/model <name>" */
  usage?: string
  /** 执行函数 */
  execute: (args: string[], ctx: ChatCommandContext) => Promise<ChatCommandResult>
}

/**
 * 指令解析结果。
 */
export interface ParsedChatCommand {
  /** 指令名（不含 /） */
  name: string
  /** 参数列表 */
  args: string[]
  /** 原始输入 */
  raw: string
}
