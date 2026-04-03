/**
 * compaction.ts — 上下文压缩引擎（Phase D.3 增强）
 *
 * 当对话历史超过模型上下文窗口的 50% 时，调用 LLM 生成摘要，
 * 用摘要替换旧历史，释放 token 空间。
 *
 * Phase D.3 新增：
 * - 分段压缩：大历史先分块再逐块摘要再合并
 * - 标识符保护：UUID/路径/URL/Git hash 不被 LLM 改写
 * - 重试与降级：3 次指数退避重试 + trimMessages 兜底
 *
 * 流程：
 * 1. estimateMessagesTokens → 判断是否超阈值
 * 2. 划分保护区（system + 最近 4 轮）和压缩区（其余）
 * 3. 压缩区 < CHUNK_TOKEN_THRESHOLD → 单次摘要（原有逻辑）
 *    压缩区 ≥ CHUNK_TOKEN_THRESHOLD → 分段摘要
 * 4. 标识符验证 + 缺失标识符追加
 * 5. 用摘要消息替换压缩区
 *
 * 失败时回退到 trimMessages 暴力截断。
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { LLMProvider } from '../providers/types.js'
import { estimateMessagesTokens } from './token-estimator.js'
import { extractIdentifiers, validateIdentifiers, buildProtectionPrompt } from './identifier-shield.js'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const COMPACTION_THRESHOLD = 0.5   // 超过上下文窗口 50% 触发
const COMPACTION_TIMEOUT = 60_000  // 60 秒超时（单次 LLM 调用）
const KEEP_RECENT_TURNS = 4       // 保留最近 N 轮（user+assistant 对）

/** 分段压缩阈值（tokens）：超过此值使用分段模式 */
export const CHUNK_TOKEN_THRESHOLD = 4000

/** 最大重试次数 */
export const MAX_RETRIES = 3

/** 重试基础延迟（毫秒） */
const RETRY_BASE_MS = 1000

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

  // ── Phase D.3: 带重试的压缩 ──────────────────────────────────
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await compactCore(messages, provider, opts)
    } catch (err) {
      lastError = err
      const delayMs = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500
      console.warn(`[compaction] 第 ${attempt + 1} 次失败 (${err instanceof Error ? err.message : err})，${attempt < MAX_RETRIES - 1 ? `${Math.round(delayMs)}ms 后重试` : '已达上限'}`)
      if (attempt < MAX_RETRIES - 1) {
        await sleep(delayMs)
      }
    }
  }

  console.warn(`[compaction] ${MAX_RETRIES} 次全部失败，降级跳过:`, lastError instanceof Error ? lastError.message : lastError)
  return { compacted: false, removedCount: 0, summaryTokens: 0 }
}

/** 核心压缩逻辑（单次尝试） */
async function compactCore(
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
    const keepTailCount = findKeepTailCount(messages)
    const compressEndIndex = messages.length - keepTailCount

    // 至少要有 2 条消息可压缩才值得做
    if (compressEndIndex <= 2) {
      return { compacted: false, removedCount: 0, summaryTokens: 0 }
    }

    const compressRegion = messages.slice(1, compressEndIndex) // 跳过 system[0]

    // ── 2. 标识符提取（D3）──────────────────────────────────────
    const regionText = serializeMessages(compressRegion)
    const identifiers = extractIdentifiers(regionText)
    const protectionPrompt = buildProtectionPrompt(identifiers)

    // ── 3. 选择压缩模式 ────────────────────────────────────────
    const regionTokens = estimateMessagesTokens(
      compressRegion as Array<{ role?: string; content?: unknown; tool_calls?: unknown }>,
    )

    let summary: string
    if (regionTokens >= CHUNK_TOKEN_THRESHOLD) {
      // 分段压缩
      summary = await compactChunked(compressRegion, provider, signal, protectionPrompt)
      console.log(`[compaction] 分段模式: ${regionTokens} tokens, ${identifiers.length} 个标识符`)
    } else {
      // 单次压缩（原有逻辑，加标识符保护）
      summary = await compactSingle(regionText, provider, signal, protectionPrompt)
    }

    if (!summary) {
      console.warn('[compaction] LLM 返回空摘要，跳过')
      return { compacted: false, removedCount: 0, summaryTokens: 0 }
    }

    // ── 4. 标识符验证 + 缺失追加（D3）─────────────────────────
    if (identifiers.length > 0) {
      const missing = validateIdentifiers(summary, identifiers)
      if (missing.length > 0) {
        console.log(`[compaction] 标识符验证: ${missing.length}/${identifiers.length} 缺失，追加到摘要`)
        summary += `\n\n[保留标识符] ${missing.join(', ')}`
      }
    }

    // ── 5. 替换：删除压缩区，插入摘要消息 ──────────────────────
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

// ─── 单次压缩 ────────────────────────────────────────────────────────────────

async function compactSingle(
  historyText: string,
  provider: LLMProvider,
  signal: AbortSignal,
  protectionPrompt: string,
): Promise<string> {
  const prompt = SUMMARY_PROMPT + protectionPrompt
  const response = await provider.chat({
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: historyText },
    ],
    abortSignal: signal,
  })
  return response.content.trim()
}

// ─── 分段压缩（D3 核心）─────────────────────────────────────────────────────

async function compactChunked(
  compressRegion: ChatCompletionMessageParam[],
  provider: LLMProvider,
  signal: AbortSignal,
  protectionPrompt: string,
): Promise<string> {
  // 1. 分块
  const chunks = splitIntoChunks(compressRegion, CHUNK_TOKEN_THRESHOLD)
  console.log(`[compaction] 分为 ${chunks.length} 个 chunk`)

  // 2. 逐块摘要
  const prompt = SUMMARY_PROMPT + protectionPrompt
  const chunkSummaries: string[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = serializeMessages(chunks[i])
    const response = await provider.chat({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `[Part ${i + 1}/${chunks.length}]\n${chunkText}` },
      ],
      abortSignal: signal,
    })
    const chunkSummary = response.content.trim()
    if (chunkSummary) {
      chunkSummaries.push(chunkSummary)
    }
  }

  // 3. 合并摘要
  if (chunkSummaries.length === 0) return ''
  if (chunkSummaries.length === 1) return chunkSummaries[0]

  return chunkSummaries.join('\n\n---\n\n')
}

// ─── 分块策略 ────────────────────────────────────────────────────────────────

/**
 * 将消息列表分成多个 chunk，每个 chunk 不超过 chunkTokens。
 * tool_call（assistant with tool_calls）和 tool result 不拆分。
 */
export function splitIntoChunks(
  messages: ChatCompletionMessageParam[],
  chunkTokens: number,
): ChatCompletionMessageParam[][] {
  if (messages.length === 0) return []

  const chunks: ChatCompletionMessageParam[][] = []
  let current: ChatCompletionMessageParam[] = []
  let currentTokens = 0

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const msgTokens = estimateMessagesTokens(
      [msg as { role?: string; content?: unknown; tool_calls?: unknown }],
    )

    // 如果加入当前 msg 后超限，且 current 非空 → 切分
    if (currentTokens + msgTokens > chunkTokens && current.length > 0) {
      // 检查是否要回退：如果 current 末尾是 assistant(tool_calls)，
      // 而当前 msg 是 tool result → 不拆分，把 assistant 也带到下一个 chunk
      const lastMsg = current[current.length - 1]
      const isToolCallAssistant = lastMsg.role === 'assistant' && 'tool_calls' in lastMsg && lastMsg.tool_calls
      const isToolResult = msg.role === 'tool'

      if (isToolCallAssistant && isToolResult) {
        // 回退：把 assistant(tool_calls) 从 current 移到下一个 chunk
        const popped = current.pop()!
        if (current.length > 0) {
          chunks.push(current)
        }
        current = [popped, msg]
        currentTokens = estimateMessagesTokens(
          current as Array<{ role?: string; content?: unknown; tool_calls?: unknown }>,
        )
        continue
      }

      chunks.push(current)
      current = []
      currentTokens = 0
    }

    current.push(msg)
    currentTokens += msgTokens
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
