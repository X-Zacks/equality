/**
 * DefaultContextEngine — Phase 12.1 + 阶段C改进
 *
 * 将 runner 中散布的上下文管理逻辑归集到一个可插拔实现中：
 * - system prompt 构造
 * - memory recall 注入
 * - 历史消息拼接
 * - [NEW] tool result 预算压缩（对齐 OpenClaw tool-result-context-guard）
 * - compaction（LLM 摘要压缩）
 * - trimMessages（暴力截断兜底）
 * - afterTurn 持久化
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ContextEngine, AssembleParams, AssembleResult, AfterTurnParams, AfterToolCallParams, BeforeCompactionParams } from './types.js'
import { compactIfNeeded } from './compaction.js'
import { buildSystemPrompt } from '../agent/system-prompt.js'
import { memorySearch, getAllMemoriesWithEmbedding, getDefaultEmbedder, hybridSearch } from '../memory/index.js'
import type { MemoryRecord } from '../memory/index.js'
import { getOrCreate } from '../session/store.js'
import { persist } from '../session/persist.js'
import { calcMaxToolResultChars } from '../tools/index.js'
import { resolveContextWindow } from '../providers/context-window.js'
import { loadWorkspaceBootstrapFiles, formatBootstrapBlock } from '../agent/workspace-bootstrap.js'
import { indexTurn } from '../session/search-db.js'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** 全局 context 预算字符数（对齐 OpenClaw：contextWindow × 4字/token × 0.75 headroom） */
const CONTEXT_INPUT_HEADROOM_RATIO = 0.75
const CHARS_PER_TOKEN = 4

/** 单条 tool result 占 context window 的最大份额（与 truncation.ts 对齐） */
const SINGLE_TOOL_RESULT_CONTEXT_SHARE = 0.5

/** 压缩后的占位符（对齐 OpenClaw compacted placeholder） */
const TOOL_RESULT_COMPACT_PLACEHOLDER = '[工具结果已压缩以释放上下文空间]'

/** O1: Memory Recall 最大字符数 */
const MEMORY_RECALL_MAX_CHARS = 4000

// ─── tool result 预算压缩（仿 OpenClaw enforceToolResultContextBudgetInPlace）──

function measureChars(messages: ChatCompletionMessageParam[]): number {
  return messages.reduce((sum, m) => {
    if (typeof m.content === 'string') return sum + m.content.length
    return sum + JSON.stringify(m).length
  }, 0)
}

function isToolMessage(m: ChatCompletionMessageParam): m is ChatCompletionMessageParam & { role: 'tool'; content: string } {
  return m.role === 'tool' && typeof m.content === 'string'
}

/**
 * 对齐 OpenClaw 的两层 tool result 控制：
 *
 * 1. 单条上限：content 超过 maxSingleToolResultChars 时截断（仅替换内容，保留消息条目）
 * 2. 全局预算：总字符数超过 contextBudgetChars 时从最旧 tool result 开始 compact
 *
 * 只操作 tool result，不删除 assistant / user 消息。
 */
function enforceToolResultBudget(
  messages: ChatCompletionMessageParam[],
  contextWindowTokens: number,
): void {
  const contextBudgetChars = Math.floor(contextWindowTokens * CHARS_PER_TOKEN * CONTEXT_INPUT_HEADROOM_RATIO)
  const maxSingleChars = Math.floor(contextWindowTokens * CHARS_PER_TOKEN * SINGLE_TOOL_RESULT_CONTEXT_SHARE)

  // 1. 单条截断：超过单条上限的直接替换内容（不删消息，LLM 还能看到"这里有工具结果，只是太长"）
  for (const msg of messages) {
    if (isToolMessage(msg) && msg.content.length > maxSingleChars) {
      const original = msg.content.length
      ;(msg as { content: string }).content =
        `[工具结果已截断，原始长度 ${original} 字符，超过单条上限 ${maxSingleChars} 字符]`
      console.log(`[context-engine] 单条 tool result 截断: ${original} → placeholder (maxSingleChars=${maxSingleChars})`)
    }
  }

  // 2. 全局预算：从最旧 tool result 开始 compact，直到回到预算内
  if (measureChars(messages) <= contextBudgetChars) return

  for (const msg of messages) {
    if (!isToolMessage(msg)) continue
    if (msg.content === TOOL_RESULT_COMPACT_PLACEHOLDER) continue
    const before = msg.content.length
    ;(msg as { content: string }).content = TOOL_RESULT_COMPACT_PLACEHOLDER
    console.log(`[context-engine] tool result compact: ${before} → placeholder`)
    if (measureChars(messages) <= contextBudgetChars) break
  }
}

// ─── DefaultContextEngine ────────────────────────────────────────────────────

export class DefaultContextEngine implements ContextEngine {
  readonly engineId = 'default'

  async assemble(params: AssembleParams): Promise<AssembleResult> {
    const { sessionKey, provider, userMessage, workspaceDir, skills, activeSkills, abortSignal, onCompaction } = params

    // 1. 获取 session
    const session = await getOrCreate(sessionKey)

    // 1.5 加载工作区引导文件（Phase G1）
    let bootstrapBlock: string | undefined
    if (workspaceDir) {
      try {
        const { files } = await loadWorkspaceBootstrapFiles(workspaceDir)
        if (files.length > 0) {
          bootstrapBlock = formatBootstrapBlock(files)
          console.log(`[context-engine] 加载 ${files.length} 个引导文件: ${files.map(f => f.name).join(', ')}`)
        }
      } catch (err) {
        console.warn('[context-engine] 引导文件加载失败:', err)
      }
    }

    // 2. 构造 system prompt
    let systemContent = buildSystemPrompt({
      workspaceDir,
      skills,
      modelName: provider.modelId,
      activeSkills,
      bootstrapBlock,
    })

    // 3. Memory Recall：冻结快照模式（O1）
    //    首轮 assemble 时生成快照并缓存到 session，后续轮直接复用
    let recalledCount = 0
    let memoryBlock = ''
    try {
      if (session.frozenMemorySnapshot != null) {
        // ── 后续轮：复用冻结快照 ──
        memoryBlock = session.frozenMemorySnapshot
        // 从快照中计算行数（每行 "N. [category] text"）
        recalledCount = memoryBlock ? (memoryBlock.match(/^\d+\./gm)?.length ?? 0) : 0
        console.log(`[context-engine] 复用冻结快照: ${recalledCount} 条记忆 (${memoryBlock.length} chars)`)
      } else {
        // ── 首轮：执行 hybrid search 并冻结（K2） ──
        if (userMessage.trim().length >= 10) {
          // K2: BM25 + cosine 混合检索
          const bm25Results = memorySearch(userMessage, 20)
          const bm25Records: MemoryRecord[] = bm25Results.map(r => ({
            id: r.entry.id,
            text: r.entry.text,
            category: r.entry.category,
            bm25Score: Math.abs(r.rank),
          }))

          let recallResults: Array<{ text: string; category?: string; score: number }> = []
          try {
            const allWithEmbedding = getAllMemoriesWithEmbedding()
            const embedder = getDefaultEmbedder()
            const hybridResults = await hybridSearch(
              bm25Records,
              allWithEmbedding.map(r => ({
                id: r.id,
                text: r.text,
                category: r.category,
                embedding: r.embedding,
              })),
              userMessage,
              embedder,
              { query: userMessage, limit: 10, alpha: 0.4 },
            )
            recallResults = hybridResults.map(r => ({ text: r.text, category: r.category, score: r.score }))
          } catch (hybridErr) {
            // 降级到纯 BM25
            console.warn('[context-engine] hybrid search 失败，降级到 BM25:', hybridErr)
            recallResults = bm25Results.map(r => ({ text: r.entry.text, category: r.entry.category, score: 0 }))
          }

          if (recallResults.length > 0) {
            // 容量截断：保持条目完整性
            const lines: string[] = []
            let totalChars = 0
            for (let i = 0; i < recallResults.length; i++) {
              const line = `${i + 1}. [${recallResults[i].category ?? 'general'}] ${recallResults[i].text}`
              if (totalChars + line.length > MEMORY_RECALL_MAX_CHARS && lines.length > 0) {
                console.log(`[context-engine] Memory recall 容量截断: ${i}/${recallResults.length} 条 (${totalChars} chars)`)
                break
              }
              lines.push(line)
              totalChars += line.length + 1 // +1 for \n
            }
            recalledCount = lines.length
            memoryBlock = lines.join('\n')
          }
        }
        // 冻结快照（即使为空也冻结，标记"已执行过"）
        session.frozenMemorySnapshot = memoryBlock
        console.log(`[context-engine] 冻结记忆快照: ${recalledCount} 条 (${memoryBlock.length} chars)`)
      }

      if (memoryBlock) {
        systemContent += `\n\n<long-term-memories>\nThe following memories were auto-recalled from your persistent memory store. Use them to provide personalized responses:\n${memoryBlock}\n</long-term-memories>`
      }
    } catch (err) {
      console.warn('[context-engine] memory recall 失败:', err)
    }

    // 4. 拼接消息列表
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...session.messages,
    ]

    // 5. [NEW] Tool result 预算压缩（阶段C，对齐 OpenClaw）
    //    在 compaction 之前，先从 tool result 层面降低 context 压力。
    //    只替换 tool result 内容，不删除消息条目，LLM 仍能看到工具调用记录。
    //    Phase G3: 使用 resolveContextWindow 动态解析 context window 大小
    const cwInfo = resolveContextWindow({
      modelId: provider.modelId,
      providerReported: provider.getCapabilities().contextWindow,
    })
    const contextWindowTokens = cwInfo.tokens
    try {
      enforceToolResultBudget(messages, contextWindowTokens)
    } catch (err) {
      console.warn('[context-engine] tool result budget enforce 失败:', err)
    }

    // 6. Compaction：智能压缩历史
    let wasCompacted = false
    try {
      const compResult = await compactIfNeeded(messages, provider, {
        abortSignal,
        onCompaction,
      })
      if (compResult.compacted) {
        wasCompacted = true
        console.log(`[context-engine] Compaction: 移除 ${compResult.removedCount} 条，摘要 ${compResult.summaryTokens} tokens`)
      }
    } catch (err) {
      console.warn('[context-engine] Compaction 失败，回退到 trim:', err)
    }

    // 7. 暴力截断兜底（极端情况，正常不触发）
    const contextBudgetChars = Math.floor(
      contextWindowTokens * CHARS_PER_TOKEN * CONTEXT_INPUT_HEADROOM_RATIO,
    )
    trimMessages(messages, contextBudgetChars)

    return { messages, wasCompacted, recalledMemories: recalledCount }
  }

  async afterTurn(params: AfterTurnParams): Promise<void> {
    const session = await getOrCreate(params.sessionKey)

    // 追加 assistant 回复
    if (params.assistantMessage) {
      session.messages.push({ role: 'assistant', content: params.assistantMessage })
      // 将 costLine 存为独立元数据，不混入 LLM 上下文
      if (params.costLine) {
        const idx = session.messages.length - 1
        session.costLines[idx] = params.costLine
      }
    }

    // 持久化
    await persist(session)

    // O4: 增量索引到 session-search.db（fire-and-forget，不阻塞主流程）
    if (params.assistantMessage) {
      const turnIndex = session.messages.length - 1
      void Promise.resolve().then(() => {
        try {
          indexTurn(params.sessionKey, turnIndex, 'assistant', params.assistantMessage)
          // 同时索引最近的 user message（如果有的话）
          for (let i = turnIndex - 1; i >= 0; i--) {
            const msg = session.messages[i]
            if (msg.role === 'user' && typeof msg.content === 'string') {
              indexTurn(params.sessionKey, i, 'user', msg.content)
              break
            }
          }
        } catch (err) {
          console.warn('[context-engine] session search indexing failed:', err)
        }
      })
    }
  }

  // ── D4 生命周期方法 ────────────────────────────────────────────────────────

  /**
   * 工具执行后审计日志（D4）。
   * DefaultContextEngine 仅输出审计日志，第三方引擎可覆盖做更多事。
   */
  async afterToolCall(params: AfterToolCallParams): Promise<void> {
    const { sessionKey, toolName, mutationType, risk, isError } = params
    console.log(
      `[context-engine] afterToolCall: session=${sessionKey.slice(0, 8)} tool=${toolName} ` +
      `mutation=${mutationType} risk=${risk} error=${isError}`,
    )
  }

  /**
   * Compaction 执行前日志（D4）。
   * DefaultContextEngine 仅记录即将压缩的消息数和 token 使用率。
   */
  async beforeCompaction(params: BeforeCompactionParams): Promise<void> {
    const { sessionKey, compressCount, tokenUsageRatio } = params
    console.log(
      `[context-engine] beforeCompaction: session=${sessionKey.slice(0, 8)} ` +
      `compress=${compressCount} msgs, usage=${(tokenUsageRatio * 100).toFixed(1)}%`,
    )
  }
}

// ─── trimMessages（公共工具函数，最后兜底）────────────────────────────────────

/**
 * 裁剪消息列表使总字符数不超限。
 * 策略：保留 messages[0]（system）和最后 4 条，从第 2 条开始逐条移除。
 *
 * 注意：此函数是最后一道兜底。在 enforceToolResultBudget（步骤 5）之后正常情况不会触发。
 */
export function trimMessages(messages: ChatCompletionMessageParam[], maxChars: number): void {
  const totalChars = () => messages.reduce((sum, m) => {
    if (typeof m.content === 'string') return sum + m.content.length
    return sum + JSON.stringify(m).length
  }, 0)

  if (totalChars() <= maxChars) return

  const KEEP_TAIL = 4
  while (messages.length > KEEP_TAIL + 1 && totalChars() > maxChars) {
    const removed = messages.splice(1, 1)[0]
    console.warn(`[context-engine] trimMessages 兜底裁剪: role=${('role' in removed) ? removed.role : 'unknown'}`)
  }

  if (totalChars() > maxChars) {
    console.warn(`[context-engine] 裁剪后仍超限: ${totalChars()} chars > ${maxChars}`)
  }
}
