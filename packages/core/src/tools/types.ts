/**
 * tools/types.ts — 工具系统类型定义
 *
 * Phase 2: Tool Registry + 5 个内置工具 + Tool Loop
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions'

// ─── Tool Input Schema ────────────────────────────────────────────────────────

/** JSON Schema 子集，用于 LLM Function Calling */
export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description: string
    enum?: string[]
    default?: unknown
  }>
  required?: string[]
}

// ─── Tool Context ─────────────────────────────────────────────────────────────

/** 工具执行时的上下文信息 */
export interface ToolContext {
  /** 当前工作目录（工具的相对路径基于此） */
  workspaceDir: string
  /** 当前会话 key（browser 等有状态工具用于隔离） */
  sessionKey?: string
  /** 取消信号（用户中止时触发） */
  abortSignal?: AbortSignal
  /** HTTPS 代理 URL（web_fetch / bash 继承） */
  proxyUrl?: string
  /** 额外环境变量（注入到 bash 等工具） */
  env?: Record<string, string>
  /** LLM Provider 实例（read_image 等需要调用视觉模型的工具使用） */
  provider?: import('../providers/types.js').LLMProvider
}

// ─── Tool Definition ──────────────────────────────────────────────────────────

/** 工具定义：name + schema + execute */
export interface ToolDefinition {
  /** 工具名，全局唯一，字母数字下划线中划线 */
  name: string
  /** 给 LLM 看的功能描述 */
  description: string
  /** 参数 JSON Schema */
  inputSchema: ToolInputSchema
  /** 执行函数 */
  execute: (input: Record<string, unknown>, ctx: ToolContext, onUpdate?: (partial: string) => void) => Promise<ToolResult>
}

// ─── Tool Result ──────────────────────────────────────────────────────────────

/** 工具执行结果 */
export interface ToolResult {
  /** 主要输出内容（给 LLM 看） */
  content: string
  /** 是否为错误结果（错误时 LLM 可尝试修正） */
  isError?: boolean
  /** 元信息（不传给 LLM，用于内部统计） */
  metadata?: ToolResultMetadata
}

export interface ToolResultMetadata {
  /** 内容是否被截断 */
  truncated?: boolean
  /** 截断前的原始长度 */
  originalLength?: number
  /** 执行耗时（毫秒） */
  durationMs?: number
  /** 结果包含可操作建议（Phase B: Agent 可据此调用 bash 安装依赖） */
  actionable?: boolean
  /** 建议执行的命令（配合 actionable 使用） */
  suggestedCommand?: string
}

// ─── Tool Policy ──────────────────────────────────────────────────────────────

/** 工具访问策略（Phase 2: 全局级别白名单/黑名单） */
export interface ToolPolicy {
  /** 白名单模式：只允许列出的工具（为空 = 全部允许） */
  allow?: string[]
  /** 黑名单模式：禁止列出的工具（deny 优先于 allow） */
  deny?: string[]
  /** 策略作用域（Phase 2 只有 global，预留扩展） */
  scope?: 'global' | 'agent' | 'provider' | 'group'
}

// ─── Re-export OpenAI tool schema type ────────────────────────────────────────

export type { ChatCompletionTool as OpenAIToolSchema }
