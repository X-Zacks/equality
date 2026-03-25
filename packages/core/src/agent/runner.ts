import { v4 as uuidv4 } from 'uuid'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getOrCreate } from '../session/store.js'
import { persist } from '../session/persist.js'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ─── 工具执行日志持久化 ────────────────────────────────────────────────────────
const LOG_DIR = join(tmpdir(), 'equality-logs')
let _logDirReady = false

async function logToolCall(
  toolName: string,
  args: unknown,
  result: string,
  isError: boolean,
  durationMs: number,
): Promise<void> {
  try {
    if (!_logDirReady) {
      await mkdir(LOG_DIR, { recursive: true })
      _logDirReady = true
    }
    const date = new Date()
    const filename = `tool-${date.toISOString().slice(0, 10)}.log`
    const ts = date.toISOString()
    const entry = [
      `\n${'═'.repeat(80)}`,
      `[${ts}] ${isError ? '❌' : '✅'} ${toolName} (${durationMs}ms)`,
      `── INPUT ──`,
      typeof args === 'string' ? args : JSON.stringify(args, null, 2),
      `── OUTPUT (${result.length} chars) ──`,
      result,
      `${'═'.repeat(80)}`,
    ].join('\n')
    await appendFile(join(LOG_DIR, filename), entry, 'utf-8')
  } catch {
    // 日志写入失败不应影响主流程
  }
}
import { routeModel } from '../providers/router.js'
import { applyDecorators, buildDecoratorPipeline } from './stream.js'
import { record, calcCost, formatCostLine } from '../cost/ledger.js'
import type { LLMProvider, ChatDelta, ToolCallDelta } from '../providers/types.js'
import type { ToolRegistry, ToolContext, OpenAIToolSchema } from '../tools/index.js'
import { truncateToolResult, LoopDetector, computeArgsHash, computeResultHash } from '../tools/index.js'
import { getProxyUrl } from '../config/proxy.js'
import { DefaultContextEngine, trimMessages } from '../context/index.js'
import { memorySave } from '../memory/index.js'
import { getSecret, hasSecret } from '../config/secrets.js'

// ─── 配置读取工具函数 ─────────────────────────────────────────────────────────

function getAgentConfigNumber(
  key: Parameters<typeof getSecret>[0],
  defaultVal: number,
  min: number,
  max: number,
): number {
  if (!hasSecret(key)) return defaultVal
  const raw = getSecret(key)
  if (!raw) return defaultVal
  const v = parseInt(raw, 10)
  if (isNaN(v) || v < min) return defaultVal
  return Math.min(v, max)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BeforeToolCallInfo {
  toolCallId: string
  name: string
  args: Record<string, unknown>
}

export interface AfterToolCallInfo {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  result: string
  isError: boolean
}

export interface RunAttemptParams {
  sessionKey: string
  userMessage: string
  abortSignal?: AbortSignal
  /** 注入自定义 provider（测试用） */
  provider?: LLMProvider
  /** 工具注册表（传入则启用 tool calling） */
  toolRegistry?: ToolRegistry
  /** 工作目录（工具执行的 cwd） */
  workspaceDir?: string
  /** 已加载的 Skills（注入到 system prompt） */
  skills?: import('../skills/types.js').Skill[]
  /** 用户通过 @ 指定的 Skill 名称（高优先级注入到 system prompt） */
  activeSkillName?: string
  /** 用户通过 # 指定的工具白名单（非空时只暴露这些工具给 LLM） */
  allowedTools?: string[]
  /** 回调：每个 delta 文本片段（最终回复阶段） */
  onDelta?: (chunk: string) => void
  /** 回调：工具调用开始 */
  onToolStart?: (info: { toolCallId: string; name: string; args: Record<string, unknown> }) => void
  /** 回调：工具执行中流式更新（bash stdout 等） */
  onToolUpdate?: (info: { toolCallId: string; content: string }) => void
  /** 回调：工具调用完成 */
  onToolResult?: (info: { toolCallId: string; name: string; content: string; isError: boolean }) => void
  /**
   * Hook（阶段 B）：工具执行前拦截。
   * 返回 { block: true, reason } 时跳过工具执行，LLM 收到 isError=true 的结果。
   * 抛出异常时记录 warn 并继续执行。
   */
  beforeToolCall?: (info: BeforeToolCallInfo) => Promise<{ block: true; reason: string } | undefined>
  /**
   * Hook（阶段 B）：工具执行后处理。
   * 返回 { result: newContent } 时替换写入 messages 的内容（onToolResult 仍用原始值）。
   * 抛出异常时记录 warn 并使用原始结果。
   */
  afterToolCall?: (info: AfterToolCallInfo) => Promise<{ result?: string } | undefined>
}

export interface RunAttemptResult {
  text: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  totalCny: number
  durationMs: number
  modelUsed: string
  costLine: string
  toolCallCount: number
}

// ─── 累积的完整 tool call ─────────────────────────────────────────────────────

interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runAttempt(params: RunAttemptParams): Promise<RunAttemptResult> {
  const { sessionKey, userMessage, abortSignal, onDelta, onToolStart, onToolUpdate, onToolResult } = params
  const startMs = Date.now()
  const runId = uuidv4()

  // 1. 获取/创建 session（从磁盘恢复历史）
  const session = await getOrCreate(sessionKey)

  // 2. 注入 abort 控制
  const abort = new AbortController()
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => abort.abort())
  }
  session.runningAbort = abort

  // 3. 智能模型路由（Phase 10）
  const route = routeModel(userMessage, params.provider, session.messages.length)
  const provider = route.provider
  const actualMessage = route.strippedMessage
  if (route.overridden) {
    console.log(`[runner] @model 覆盖，原始消息已剥离 @指令`)
  }

  // 4. 追加用户消息（使用剥离 @model 后的消息）
  session.messages.push({ role: 'user', content: actualMessage })

  // 4.5 Memory: 自动 Capture（检测“记住/remember”等关键词）
  autoCapture(actualMessage, sessionKey)

  // 5. Context Engine: 组装消息列表（system prompt + memory recall + history + compaction + trim）
  // 解析 @ Skill 指定
  const activeSkill = params.activeSkillName && params.skills
    ? params.skills.find(s => s.name === params.activeSkillName)
    : undefined

  const contextEngine = new DefaultContextEngine()
  const assembled = await contextEngine.assemble({
    sessionKey,
    provider,
    userMessage: actualMessage,
    workspaceDir: params.workspaceDir,
    skills: params.skills,
    activeSkill,
    abortSignal: abort.signal,
    onCompaction: (summary) => params.onDelta?.(`\n\n💭 ${summary}\n\n`),
  })
  const messages = assembled.messages

  // 6. 准备工具 schema（支持 # 工具白名单过滤）
  let toolSchemas: OpenAIToolSchema[] | undefined = params.toolRegistry?.getToolSchemas()
  if (toolSchemas && params.allowedTools && params.allowedTools.length > 0) {
    const allowed = new Set(params.allowedTools)
    toolSchemas = toolSchemas.filter(s => allowed.has(s.function.name))
    console.log(`[runner] # 工具过滤: ${params.allowedTools.join(',')} → ${toolSchemas.length} 个工具`)
  }
  const hasTools = toolSchemas && toolSchemas.length > 0
  console.log(`[runner] provider=${provider.providerId}/${provider.modelId}, toolSchemas=${toolSchemas?.length ?? 0}, hasTools=${hasTools}, recalled=${assembled.recalledMemories}, compacted=${assembled.wasCompacted}`)

  // 7. Tool Loop
  // 读取运行时配置（支持用户在设置页修改后立即生效）
  const maxLlmTurns  = getAgentConfigNumber('AGENT_MAX_LLM_TURNS',  50, 1, 500)
  const maxToolCalls = getAgentConfigNumber('AGENT_MAX_TOOL_CALLS', 50, 1, 500)

  let fullText = ''
  let totalToolCalls = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let loopCount = 0
  const loopDetector = new LoopDetector(maxToolCalls)

  // Stream Decorator 管道（Phase 9）
  const decorators = buildDecoratorPipeline(provider)

  try {
    toolLoop: while (loopCount < maxLlmTurns) {
      loopCount++

      // 检查 abort
      if (abort.signal.aborted) break

      // ── 兆底截断：防止 Compaction 失败后历史消息撞爆窗口 ──────
      trimMessages(messages, 400_000)

      // ── 调用 LLM ──────────────────────────────────────────────
      const accumulatedToolCalls: Map<number, AccumulatedToolCall> = new Map()
      let currentText = ''
      let finishReason: string | null = null

      const streamParams = {
        messages,
        abortSignal: abort.signal,
        ...(hasTools ? { tools: toolSchemas } : {}),
      }
      console.log(`[runner] streamChat: loop=${loopCount}, toolsInParams=${streamParams.tools?.length ?? 0}`)

      const rawStream = provider.streamChat(streamParams)
      for await (const delta of applyDecorators(rawStream, decorators)) {
        // 文本内容
        if (delta.content) {
          currentText += delta.content
          onDelta?.(delta.content)
        }

        // 累积 tool_calls（流式 delta 中分片到达）
        if (delta.toolCalls) {
          for (const tc of delta.toolCalls) {
            let acc = accumulatedToolCalls.get(tc.index)
            if (!acc) {
              acc = { id: tc.id ?? '', name: tc.name ?? '', arguments: '' }
              accumulatedToolCalls.set(tc.index, acc)
            }
            if (tc.id) acc.id = tc.id
            if (tc.name) acc.name = tc.name
            if (tc.arguments) acc.arguments += tc.arguments
          }
        }

        if (delta.finishReason) {
          finishReason = delta.finishReason
        }
      }

      // 估算本轮 token
      const roundInput = provider.estimateTokens(messages.map(m => String('content' in m ? m.content : '')).join('\n'))
      const roundOutput = provider.estimateTokens(currentText)
      totalInputTokens += roundInput
      totalOutputTokens += roundOutput

      // ── 判断：tool_calls 还是纯文本 ───────────────────────────
      const toolCalls = [...accumulatedToolCalls.values()].filter(tc => tc.name)

      if (toolCalls.length === 0 || finishReason === 'stop') {
        // 纯文本回复，结束 loop
        fullText = currentText
        break toolLoop
      }

      // ── 执行工具调用 ──────────────────────────────────────────
      // 先把 assistant 的 tool_calls 消息加入 messages
      messages.push({
        role: 'assistant',
        content: currentText || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      })

      const toolCtx: ToolContext = {
        workspaceDir: params.workspaceDir ?? process.cwd(),
        sessionKey: params.sessionKey,
        abortSignal: abort.signal,
        proxyUrl: getProxyUrl() ?? undefined,
        provider,
      }

      // ── 阶段 A：并发执行所有工具调用 ──────────────────────────
      // 每个工具独立封装为 async 函数，Promise.allSettled 并发启动，保序汇总
      interface ToolExecResult {
        tc: AccumulatedToolCall
        args: Record<string, unknown>
        resultContent: string
        resultForMessages: string   // afterToolCall hook 可能替换的版本
        isError: boolean
        durationMs: number
      }

      const executions = toolCalls.map((tc): Promise<ToolExecResult> =>
        (async (): Promise<ToolExecResult> => {
          // 解析参数
          let args: Record<string, unknown> = {}
          try {
            args = tc.arguments ? JSON.parse(tc.arguments) : {}
          } catch {
            args = { _raw: tc.arguments }
          }

          let resultContent: string
          let isError = false
          const t0 = Date.now()

          // ── 阶段 B：beforeToolCall hook ──────────────────────
          let blocked = false
          if (params.beforeToolCall) {
            try {
              const decision = await params.beforeToolCall({ toolCallId: tc.id, name: tc.name, args })
              if (decision?.block) {
                resultContent = decision.reason
                isError = true
                blocked = true
                console.log(`[runner] 🚫 beforeToolCall blocked "${tc.name}": ${decision.reason}`)
              }
            } catch (hookErr) {
              console.warn(`[runner] beforeToolCall hook error for "${tc.name}":`, hookErr)
            }
          }

          // 通知：工具开始（block 的工具也发通知，让 UI 知道有这次调用）
          onToolStart?.({ toolCallId: tc.id, name: tc.name, args })

          if (!blocked) {
            // 查找并执行工具
            const tool = params.toolRegistry?.resolve(tc.name)
            if (!tool) {
              resultContent = `Error: 未知工具 "${tc.name}"。可用工具: ${params.toolRegistry?.list().join(', ') ?? '无'}`
              isError = true
            } else {
              try {
                const toolOnUpdate = onToolUpdate
                  ? (partial: string) => onToolUpdate({ toolCallId: tc.id, content: partial })
                  : undefined
                const result = await tool.execute(args, toolCtx, toolOnUpdate)
                const truncated = truncateToolResult(result.content)
                resultContent = truncated.content
                isError = result.isError ?? false
              } catch (err) {
                resultContent = `Error executing ${tc.name}: ${(err as Error).message}\n${(err as Error).stack ?? ''}`
                isError = true
              }
            }
          }

          const durationMs = Date.now() - t0

          // 持久化日志（异步，不阻塞）
          logToolCall(tc.name, args, resultContent!, isError, durationMs).catch(() => {})

          // 通知：工具完成（使用原始结果）
          onToolResult?.({ toolCallId: tc.id, name: tc.name, content: resultContent!, isError })

          // ── 阶段 B：afterToolCall hook ───────────────────────
          let resultForMessages = resultContent!
          if (params.afterToolCall) {
            try {
              const post = await params.afterToolCall({
                toolCallId: tc.id, name: tc.name, args,
                result: resultContent!, isError,
              })
              if (post?.result !== undefined) {
                resultForMessages = post.result
              }
            } catch (hookErr) {
              console.warn(`[runner] afterToolCall hook error for "${tc.name}":`, hookErr)
            }
          }

          return { tc, args, resultContent: resultContent!, resultForMessages, isError, durationMs }
        })()
      )

      // 并发等待所有工具，rejected 视为 isError（不因单个工具失败丢弃其他结果）
      const settled = await Promise.allSettled(executions)

      // ── 汇总阶段：按原始顺序写入 messages + LoopDetector ─────
      let breakerTriggered = false
      for (const settledItem of settled) {
        let execResult: ToolExecResult
        if (settledItem.status === 'fulfilled') {
          execResult = settledItem.value
        } else {
          // Promise 本身 reject（极少见，通常是 async 函数外部逻辑错误）
          const tc = toolCalls[settled.indexOf(settledItem)]
          execResult = {
            tc,
            args: {},
            resultContent: `Error: 工具执行异常 — ${String(settledItem.reason)}`,
            resultForMessages: `Error: 工具执行异常 — ${String(settledItem.reason)}`,
            isError: true,
            durationMs: 0,
          }
        }

        const { tc, args, resultForMessages, isError } = execResult
        totalToolCalls++

        // 将工具结果注入消息列表（给下一轮 LLM）
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultForMessages,
        })

        // 提前持久化（覆盖写，幂等）
        await persist(session)

        // ── 循环检测（Phase 6）──────────────────────────────────
        const argsHash = computeArgsHash(tc.name, args)
        const resultHash = computeResultHash(resultForMessages)
        const verdict = loopDetector.check(tc.name, argsHash, resultHash)

        if (verdict.action === 'warn') {
          console.warn(`[runner] ⚠️ [${verdict.detector}] ${verdict.message}`)
        }

        if (verdict.action === 'terminate' && !breakerTriggered) {
          console.warn(`[runner] 🛑 [${verdict.detector}] ${verdict.message}`)
          // 并行模式下所有工具已执行完，无需补占位；直接注入用户提示让 LLM 总结
          messages.push({
            role: 'user',
            content: `⚠️ ${verdict.message} 请根据已有的工具结果直接给出最终回答，不要再调用任何工具。`,
          })
          breakerTriggered = true
          // 不 break——继续让其余工具结果也写入 messages（保持 tool_call / tool_result 配对完整）
        }
      }

      // 断路器触发后让 LLM 再说一轮总结
      if (breakerTriggered) {
        // 再调一次 LLM 让它给个总结，但不传 tools 了
        fullText = ''
        const summaryStream = provider.streamChat({ messages, abortSignal: abort.signal })
        for await (const delta of applyDecorators(summaryStream, decorators)) {
          if (delta.content) {
            fullText += delta.content
            onDelta?.(delta.content)
          }
        }
        break toolLoop
      }

      // 继续循环：带工具结果的消息再次调 LLM
    }
  } finally {
    session.runningAbort = null
  }

  totalToolCalls = loopDetector.count
  console.log(`[runner] toolLoop: ${loopCount} rounds, ${totalToolCalls} tool calls, text length: ${fullText.length}`)

  // 8. 计算总 token / 费用
  const totalTokens = totalInputTokens + totalOutputTokens
  const totalCny = calcCost(provider.modelId, totalInputTokens, totalOutputTokens)
  const durationMs = Date.now() - startMs

  // 9. 记录成本
  const entry = record({
    sessionKey,
    runId,
    timestamp: startMs,
    durationMs,
    provider: provider.providerId,
    model: provider.modelId,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens,
    totalCny,
  })

  const costLine = formatCostLine(entry)

  // 10. Context Engine: afterTurn（追加 assistant 回复 + costLine 持久化）
  await contextEngine.afterTurn({ sessionKey, assistantMessage: fullText, costLine })

  return {
    text: fullText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens,
    totalCny,
    durationMs,
    modelUsed: provider.modelId,
    costLine,
    toolCallCount: totalToolCalls,
  }
}

// ─── Memory: 自动 Capture（Phase 12）─────────────────────────────────────────

const CAPTURE_TRIGGERS = [
  /记住|记下|记得|别忘/,
  /remember|keep in mind|don'?t forget|note that/i,
  /我(喜欢|偏好|习惯|总是|从不|不喜欢)/,
  /i (like|prefer|hate|always|never|want)/i,
  /以后都?用|以后都?别/,
  /我的(名字|邮箱|手机|电话|地址|公司)/,
]

/**
 * 检测用户消息是否包含"记住"类触发词，自动存储到长期记忆。
 */
function autoCapture(message: string, sessionKey?: string): void {
  try {
    const text = message.trim()
    if (text.length < 5 || text.length > 500) return

    for (const pat of CAPTURE_TRIGGERS) {
      if (pat.test(text)) {
        memorySave(text, 'general', 6, sessionKey)
        console.log(`[memory] 自动 Capture: "${text.slice(0, 60)}..."`)
        return
      }
    }
  } catch (err) {
    console.warn('[memory] autoCapture 失败:', err)
  }
}
