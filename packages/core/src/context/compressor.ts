/**
 * compressor.ts — Phase O2: 上下文智能压缩器
 *
 * 在原有 compaction.ts（D3）之上，提供更精细的压缩决策和结构化摘要。
 *
 * 触发条件（OR）：
 * - token 占比 ≥ CONTEXT_COMPRESS_THRESHOLD_PERCENT（默认 50%）
 * - 消息数 ≥ CONTEXT_COMPRESS_THRESHOLD_MESSAGES（默认 30）
 *
 * 6 步流水线：
 * 1. 标记 old/recent 区
 * 2. 提取 tool call name 列表
 * 3. LLM 生成结构化摘要
 * 4. 合成摘要为 system message
 * 5. 替换原始消息
 * 6. Recount 验证
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { LLMProvider } from '../providers/types.js'
import { estimateMessagesTokens } from './token-estimator.js'

// ─── 配置常量（可通过环境变量覆盖）───────────────────────────────────────────

function getEnvNumber(key: string, defaultVal: number): number {
  const raw = process.env[key]
  if (!raw) return defaultVal
  const v = parseFloat(raw)
  return isNaN(v) ? defaultVal : v
}

/** token 占比触发阈值 */
export function getCompressThresholdPercent(): number {
  return getEnvNumber('CONTEXT_COMPRESS_THRESHOLD_PERCENT', 0.50)
}

/** 消息数触发阈值 */
export function getCompressThresholdMessages(): number {
  return getEnvNumber('CONTEXT_COMPRESS_THRESHOLD_MESSAGES', 30)
}

/** recent 区最少保留消息数 */
export function getCompressRecentKeep(): number {
  return getEnvNumber('CONTEXT_COMPRESS_RECENT_KEEP', 6)
}

// ─── 结构化摘要 Prompt ──────────────────────────────────────────────────────

const STRUCTURED_SUMMARY_PROMPT = `请将以下对话历史压缩为结构化摘要。严格按照以下格式输出：

## 用户目标
[一句话描述用户的核心目标]

## 关键决策
- [要点1]
- [要点2]
...

## 工具调用摘要
- [工具名]: [结果要点]
...

## 未完成事项
- [未完成的任务或待确认事项]

## 重要上下文
- [需要保留的变量名、路径、配置、偏好等]

注意：
- 所有标识符（路径、UUID、URL、变量名等）必须原样保留
- 不要添加任何前缀或额外解释
- 直接输出摘要内容`

// ─── 决策函数 ────────────────────────────────────────────────────────────────

export interface CompressDecision {
  shouldCompress: boolean
  reason: 'token_percent' | 'message_count' | 'none'
  tokenPercent: number
  messageCount: number
}

/**
 * 判断是否应该压缩上下文。
 *
 * @param messages 当前消息列表
 * @param contextWindowTokens 模型上下文窗口大小（tokens）
 */
export function shouldCompress(
  messages: ChatCompletionMessageParam[],
  contextWindowTokens: number,
): CompressDecision {
  const thresholdPercent = getCompressThresholdPercent()
  const thresholdMessages = getCompressThresholdMessages()

  const estimatedTokens = estimateMessagesTokens(
    messages as Array<{ role?: string; content?: unknown; tool_calls?: unknown }>,
  )
  const tokenPercent = estimatedTokens / contextWindowTokens
  const messageCount = messages.length

  if (tokenPercent >= thresholdPercent) {
    return { shouldCompress: true, reason: 'token_percent', tokenPercent, messageCount }
  }
  if (messageCount >= thresholdMessages) {
    return { shouldCompress: true, reason: 'message_count', tokenPercent, messageCount }
  }
  return { shouldCompress: false, reason: 'none', tokenPercent, messageCount }
}

// ─── 6 步压缩流水线 ─────────────────────────────────────────────────────────

export interface CompressResult {
  compressed: boolean
  originalMessageCount: number
  compressedMessageCount: number
  summaryChars: number
}

/**
 * 执行 6 步上下文压缩。
 * 直接修改 messages 数组（in-place）。
 */
export async function compress(
  messages: ChatCompletionMessageParam[],
  provider: LLMProvider,
  contextWindowTokens: number,
  opts?: {
    abortSignal?: AbortSignal
  },
): Promise<CompressResult> {
  const originalCount = messages.length
  const recentKeep = getCompressRecentKeep()

  // ── Step 1: 标记 old/recent 区 ────────────────────────────────
  // recent 区保留最近 N 条消息，或直到最近一个 user message（取较大值）
  let recentStart = messages.length - recentKeep
  // 往前扫描找到最近的 user message 边界
  for (let i = messages.length - 1; i >= recentStart && i >= 1; i--) {
    if (messages[i].role === 'user') {
      recentStart = Math.min(recentStart, i)
      break
    }
  }
  recentStart = Math.max(1, recentStart) // 至少跳过 system[0]

  const oldRegion = messages.slice(1, recentStart) // 跳过 system[0]
  const recentRegion = messages.slice(recentStart)

  // 如果 old 区太小（< 4 条），不值得压缩
  if (oldRegion.length < 4) {
    console.log(`[compressor] old 区仅 ${oldRegion.length} 条，跳过压缩`)
    return { compressed: false, originalMessageCount: originalCount, compressedMessageCount: originalCount, summaryChars: 0 }
  }

  console.log(`[compressor] Step 1: old=${oldRegion.length} msgs, recent=${recentRegion.length} msgs`)

  // ── Step 2: 提取 tool call name 列表 ──────────────────────────
  const toolNames = new Set<string>()
  for (const msg of oldRegion) {
    if ('tool_calls' in msg && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if ('function' in tc && tc.function?.name) {
          toolNames.add(tc.function.name)
        }
      }
    }
  }
  console.log(`[compressor] Step 2: tools used = [${[...toolNames].join(', ')}]`)

  // ── Step 3: 调用 LLM 生成结构化摘要 ───────────────────────────
  const oldText = serializeForSummary(oldRegion)
  const toolListNote = toolNames.size > 0
    ? `\n\n工具使用列表: ${[...toolNames].join(', ')}`
    : ''

  let summary: string
  try {
    summary = await callLLMForSummary(
      provider,
      `${STRUCTURED_SUMMARY_PROMPT}${toolListNote}\n\n---\n\n${oldText}`,
      opts?.abortSignal,
    )
  } catch (err) {
    console.warn('[compressor] Step 3 LLM 摘要失败:', err)
    return { compressed: false, originalMessageCount: originalCount, compressedMessageCount: originalCount, summaryChars: 0 }
  }

  console.log(`[compressor] Step 3: summary generated (${summary.length} chars)`)

  // ── Step 4: 合成摘要为 system message ──────────────────────────
  const summaryMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: `[对话历史摘要 — 以下为之前 ${oldRegion.length} 条消息的压缩摘要]\n\n${summary}`,
  }

  // ── Step 5: 替换原始消息 ──────────────────────────────────────
  const beforeTokens = estimateMessagesTokens(
    messages as Array<{ role?: string; content?: unknown; tool_calls?: unknown }>,
  )

  // 保留 system[0] + 插入摘要 + recent 区
  messages.splice(1, messages.length - 1, summaryMessage, ...recentRegion)

  console.log(`[compressor] Step 5: ${originalCount} → ${messages.length} msgs`)

  // ── Step 6: Recount 验证 ──────────────────────────────────────
  const afterTokens = estimateMessagesTokens(
    messages as Array<{ role?: string; content?: unknown; tool_calls?: unknown }>,
  )

  if (afterTokens > beforeTokens) {
    console.warn(`[compressor] ⚠️ 压缩后 token 增加: ${beforeTokens} → ${afterTokens}，可能摘要过长`)
  } else {
    console.log(`[compressor] Step 6: tokens ${beforeTokens} → ${afterTokens} (saved ${beforeTokens - afterTokens})`)
  }

  return {
    compressed: true,
    originalMessageCount: originalCount,
    compressedMessageCount: messages.length,
    summaryChars: summary.length,
  }
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function serializeForSummary(messages: ChatCompletionMessageParam[]): string {
  return messages.map(m => {
    const role = m.role
    let content = ''
    if (typeof m.content === 'string') {
      content = m.content
    } else if (m.content) {
      content = JSON.stringify(m.content)
    }
    // 截断超长的单条消息
    if (content.length > 2000) {
      content = content.slice(0, 2000) + '...(truncated)'
    }
    return `[${role}]: ${content}`
  }).join('\n\n')
}

async function callLLMForSummary(
  provider: LLMProvider,
  prompt: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const summaryMessages: ChatCompletionMessageParam[] = [
    { role: 'user', content: prompt },
  ]

  let result = ''
  const stream = provider.streamChat({
    messages: summaryMessages,
    abortSignal,
  })

  for await (const delta of stream) {
    if (delta.content) {
      result += delta.content
    }
  }

  if (!result.trim()) {
    throw new Error('LLM returned empty summary')
  }

  return result.trim()
}
