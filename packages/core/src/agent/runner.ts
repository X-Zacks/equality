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
  audit?: { mutationType?: string; mutationConfidence?: string; risk?: string },
): Promise<void> {
  try {
    if (!_logDirReady) {
      await mkdir(LOG_DIR, { recursive: true })
      _logDirReady = true
    }
    const date = new Date()
    const filename = `tool-${date.toISOString().slice(0, 10)}.log`
    const ts = date.toISOString()
    const auditLine = audit
      ? `\n── AUDIT ──\nmutation=${audit.mutationType ?? '?'}/${audit.mutationConfidence ?? '?'}, risk=${audit.risk ?? '?'}`
      : ''
    const entry = [
      `\n${'═'.repeat(80)}`,
      `[${ts}] ${isError ? '❌' : '✅'} ${toolName} (${durationMs}ms)`,
      `── INPUT ──`,
      typeof args === 'string' ? args : JSON.stringify(args, null, 2),
      `── OUTPUT (${result.length} chars) ──`,
      result,
      auditLine,
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
import { truncateToolResult, calcMaxToolResultChars, LoopDetector, computeArgsHash, computeResultHash, cleanToolSchemas } from '../tools/index.js'
import { getProxyUrl } from '../config/proxy.js'
import { DefaultContextEngine, trimMessages } from '../context/index.js'
import type { ContextEngine } from '../context/index.js'
import { memorySave } from '../memory/index.js'
import { getSecret, hasSecret } from '../config/secrets.js'
import { resolveContextWindow } from '../providers/context-window.js'
import { createCacheTrace } from '../diagnostics/cache-trace.js'
import { resolveAgentIdFromSessionKey, resolveAgentConfig } from '../config/agent-scope.js'
import { globalHookRegistry } from '../hooks/index.js'

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
  /** 用户通过 @ 指定的 Skill 名称列表（高优先级注入到 system prompt） */
  activeSkillNames?: string[]
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
  /**
   * Steering 队列引用（阶段 D）。
   * 由 index.ts 创建并传入，每轮工具执行完后 shift() 取出消息注入到对话中。
   * 不需要持久化，是纯运行时状态。
   */
  steeringQueue?: string[]
  /**
   * FallbackProvider 模型切换回调（Phase E4）。
   * 当 FallbackProvider 从主 Provider 降级到备用时触发。
   */
  onModelSwitch?: import('../providers/fallback.js').OnModelSwitch
  /**
   * 交互式 UI 载荷回调（Phase F1）。
   * Agent 回复中检测到 :::interactive 块时触发。
   */
  onInteractive?: (payload: import('./interactive.js').InteractivePayload) => void
  /**
   * 自动 Capture 成功回调（T22）。
   * autoCapture 检测到触发词并保存成功后触发，用于 SSE 通知客户端展示 Toast。
   */
  onMemoryCaptured?: (info: { id: string; text: string; category: string }) => void
  /**
   * 可插拔上下文引擎（D4）。
   * 传入则在工具执行后调用 afterToolCall、Compaction 前调用 beforeCompaction。
   * 不传则跳过（no-op）——向后兼容。
   */
  contextEngine?: ContextEngine
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

import { isMutatingOperation, classifyMutation } from '../tools/mutation.js'

interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

function containsExecutionSuccessClaim(text: string): boolean {
  const patterns = [
    /(已|已经|现已|成功).{0,8}(修改|更新|写入|创建|删除|保存|重命名|执行)/,
    /我(已|已经|刚刚|成功).{0,12}(修改|更新|写入|创建|删除|保存|重命名|执行)/,
    /这次真正.{0,4}(修改|更新|写入|创建|删除)/,
    /I\s+(have|already|just)\s+(modified|updated|written|created|deleted|saved|executed)/i,
  ]
  return patterns.some(p => p.test(text))
}

function containsFileMutationClaim(text: string): boolean {
  const patterns = [
    /(文件|代码|脚本|配置|内容).{0,12}(已|已经|现已|成功).{0,8}(修改|更新|写入|创建|删除|保存|重命名)/,
    /(已|已经|现已|成功).{0,8}(修改|更新|写入|创建|删除|保存|重命名).{0,20}(文件|代码|脚本|配置)/,
    /(已更新|已修改|已写入).{0,40}(\.ts|\.tsx|\.js|\.jsx|\.json|\.md|\.py|\.rs|\.yaml|\.yml)/,
    /I\s+(have|already|just)\s+(modified|updated|written|created|deleted|saved).{0,40}(file|code|script|config)/i,
  ]
  return patterns.some(p => p.test(text))
}

function containsBashExecutionClaim(text: string): boolean {
  const patterns = [
    /(真正执行了|已执行|执行完成|运行完成|命令已执行|终端执行完成)/,
    /(执行结果|运行结果|抓取结果|数据库验证|验证结果|命令输出)/,
    /✅\s*(真正执行了|执行成功|已执行)/,
    /I\s+(have|already|just)\s+(executed|ran)\s+(the command|bash|shell)/i,
  ]
  return patterns.some(p => p.test(text))
}

function containsShellCommandTranscript(text: string): boolean {
  const normalized = text.replace(/\r\n/g, '\n')
  const commandLinePatterns = [
    /(^|\n)\s*(cd|chdir)\s+[A-Za-z]:\\[^\n]+/i,
    /(^|\n)\s*(node|npm|pnpm|yarn|python|python3|pip|git|cargo|rustc|powershell|cmd)\b[^\n]*/i,
    /```(?:bash|sh|shell|powershell|cmd)?[\s\S]*?(cd\s+[A-Za-z]:\\|node\s+|npm\s+|pnpm\s+|python\s+)[\s\S]*?```/i,
  ]
  return commandLinePatterns.some(p => p.test(normalized))
}

function containsToolExecutionIntent(text: string): boolean {
  const patterns = [
    /(调用|使用).{0,6}(bash|read_file|write_file|工具)/,
    /(让我|我将|我需要).{0,10}(用|调用).{0,6}(bash|工具)/,
    /(直接执行|开始执行|真正执行)/,
    /must\s+use\s+(bash|tools?)|call\s+(bash|tool)/i,
  ]
  return patterns.some(p => p.test(text))
}

function shouldForceToolRetry(text: string, hasTools: boolean, alreadyRetried: boolean): boolean {
  if (!hasTools || alreadyRetried) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  return (
    (containsBashExecutionClaim(trimmed) && containsShellCommandTranscript(trimmed)) ||
    containsToolExecutionIntent(trimmed)
  )
}

function guardUnsupportedSuccessClaims(text: string, executedToolNames: Set<string>): string {
  const trimmed = text.trim()
  if (!trimmed) return text

  const toolNames = [...executedToolNames]
  const hasMutatingTool = toolNames.some(name => isMutatingOperation(name))
  const hasBashTool = toolNames.includes('bash')

  if (toolNames.length === 0 && containsExecutionSuccessClaim(trimmed)) {
    return [
      '⚠️ 我还没有实际调用任何工具执行修改或命令。',
      '上面的内容只是计划或推测，并非真实执行结果。',
      '如果你要我真正修改，请继续让我使用工具操作。',
    ].join('\n')
  }

  if (!hasMutatingTool && containsFileMutationClaim(trimmed)) {
    return [
      '⚠️ 我本轮没有实际调用可写入的工具，因此并未真正修改文件。',
      `本轮实际使用的工具：${toolNames.join(', ') || '无'}。`,
      '上面的“已修改/已更新”描述不成立；如果需要我真正改动，请继续让我执行工具。',
    ].join('\n')
  }

  if (!hasBashTool && containsBashExecutionClaim(trimmed) && containsShellCommandTranscript(trimmed)) {
    return [
      '⚠️ 我本轮没有实际调用 bash 工具执行命令。',
      `本轮实际使用的工具：${toolNames.join(', ') || '无'}。`,
      '上面的命令片段和执行结果只是模型描述，不是真实终端输出。',
      '如果你要我真正运行这些命令，请继续让我调用 bash。',
    ].join('\n')
  }

  return text
}

// ─── 编译错误检测与自动重试（Phase A.1）─────────────────────────────────────

/**
 * 检测工具输出是否为编译/测试错误。
 * 仅对 bash 工具触发。
 */
function isCompileOrTestError(toolName: string, content: string): boolean {
  // 仅对 bash 工具的 isError 输出检测
  if (toolName !== 'bash') return false

  // TypeScript / JavaScript 编译错误（tsc、esbuild、swc 等）
  const tsPatterns = [
    /error\s+TS\d+:/,                     // tsc: error TS2345:
    /\.tsx?\(\d+,\d+\):\s*error/,          // src/foo.ts(10,5): error
    /SyntaxError: Unexpected token/i,     // Node.js 解析失败
    /Cannot find module '.*'/i,           // require / import 解析失败
    /Module not found/i,                  // webpack / vite
  ]

  // Python 编译期 / 导入错误（不包含运行时 TypeError 等）
  const pyPatterns = [
    /SyntaxError:/,                       // Python 语法错误
    /IndentationError:/,                  // Python 缩进错误
    /ModuleNotFoundError:/,               // import 找不到模块
    /ImportError:/,                       // import 失败
  ]

  // Rust 编译错误
  const rsPatterns = [
    /^error\[E\d+\]:/m,                   // error[E0308]:
    /error: could not compile/i,
  ]

  // Go 编译错误
  const goPatterns = [
    /^.*\.go:\d+:\d+:.*(?:undefined|cannot|expected)/m,
  ]

  // 测试框架失败（仅匹配明确的失败汇总行）
  const testPatterns = [
    /\d+ failing/i,                       // mocha / jest 汇总
    /FAIL\s+.*\.test\./i,                 // jest FAIL src/foo.test.ts
    /Tests:\s+\d+ failed/i,               // jest Tests: 2 failed
    /FAILED\s+.*\.rs/i,                   // cargo test FAILED
    /pytest.*\d+ failed/i,               // pytest 汇总
  ]

  const allPatterns = [...tsPatterns, ...pyPatterns, ...rsPatterns, ...goPatterns, ...testPatterns]
  return allPatterns.some(p => p.test(content))
}

/**
 * 从编译错误输出中提取错误行及上下文。
 * 返回精简错误摘要（最多 maxChars）。
 */
function extractCompileErrors(content: string, maxChars: number = 2000): string {
  const lines = content.split('\n')

  // 第一遍：标记匹配错误模式的行号
  const errorLineIndices = new Set<number>()
  const errorPattern = /^error|^fatal|\berror\[E\d|error\s+TS\d|SyntaxError|IndentationError|ModuleNotFoundError|ImportError|FAIL\s|Tests:.*failed|failing/i
  for (let i = 0; i < lines.length; i++) {
    if (errorPattern.test(lines[i])) {
      errorLineIndices.add(i)
    }
  }

  // 第二遍：展开上下文（前后各1行），用 Set 去重
  const selectedLines = new Set<number>()
  for (const idx of errorLineIndices) {
    if (idx > 0) selectedLines.add(idx - 1)
    selectedLines.add(idx)
    if (idx < lines.length - 1) selectedLines.add(idx + 1)
  }

  // 按行号排序后收集（保持原始顺序）
  const sortedIndices = [...selectedLines].sort((a, b) => a - b)
  const collected = sortedIndices.map(i => lines[i])

  // 若无错误行匹配，取末尾内容
  if (collected.length === 0) {
    const tailStart = Math.max(0, lines.length - 10)
    collected.push(...lines.slice(tailStart))
  }

  // 拼接并截断
  let summary = collected.join('\n')
  if (summary.length > maxChars) {
    summary = summary.slice(0, maxChars) + '\n... (截断)'
  }

  return summary
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
  const route = routeModel(userMessage, params.provider, session.messages.length, params.onModelSwitch)
  const provider = route.provider
  const actualMessage = route.strippedMessage
  if (route.overridden) {
    console.log(`[runner] @model 覆盖，原始消息已剥离 @指令`)
  }

  // 3.5a I.5-2: 动态解析 context window（替代 provider.getCapabilities() 硬编码）
  const contextWindowInfo = resolveContextWindow({
    modelId: provider.modelId,
    providerReported: provider.getCapabilities().contextWindow,
  })
  const resolvedContextWindowTokens = contextWindowInfo.tokens
  console.log(`[runner] I.5-2 contextWindow=${resolvedContextWindowTokens} (source=${contextWindowInfo.source})`)

  // 3.5b I.5-7: Agent 作用域配置解析（per-agent model/workspace/tools）
  const agentId = resolveAgentIdFromSessionKey(sessionKey)
  // 未来可从配置文件读取 EqualityConfig，当前先 log agent ID
  if (agentId !== 'default') {
    console.log(`[runner] I.5-7 agentId=${agentId}`)
  }

  // 3.5c I.5-8: Cache Trace（LLM 调用诊断追踪）
  const cacheTrace = createCacheTrace({
    sessionKey,
    provider: provider.providerId,
    modelId: provider.modelId,
  })
  if (cacheTrace) {
    cacheTrace.recordStage('session:loaded', {
      messageCount: session.messages.length,
      note: `runId=${runId}`,
    })
  }

  // 4. 追加用户消息（使用剥离 @model 后的消息）
  session.messages.push({ role: 'user', content: actualMessage })

  // 4.5 Memory: 自动 Capture（检测"记住/remember"等关键词）
  autoCapture(actualMessage, sessionKey, agentId, params.workspaceDir, params.onMemoryCaptured)

  // 5. Context Engine: 组装消息列表（system prompt + memory recall + history + compaction + trim）
  // 解析 @ Skill 指定（支持多个）
  const activeSkills = params.activeSkillNames?.length && params.skills
    ? params.activeSkillNames
        .map(name => params.skills!.find(s => s.name === name))
        .filter((s): s is import('../skills/types.js').Skill => s !== undefined)
    : undefined

  const contextEngine = new DefaultContextEngine()
  const assembled = await contextEngine.assemble({
    sessionKey,
    provider,
    userMessage: actualMessage,
    workspaceDir: params.workspaceDir,
    agentId,
    skills: params.skills,
    activeSkills,
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

  // ── Schema 清洗（Phase A.3）— 在循环外只执行一次 ─────────────
  // provider 和 toolSchemas 在整个 runAttempt 生命周期内不变，无需每轮重复深拷贝
  let cleanedToolSchemas = toolSchemas
  if (toolSchemas && toolSchemas.length > 0) {
    cleanedToolSchemas = cleanToolSchemas(toolSchemas, provider.providerId)
  }

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
  const executedToolNames = new Set<string>()
  let forcedToolRetryUsed = false
  let compileRetryUsed = false

  // O1.2: Budget awareness tracking
  const budgetState = {
    warned70Turns: false,
    warned90Turns: false,
    warned70Calls: false,
    warned90Calls: false,
  }

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
        ...(hasTools ? { tools: cleanedToolSchemas } : {}),
      }
      console.log(`[runner] streamChat: loop=${loopCount}, toolsInParams=${streamParams.tools?.length ?? 0}`)

      // J3: beforeLLMCall hook——异常不阻断主流程
      try {
        await globalHookRegistry.invoke('beforeLLMCall', {
          sessionKey,
          providerId: provider.providerId,
          modelId: provider.modelId,
          messageCount: messages.length,
          loopCount,
        })
      } catch (hookErr) {
        console.warn('[runner] beforeLLMCall hook error:', hookErr instanceof Error ? hookErr.message : hookErr)
      }

      // I.5-8: 记录 prompt:before 阶段
      cacheTrace?.recordStage('prompt:before', {
        messages: messages as unknown[],
        options: { tools: streamParams.tools?.length ?? 0, loop: loopCount },
      })

      const rawStream = provider.streamChat(streamParams)
      // ── LLM 流式读取（含网络错误自动重试 1 次）──────────────
      let streamRetried = false
      const consumeStream = async () => {
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
      }

      try {
        await consumeStream()
      } catch (streamErr) {
        // 判断是否为可重试的网络错误
        const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr)
        const errCode = (streamErr as any)?.code ?? ''
        const isNetworkError =
          errCode === 'ECONNRESET' || errCode === 'ECONNREFUSED' || errCode === 'ETIMEDOUT' ||
          errCode === 'UND_ERR_CONNECT_TIMEOUT' ||
          errMsg.includes('Connection error') || errMsg.includes('fetch failed') ||
          errMsg.includes('network') || errMsg.includes('ECONNRESET') ||
          errMsg.includes('socket hang up') || errMsg.includes('timed out')

        if (isNetworkError && !streamRetried && !abort.signal.aborted) {
          streamRetried = true
          console.warn(`[runner] ⚠️ LLM 流式读取网络错误，自动重试: ${errMsg}`)
          onDelta?.('\n\n🔄 网络连接中断，正在自动重试…\n\n')

          // 重置本轮累积状态
          currentText = ''
          accumulatedToolCalls.clear()
          finishReason = null

          // 等待 2 秒后重试
          await new Promise(r => setTimeout(r, 2000))
          if (abort.signal.aborted) throw streamErr

          const retryStream = provider.streamChat(streamParams)
          for await (const delta of applyDecorators(retryStream, decorators)) {
            if (delta.content) {
              currentText += delta.content
              onDelta?.(delta.content)
            }
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
            if (delta.finishReason) finishReason = delta.finishReason
          }
        } else {
          throw streamErr
        }
      }

      // 估算本轮 token
      const roundInput = provider.estimateTokens(messages.map(m => String('content' in m ? m.content : '')).join('\n'))
      const roundOutput = provider.estimateTokens(currentText)
      totalInputTokens += roundInput
      totalOutputTokens += roundOutput

      // J3: afterLLMCall hook——异常不阻断主流程
      try {
        await globalHookRegistry.invoke('afterLLMCall', {
          sessionKey,
          providerId: provider.providerId,
          modelId: provider.modelId,
          inputTokens: roundInput,
          outputTokens: roundOutput,
          toolCallCount: accumulatedToolCalls.size,
          loopCount,
        })
      } catch (hookErr) {
        console.warn('[runner] afterLLMCall hook error:', hookErr instanceof Error ? hookErr.message : hookErr)
      }

      // I.5-8: 记录 stream:context 阶段
      cacheTrace?.recordStage('stream:context', {
        note: `loop=${loopCount}, inputTokens=${roundInput}, outputTokens=${roundOutput}, toolCalls=${accumulatedToolCalls.size}`,
      })

      // ── 判断：tool_calls 还是纯文本 ───────────────────────────
      const toolCalls = [...accumulatedToolCalls.values()].filter(tc => tc.name)

      if (toolCalls.length === 0 || finishReason === 'stop') {
        if (toolCalls.length === 0 && shouldForceToolRetry(currentText, !!hasTools, forcedToolRetryUsed)) {
          forcedToolRetryUsed = true
          console.warn('[runner] ⚠️ 检测到模型未调用工具却输出伪执行文本，自动追加一次纠偏重试')
          onDelta?.('\n\n⚠️ 检测到模型尚未真正调用工具，正在强制改为工具执行…\n\n')
          messages.push({ role: 'assistant', content: currentText || null })
          messages.push({
            role: 'user',
            content: '你还没有实际调用任何工具。如果需要执行命令，必须调用 bash；如果需要读写文件，必须调用对应工具。不要再描述计划，直接执行。',
          })
          continue toolLoop
        }

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
        agentId,
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

          // J3: globalHookRegistry.beforeToolCall（与 params hook 共存，可叠加拦截）
          if (!blocked) {
            try {
              const hookResult = await globalHookRegistry.invoke('beforeToolCall', {
                toolName: tc.name,
                args,
                sessionKey,
              })
              if (hookResult.blocked) {
                resultContent = hookResult.reason ?? 'Blocked by hook'
                isError = true
                blocked = true
                console.log(`[runner] 🚫 globalHook beforeToolCall blocked "${tc.name}": ${hookResult.reason}`)
              }
            } catch (hookErr) {
              console.warn(`[runner] globalHook beforeToolCall error for "${tc.name}":`, hookErr)
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
                const maxResultChars = calcMaxToolResultChars(resolvedContextWindowTokens)
                const truncated = truncateToolResult(result.content, maxResultChars)
                resultContent = truncated.content
                isError = result.isError ?? false
              } catch (err) {
                resultContent = `Error executing ${tc.name}: ${(err as Error).message}\n${(err as Error).stack ?? ''}`
                isError = true
              }
            }
          }

          const durationMs = Date.now() - t0

          // C1 变异分类审计（Phase D1：写入日志，不阻塞执行）
          const mutation = classifyMutation(tc.name, args)
          logToolCall(tc.name, args, resultContent!, isError, durationMs, {
            mutationType: mutation.type,
            mutationConfidence: mutation.confidence,
            risk: mutation.type === 'write' ? 'high' : 'low',
          }).catch(() => {})

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

          // J3: globalHookRegistry.afterToolCall（通知型，不替换结果）
          try {
            await globalHookRegistry.invoke('afterToolCall', {
              toolName: tc.name,
              args,
              result: resultForMessages,
              isError,
              sessionKey,
              durationMs,
            })
          } catch (hookErr) {
            console.warn(`[runner] globalHook afterToolCall error for "${tc.name}":`, hookErr)
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
        executedToolNames.add(tc.name)

        // 将工具结果注入消息列表（给下一轮 LLM）
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultForMessages,
        })

        // ── O1.2: Budget awareness — 追加预算警告到最近 tool result ──
        {
          const lastToolMsg = messages[messages.length - 1]
          if (lastToolMsg.role === 'tool' && typeof lastToolMsg.content === 'string') {
            const turnPct = loopCount / maxLlmTurns
            const callPct = totalToolCalls / maxToolCalls

            let budgetWarning = ''
            if (turnPct >= 0.9 && !budgetState.warned90Turns) {
              budgetState.warned90Turns = true
              budgetWarning += `\n\n🚨 BUDGET CRITICAL: 90% of iteration budget used (${loopCount}/${maxLlmTurns} turns). Summarize and finish NOW.`
            } else if (turnPct >= 0.7 && !budgetState.warned70Turns) {
              budgetState.warned70Turns = true
              budgetWarning += `\n\n⚠️ BUDGET WARNING: 70% of iteration budget used (${loopCount}/${maxLlmTurns} turns). Start wrapping up.`
            }
            if (callPct >= 0.9 && !budgetState.warned90Calls) {
              budgetState.warned90Calls = true
              budgetWarning += `\n\n🚨 BUDGET CRITICAL: 90% of tool call budget used (${totalToolCalls}/${maxToolCalls} calls). Summarize and finish NOW.`
            } else if (callPct >= 0.7 && !budgetState.warned70Calls) {
              budgetState.warned70Calls = true
              budgetWarning += `\n\n⚠️ BUDGET WARNING: 70% of tool call budget used (${totalToolCalls}/${maxToolCalls} calls). Start wrapping up.`
            }
            if (budgetWarning) {
              ;(lastToolMsg as { content: string }).content += budgetWarning
              console.log(`[runner] 💰 Budget warning injected at turn=${loopCount} calls=${totalToolCalls}`)
            }
          }
        }

        // ── D4: contextEngine.afterToolCall ─────────────────────
        if (params.contextEngine?.afterToolCall) {
          try {
            const mutation = classifyMutation(tc.name, args)
            await params.contextEngine.afterToolCall({
              sessionKey: params.sessionKey,
              toolName: tc.name,
              args,
              result: resultForMessages,
              isError,
              mutationType: mutation.type,
              risk: mutation.type === 'write' ? 'high' : mutation.type === 'exec' ? 'medium' : 'low',
            })
          } catch (ceErr) {
            console.warn(`[runner] contextEngine.afterToolCall error for "${tc.name}":`, ceErr)
          }
        }

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

      // 断路器触发后让 LLM 再说一轮总结（优先于编译重试——安全优先）
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

      // ── 编译错误检测与自动重试（Phase A.1）──────────────────
      // 在断路器检查之后执行（安全保护优先于自动修复）
      if (!compileRetryUsed) {
        for (const settledItem of settled) {
          if (settledItem.status !== 'fulfilled') continue
          const { tc, resultContent, isError } = settledItem.value

          if (isError && isCompileOrTestError(tc.name, resultContent)) {
            compileRetryUsed = true
            const errorSummary = extractCompileErrors(resultContent, 2000)
            console.warn(`[runner] 🔧 [编译重试] ${tc.name} 输出包含编译/测试错误，注入修复提示`)
            onDelta?.('\n\n🔧 检测到编译/测试错误，正在自动重试…\n\n')

            messages.push({
              role: 'user',
              content: `⚠️ 上面的工具执行报告中包含编译/测试错误。\n\n${errorSummary}\n\n请分析这个错误并修复代码，然后重新执行。`,
            })
            continue toolLoop
          }
        }
      }

      // ── 阶段 D：Steering 消息注入 ────────────────────────────
      // 在当前轮工具全部执行完、下一次 LLM 调用前检查队列。
      // shift() 每次只取一条：让 LLM 先响应后再消费下一条（保证有序）。
      if (params.steeringQueue && params.steeringQueue.length > 0) {
        const steeredMsg = params.steeringQueue.shift()!
        console.log(`[runner] 🎯 Steering 注入: "${steeredMsg.slice(0, 60)}"`)
        messages.push({ role: 'user', content: `[用户中途调整] ${steeredMsg}` })
        onDelta?.(`\n\n📍 _用户调整了方向：${steeredMsg}_\n\n`)
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

  const guardedText = guardUnsupportedSuccessClaims(fullText, executedToolNames)
  if (guardedText !== fullText) {
    console.warn(`[runner] ⚠️ 命中执行证据 Guard: tools=${[...executedToolNames].join(',') || 'none'}`)
    fullText = guardedText
  }

  // 9.5 Interactive Payload 检测（Phase F1）
  if (params.onInteractive) {
    const { parseInteractiveBlocks } = await import('./interactive.js')
    const { cleaned, payloads } = parseInteractiveBlocks(fullText)
    if (payloads.length > 0) {
      fullText = cleaned
      for (const payload of payloads) {
        params.onInteractive(payload)
      }
    }
  }

  // 10. Context Engine: afterTurn（追加 assistant 回复 + costLine 持久化）
  await contextEngine.afterTurn({ sessionKey, assistantMessage: fullText, costLine })

  // 10.5 I.5-8: 记录 session:after 阶段（最终统计）
  cacheTrace?.recordStage('session:after', {
    note: `totalInputTokens=${totalInputTokens}, totalOutputTokens=${totalOutputTokens}, toolCallCount=${totalToolCalls}, durationMs=${durationMs}, model=${provider.modelId}`,
  })

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
 * M1: 传入 agentId + workspaceDir + source='auto-capture'
 * M3/T36: 检查 MEMORY_AUTO_CAPTURE 开关（'off' 时跳过）
 * T22: 成功时调用 onCaptured 回调，通知客户端显示 Toast
 */
function autoCapture(
  message: string,
  sessionKey?: string,
  agentId?: string,
  workspaceDir?: string,
  onCaptured?: (info: { id: string; text: string; category: string }) => void,
): void {
  try {
    // M3/T36: 检查自动记忆开关
    if (hasSecret('MEMORY_AUTO_CAPTURE') && getSecret('MEMORY_AUTO_CAPTURE') === 'off') {
      return
    }

    const text = message.trim()
    if (text.length < 5 || text.length > 500) return

    for (const pat of CAPTURE_TRIGGERS) {
      if (pat.test(text)) {
        const result = memorySave(text, {
          category: 'general',
          importance: 6,
          sessionKey,
          agentId: agentId ?? 'default',
          workspaceDir,
          source: 'auto-capture',
        })
        // 去重或安全拦截时静默跳过
        if ('blocked' in result || 'duplicate' in result) {
          console.log(`[memory] autoCapture 跳过: ${('blocked' in result) ? '安全拦截' : '去重'}`)
          return
        }
        console.log(`[memory] 自动 Capture: "${text.slice(0, 60)}..." (agent=${agentId ?? 'default'})`)
        // T22: 通知客户端
        onCaptured?.({ id: result.id, text: text.slice(0, 100), category: 'general' })
        return
      }
    }
  } catch (err) {
    console.warn('[memory] autoCapture 失败:', err)
  }
}
