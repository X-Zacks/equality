/**
 * agent/interactive.ts — 交互式 UI 载荷（Phase F1）
 *
 * 允许 Agent 在回复中嵌入结构化 UI 元素（按钮/选择器/文本），
 * Desktop 层渲染为可点击组件，用户交互结果回传到 Agent 继续对话。
 *
 * 围栏语法：
 *   :::interactive
 *   { "elements": [ ... ] }
 *   :::
 *
 * 解析后从 assistantText 中剥离，通过 onInteractive 回调发射到 SSE。
 */

// ─── 类型 ─────────────────────────────────────────────────────────────────────

/** 按钮样式 */
export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger'

/** 单个按钮 */
export interface InteractiveButton {
  type: 'button'
  actionId: string
  label: string
  style?: ButtonStyle
}

/** 下拉选择器 */
export interface InteractiveSelect {
  type: 'select'
  actionId: string
  placeholder?: string
  options: { label: string; value: string }[]
}

/** 文本块（只读，用于说明） */
export interface InteractiveText {
  type: 'text'
  content: string
}

/** 元素联合类型 */
export type InteractiveElement = InteractiveButton | InteractiveSelect | InteractiveText

/** 载荷根类型 */
export interface InteractivePayload {
  elements: InteractiveElement[]
}

// ─── 解析 ─────────────────────────────────────────────────────────────────────

/**
 * 匹配 :::interactive ... ::: 围栏块
 *
 * 支持多个块，块内换行的 JSON。
 * 非贪婪匹配避免跨块。
 */
const INTERACTIVE_BLOCK_RE = /:::interactive\s*\n([\s\S]*?)\n:::/g

/**
 * 解析 assistantText 中的交互式块。
 *
 * @returns cleaned — 去掉所有合法交互块后的文本
 * @returns payloads — 成功解析的载荷数组
 */
export function parseInteractiveBlocks(text: string): {
  cleaned: string
  payloads: InteractivePayload[]
} {
  const payloads: InteractivePayload[] = []
  const cleaned = text.replace(INTERACTIVE_BLOCK_RE, (match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr.trim())
      if (isValidPayload(parsed)) {
        payloads.push(parsed)
        return '' // 剥离成功解析的块
      }
      console.warn('[interactive] 无效载荷结构，保留原文')
      return match
    } catch (e) {
      console.warn('[interactive] JSON 解析失败，保留原文:', (e as Error).message)
      return match
    }
  })

  return { cleaned: cleaned.trim(), payloads }
}

// ─── 验证 ─────────────────────────────────────────────────────────────────────

function isValidPayload(obj: unknown): obj is InteractivePayload {
  if (!obj || typeof obj !== 'object') return false
  const p = obj as Record<string, unknown>
  if (!Array.isArray(p.elements)) return false
  return p.elements.every(isValidElement)
}

function isValidElement(el: unknown): el is InteractiveElement {
  if (!el || typeof el !== 'object') return false
  const e = el as Record<string, unknown>
  switch (e.type) {
    case 'button':
      return typeof e.actionId === 'string' && typeof e.label === 'string'
    case 'select':
      return typeof e.actionId === 'string' && Array.isArray(e.options)
    case 'text':
      return typeof e.content === 'string'
    default:
      return false
  }
}

// ─── 交互回传 ─────────────────────────────────────────────────────────────────

const REPLY_PREFIX = '__interactive_reply__:'

/**
 * 生成交互回传消息
 */
export function formatInteractiveReply(actionId: string, value: string): string {
  return `${REPLY_PREFIX}${actionId}:${value}`
}

/**
 * 解析用户消息是否为交互回传
 */
export function parseInteractiveReply(message: string): { actionId: string; value: string } | null {
  if (!message.startsWith(REPLY_PREFIX)) return null
  const rest = message.slice(REPLY_PREFIX.length)
  const colonIdx = rest.indexOf(':')
  if (colonIdx < 1) return null
  return {
    actionId: rest.slice(0, colonIdx),
    value: rest.slice(colonIdx + 1),
  }
}
