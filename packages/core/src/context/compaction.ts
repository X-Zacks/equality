/**
 * compaction.ts — 上下文压缩引擎
 *
 * 当对话历史超过模型上下文窗口的 50% 时，调用 LLM 生成摘要，
 * 用摘要替换旧历史，释放 token 空间。
 *
 * 流程：
 * 1. estimateMessagesTokens → 判断是否超阈值
 * 2. 划分保护区（system + 最近 4 轮）和压缩区（其余）
 * 3. 调用 LLM 生成压缩区的摘要
 * 4. 用摘要消息替换压缩区
 *
 * 失败时回退到 trimMessages 暴力截断。
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { LLMProvider } from '../providers/types.js'
import { estimateMessagesTokens } from './token-estimator.js'

const COMPACTION_THRESHOLD = 0.5   // 超过上下文窗口 50% 触发
const COMPACTION_TIMEOUT = 60_000  // 60 秒超时
const KEEP_RECENT_TURNS = 4       // 保留最近 N 轮（user+assistant 对）

const SUMMARY_PROMPT = `请将以下对话历史压缩为简洁摘要。

必须保留：
1. 进行中的任务及其当前状态
2. 批量操作的进度（如"已完成 5/17 项"）
3. 所有标识符原样保留（文件路径、UUID、变量名、URL 等）
4. 关键决策和结论
5. 用户的偏好和约束条件

可以省略：
- 已完成且不再相关的中间步骤
- 重复的问候和确认
- 工具调用的详细输出（保留结论即可）

请直接输出摘要，不要加任何前缀或解释。`

export interface CompactionResult {
  compacted: boolean
  removedCount: number
  summaryTokens: number
}

/**
 * 检查是否需要 Compaction 并执行。
 * 直接修改 messages 数组（in-place）。
 *
 * @returns 压缩结果；如果未触发或失败，compacted=false
 */
export async function compactIfNeeded(
  messages: ChatCompletionMessageParam[],
  provider: LLMProvider,
  opts?: {
    onCompaction?: (summary: string) => void
    abortSignal?: AbortSignal
  },
): Promise<CompactionResult> {
  const contextWindow = provider.getCapabilities().contextWindow
  const estimatedTokens = estimateMessagesTokens(messages as Array<{ role?: string; content?: unknown; tool_calls?: unknown }>)

  // 不超阈值，无需压缩
  if (estimatedTokens / contextWindow <= COMPACTION_THRESHOLD) {
    return { compacted: false, removedCount: 0, summaryTokens: 0 }
  }

  console.log(`[compaction] 触发: ${estimatedTokens} tokens / ${contextWindow} context window (${(estimatedTokens / contextWindow * 100).toFixed(1)}%)`)

  try {
    return await compactWithTimeout(messages, provider, opts)
  } catch (err) {
    console.warn(`[compaction] 失败，跳过:`, err instanceof Error ? err.message : err)
    return { compacted: false, removedCount: 0, summaryTokens: 0 }
  }
}

async function compactWithTimeout(
  messages: ChatCompletionMessageParam[],
  provider: LLMProvider,
  opts?: {
    onCompaction?: (summary: string) => void
    abortSignal?: AbortSignal
  },
): Promise<CompactionResult> {
  // 超时控制
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), COMPACTION_TIMEOUT)

  // 合并 abort signal
  const signal = opts?.abortSignal
    ? mergeAbortSignals(opts.abortSignal, timeoutController.signal)
    : timeoutController.signal

  try {
    // ── 1. 划分保护区和压缩区 ──────────────────────────────────
    // 保护区：messages[0]（system）+ 最后 KEEP_RECENT_TURNS*2 条消息
    // 压缩区：中间的所有消息
    const keepTailCount = findKeepTailCount(messages)
    const compressEndIndex = messages.length - keepTailCount

    // 至少要有 2 条消息可压缩才值得做
    if (compressEndIndex <= 2) {
      return { compacted: false, removedCount: 0, summaryTokens: 0 }
    }

    const compressRegion = messages.slice(1, compressEndIndex) // 跳过 system[0]

    // ── 2. 序列化压缩区为文本 ──────────────────────────────────
    const historyText = serializeMessages(compressRegion)

    // ── 3. 调用 LLM 生成摘要 ──────────────────────────────────
    const summaryResponse = await provider.chat({
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: historyText },
      ],
      abortSignal: signal,
    })

    const summary = summaryResponse.content.trim()
    if (!summary) {
      console.warn('[compaction] LLM 返回空摘要，跳过')
      return { compacted: false, removedCount: 0, summaryTokens: 0 }
    }

    // ── 4. 替换：删除压缩区，插入摘要消息 ──────────────────────
    const removedCount = compressEndIndex - 1 // 不含 system[0]
    const summaryMessage: ChatCompletionMessageParam = {
      role: 'assistant',
      content: `[对话历史摘要]\n${summary}`,
    }

    // 就地替换：保留 [0] + 摘要 + 保护区尾部
    messages.splice(1, removedCount, summaryMessage)

    const summaryTokens = estimateMessagesTokens([{ content: summary }])
    console.log(`[compaction] 完成: 移除 ${removedCount} 条消息，摘要 ${summaryTokens} tokens`)

    opts?.onCompaction?.(`对话历史已压缩（移除 ${removedCount} 条消息，保留摘要）`)

    return { compacted: true, removedCount, summaryTokens }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 计算尾部保护区的消息数。
 * 从末尾数 KEEP_RECENT_TURNS 轮完整的 user/assistant 对，
 * 同时包含相关的 tool/tool_calls 消息。
 */
function findKeepTailCount(messages: ChatCompletionMessageParam[]): number {
  let turns = 0
  let count = 0

  for (let i = messages.length - 1; i > 0; i--) {
    const msg = messages[i]
    count++

    // 遇到 user 消息算一轮完成
    if ('role' in msg && msg.role === 'user') {
      turns++
      if (turns >= KEEP_RECENT_TURNS) break
    }
  }

  return count
}

/** 将消息列表序列化为可读文本（给摘要 LLM） */
function serializeMessages(messages: ChatCompletionMessageParam[]): string {
  const lines: string[] = []
  for (const msg of messages) {
    const role = 'role' in msg ? msg.role : 'unknown'
    let content = ''

    if (typeof msg.content === 'string') {
      content = msg.content
    } else if (msg.content) {
      content = JSON.stringify(msg.content)
    }

    // tool result 只保留前 500 字符
    if (role === 'tool' && content.length > 500) {
      content = content.slice(0, 500) + '...[截断]'
    }

    lines.push(`[${role}] ${content}`)
  }
  return lines.join('\n\n')
}

/** 合并两个 AbortSignal */
function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}
