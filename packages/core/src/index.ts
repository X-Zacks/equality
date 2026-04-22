import Fastify from 'fastify'
import cors from '@fastify/cors'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

import { DESKTOP_SESSION_KEY } from './session/key.js'
import { reap, getOrCreate, get } from './session/store.js'
import { SessionQueue } from './session/queue.js'
import { runAttempt } from './agent/runner.js'
import { persist, listSessions, deleteSession as deleteSessionFromDisk } from './session/persist.js'
import { initSecrets, setSecret, getSecret, listSecrets, hasSecret } from './config/secrets.js'
import type { SecretKey } from './config/secrets.js'
import { initProxy, setProxyUrl } from './config/proxy.js'
import { dailySummary, sessionCostSummary, allSessionsCostSummary, globalCostSummary } from './cost/ledger.js'
import { allQuotaStatuses, setQuotaConfig, deleteQuotaConfig, listQuotaConfigs, type QuotaConfig } from './cost/request-quota.js'
import { startDeviceFlow, pollForToken, clearCopilotAuth, isCopilotLoggedIn, getPollingInterval } from './providers/copilot-auth.js'
import { COPILOT_MODELS, fetchCopilotModels } from './providers/copilot.js'
import { ToolRegistry, builtinTools, resolvePolicyForTool, classifyMutation, McpClientManager, parseMcpServersConfig, setSubagentManagerForSpawn, setSubagentManagerForList, setSubagentManagerForSteer, setSubagentManagerForKill } from './tools/index.js'
import { ensureWorkspaceBootstrap } from './agent/workspace-bootstrap.js'
import type { PolicyContext } from './tools/index.js'
import type { BeforeToolCallInfo } from './agent/runner.js'
import { SubagentManager } from './agent/subagent-manager.js'
import { DefaultContextEngine } from './context/index.js'
import { closeSessionBrowser } from './tools/builtins/browser.js'
import {
  backfillEmbeddings,
  memorySave, memoryDelete, memoryGetById, memoryUpdate,
  memoryListPaged, memoryStats, scanMemoryThreats, checkMemoryDuplicate,
  memoryGC, memoryExport, memoryImport,
} from './memory/index.js'
import type { MemorySaveOptions, MemoryListPagedOptions } from './memory/index.js'
import { SkillsWatcher } from './skills/index.js'
import { fetchGallery, installSkill, uninstallSkill, scanSkillContent, TRUSTED_REPOS } from './skills/gallery.js'
import { buildSkillStatus } from './skills/status.js'
import { scanSkillDirNoCache } from './skills/scanner.js'
import { listProviders, getDefaultProvider, getProviderById } from './providers/index.js'
import { getStorageMode } from './config/secrets.js'
import { generateTitle } from './session/title-gen.js'
import { CronScheduler } from './cron/index.js'
import { setCronScheduler } from './tools/builtins/cron.js'
import { TaskRegistry, JsonTaskStore, SqliteTaskStore, TERMINAL_STATES } from './tasks/index.js'
import { scheduleOrphanRecovery } from './tasks/orphan-recovery.js'
import type { TaskRuntime } from './tasks/index.js'
import { listCrews, getCrewById, createCrew, updateCrew, deleteCrew } from './crew/index.js'
import type { CrewCreateInput, CrewUpdateInput } from './crew/index.js'
import { generateBriefing } from './crew/briefing.js'
import { recommendCrew } from './crew/recommender.js'
import { getGlobalRetriever } from './skills/retriever.js'

const PORT = Number(process.env.EQUALITY_PORT ?? 18790)
const HOST = 'localhost'
const VERSION = '0.2.1'

// 初始化 secrets（从环境变量读取）
initSecrets()

// G9: 结构化日志（替代散落的 console.log）— 尽早初始化，后续所有模块可用
import { createLogger } from './diagnostics/logger.js'
const log = createLogger('gateway')

// G4: 配置验证（warn-only，不阻断启动）
import { validateConfig } from './config/validate.js'
import { EQUALITY_CONFIG_SCHEMA } from './config/schema.js'
{
  // 从 secrets cache 构造 config 对象（只取 schema 中定义的 key）
  const raw: Record<string, unknown> = {}
  for (const key of Object.keys(EQUALITY_CONFIG_SCHEMA)) {
    try {
      // schema key 与 secrets key 可能不完全一致，安全尝试
      if (hasSecret(key as any)) raw[key] = getSecret(key as any)
    } catch { /* ignore */ }
  }
  const result = validateConfig(raw, EQUALITY_CONFIG_SCHEMA)
  if (result.errors.length > 0) {
    for (const e of result.errors) log.warn(`[config] ⚠️ ${e.key}: ${e.message}`)
  }
  if (result.warnings.length > 0) {
    for (const w of result.warnings) log.warn(`[config] 💡 ${w.key}: ${w.message}`)
  }
}

// 用户工作目录：优先读 WORKSPACE_DIR，否则 fallback 到 ~/Equality/workspace
function getWorkspaceDir(): string {
  if (hasSecret('WORKSPACE_DIR')) {
    const dir = getSecret('WORKSPACE_DIR').trim()
    if (dir) {
      try { fs.mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
      return dir
    }
  }
  const defaultDir = path.join(os.homedir(), 'Equality', 'workspace')
  try { fs.mkdirSync(defaultDir, { recursive: true }) } catch { /* ignore */ }
  return defaultDir
}

// ─── D1: 安全管道集成（Phase D.1）────────────────────────────────────────────

/**
 * 构建策略上下文（D1 阶段返回空 = 全部放行，后续从 settings 读取）
 */
function buildPolicyContext(): PolicyContext {
  // TODO D1+: 从 settings.json 读取用户配置的 deny/allow 规则
  return {}
}

/**
 * 工具执行前拦截回调：C3 策略检查 + C1 变异审计
 *
 * 接入 runner.ts 的 beforeToolCall hook（Phase B 设计），
 * 让 Phase C 的安全模块从"库函数"变为"运行时保护"。
 */
async function securityBeforeToolCall(info: BeforeToolCallInfo): Promise<{ block: true; reason: string } | undefined> {
  const { name, args } = info

  // 1. C3 策略管道检查
  const decision = resolvePolicyForTool(name, buildPolicyContext())
  if (!decision.allowed) {
    return { block: true, reason: `策略拒绝: ${decision.decidedBy}` }
  }

  // 2. C1 变异分类（审计日志，不阻塞执行）
  const mutation = classifyMutation(name, args)
  log.info(`[security] ${name}: mutation=${mutation.type}/${mutation.confidence}, risk=${decision.risk}, decidedBy=${decision.decidedBy}`)

  return undefined // 允许执行
}

// 初始化代理（从 settings.json 或环境变量读取）
initProxy(hasSecret('HTTPS_PROXY') ? getSecret('HTTPS_PROXY') : undefined)

// G5: Web Search Registry — 注册搜索 providers
import { WebSearchRegistry } from './search/registry.js'
import { BraveSearchProvider } from './search/brave-provider.js'
import { DuckDuckGoSearchProvider } from './search/ddg-provider.js'
import { TavilySearchProvider } from './search/tavily-provider.js'

const webSearchRegistry = new WebSearchRegistry()
const proxyUrl = hasSecret('HTTPS_PROXY') ? getSecret('HTTPS_PROXY') : undefined
webSearchRegistry.register(new BraveSearchProvider({ proxyUrl }))
webSearchRegistry.register(new TavilySearchProvider())
webSearchRegistry.register(new DuckDuckGoSearchProvider({ proxyUrl }))

// G5: 注入 registry 到 web_search 工具
import { setWebSearchRegistry } from './tools/builtins/web-search.js'
setWebSearchRegistry(webSearchRegistry)

// 初始化工具注册表
const toolRegistry = new ToolRegistry()
for (const tool of builtinTools) {
  toolRegistry.register(tool)
}
log.info(`已注册 ${toolRegistry.size} 个工具: ${toolRegistry.list().join(', ')}`)

// ── MCP 客户端初始化（Phase D.2）───────────────────────────────────────────
const mcpManager = new McpClientManager(toolRegistry)
;(async () => {
  try {
    if (hasSecret('MCP_SERVERS')) {
      const json = getSecret('MCP_SERVERS')
      if (json.trim()) {
        const configs = parseMcpServersConfig(json)
        if (configs.length > 0) {
          log.info(`MCP: 发现 ${configs.length} 个服务器配置，正在连接...`)
          await mcpManager.start(configs)
          const status = mcpManager.getStatus()
          const readyCount = status.filter(s => s.status === 'ready').length
          log.info(`MCP: ${readyCount}/${configs.length} 个服务器已就绪`)
        }
      }
    }
  } catch (err) {
    log.warn(`MCP 初始化失败（不影响启动）: ${(err as Error).message}`)
  }
})()

// ─── G1: 确保工作区引导文件（首次运行时种下模板）────────────────────────────
try {
  const { seeded, isNewWorkspace } = await ensureWorkspaceBootstrap(getWorkspaceDir())
  if (isNewWorkspace) {
    log.info('🚀 全新工作区，已种下引导模板（含 BOOTSTRAP.md 首次引导脚本）')
  } else if (seeded.length > 0) {
    log.info(`已补充缺失的引导文件: ${seeded.join(', ')}`)
  }
} catch (err) {
  log.warn(`引导文件初始化失败（不影响启动）: ${(err as Error).message}`)
}

// 初始化 Skills 热加载
const skillsWatcher = new SkillsWatcher({
  workspaceDir: getWorkspaceDir(),
  onChange: (skills, event) => {
    log.info(`Skills 已重载: ${skills.length} 个 (v=${event.version}, reason=${event.reason})`)
    // 重建 Skill Retriever 索引
    getGlobalRetriever().rebuild(skills.map(e => e.skill))
  },
})
const initialSkills = await skillsWatcher.start()
log.info(`已加载 ${initialSkills.length} 个 Skills: ${initialSkills.map(e => e.skill.name).join(', ')}`)

// 初始化 Skill Retriever 索引（Phase 3: skill_search）
getGlobalRetriever().rebuild(initialSkills.map(e => e.skill))

// ─── 初始化 TaskRegistry（Phase E4.1 → I.5-3: SQLite 优先，fallback JSON）──
let taskStore: import('./tasks/index.js').TaskStore
try {
  taskStore = new SqliteTaskStore()
  log.info('TaskStore: SQLite (node:sqlite)')
} catch (e) {
  log.warn(`SqliteTaskStore 不可用，回退到 JsonTaskStore: ${(e as Error).message}`)
  taskStore = new JsonTaskStore()
}
const taskRegistry = new TaskRegistry({
  store: taskStore,
  flushDebounceMs: 500,
})
const restoredTaskCount = await taskRegistry.restore()
log.info(`TaskRegistry 已恢复 ${restoredTaskCount} 个任务`)

// ─── 初始化 SubagentManager（Phase E4.3）────────────────────────────────────
const subagentManager = new SubagentManager({
  taskRegistry,
  runAttempt,
  defaults: {
    workspaceDir: getWorkspaceDir(),
    toolRegistry,
    skills: skillsWatcher.getSkills().map(e => e.skill),
    beforeToolCall: securityBeforeToolCall,
    contextEngine: new DefaultContextEngine(),
  },
})
setSubagentManagerForSpawn(subagentManager)
setSubagentManagerForList(subagentManager)
setSubagentManagerForSteer(subagentManager)
setSubagentManagerForKill(subagentManager)
log.info('SubagentManager 已初始化')

// G7: Links beforeLLMCall hook — 检测用户消息中的 URL 并记录
import { globalHookRegistry } from './hooks/index.js'
import { detectLinks } from './links/detect.js'
import { fetchAndSummarize } from './links/understand.js'
import { get as getSession } from './session/store.js'

globalHookRegistry.register('beforeLLMCall', async (payload) => {
  try {
    const session = getSession(payload.sessionKey)
    if (!session) return
    // 只检查最后一条 user message
    const lastUser = [...session.messages].reverse().find(m => m.role === 'user')
    if (!lastUser || typeof lastUser.content !== 'string') return
    const links = detectLinks(lastUser.content)
    if (links.length === 0) return
    for (const link of links) {
      const result = await fetchAndSummarize(link.url)
      if (result && !result.blocked) {
        log.info(`[links] 预抓取: ${link.url} (${result.charCount} chars)`)
      }
    }
  } catch {
    // hook 失败不影响主流程
  }
})

// ─── 孤儿恢复调度（Phase H1, T5）────────────────────────────────────────────
scheduleOrphanRecovery({
  taskRegistry,
  spawnFn: async (task) => {
    try {
      const result = await subagentManager.spawn(
        task.parentSessionKey ?? DESKTOP_SESSION_KEY,
        { prompt: `[恢复任务] ${task.title ?? '未命名任务'}`, goal: task.title },
      )
      return result.success
    } catch {
      return false
    }
  },
})

// ─── 初始化 CronScheduler（Phase 4）────────────────────────────────────────
const sseClients = new Set<import('node:http').ServerResponse>()

function broadcastNotification(title: string, body: string) {
  const data = JSON.stringify({ type: 'notification', title, body })
  for (const client of sseClients) {
    try { client.write(`data: ${data}\n\n`) } catch { sseClients.delete(client) }
  }
  // 同时输出到控制台
  log.info(`[CronScheduler] 🔔 ${title}: ${body}`)
}

// ─── TaskEventBus → SSE 广播（Phase E4.1）──────────────────────────────────
taskRegistry.events.on((event) => {
  const data = JSON.stringify({
    type: 'task_event',
    taskId: event.taskId,
    eventType: event.type,
    state: event.state,
    runtime: event.runtime,
    timestamp: event.timestamp,
    detail: event.detail,
    parentSessionKey: event.parentSessionKey,
  })
  for (const client of sseClients) {
    try { client.write(`data: ${data}\n\n`) } catch { sseClients.delete(client) }
  }
})

// ─── Session 并发队列（Phase 11）────────────────────────────────────────

const sessionQueue = new SessionQueue()

const cronScheduler = new CronScheduler({
  notifier: broadcastNotification,
  runAgentTurn: async (sessionKey, userMessage) => {
    // E4.1: cron 任务注册到 TaskRegistry（失败不影响执行）
    let taskId: string | undefined
    try {
      const task = taskRegistry.register({
        runtime: 'cron',
        title: `cron: ${sessionKey}`,
        sessionKey,
      })
      taskId = task.id
      taskRegistry.transition(task.id, 'running')
    } catch (e) {
      log.warn(`[cron] TaskRegistry 注册失败（不影响任务执行）: ${e}`)
    }

    try {
      const result = await sessionQueue.enqueue(sessionKey, () => runAttempt({
        sessionKey,
        userMessage,
        toolRegistry,
        workspaceDir: getWorkspaceDir(),
        skills: skillsWatcher.getSkills().map(e => e.skill),
        beforeToolCall: securityBeforeToolCall,
        contextEngine: new DefaultContextEngine(),
      }))
      if (taskId) {
        try { taskRegistry.transition(taskId, 'succeeded', result.text.slice(0, 200)) } catch { /* ignore */ }
      }
      return result.text.slice(0, 500)
    } catch (err) {
      if (taskId) {
        try {
          const msg = err instanceof Error ? err.message : String(err)
          const isAbort = err instanceof Error && err.name === 'AbortError'
          taskRegistry.transition(taskId, isAbort ? 'cancelled' : 'failed', msg)
        } catch { /* ignore */ }
      }
      throw err
    }
  },
})
setCronScheduler(cronScheduler)
await cronScheduler.start()

const app = Fastify({ logger: { level: 'info' } })
await app.register(cors, {
  origin: (origin, cb) => {
    // 无 Origin 头：本机 curl / Tauri IPC 直接调用
    if (!origin || origin === 'null') return cb(null, true)
    // Tauri WebView（Windows: https://tauri.localhost，macOS: tauri://localhost）
    if (origin === 'https://tauri.localhost' || origin === 'tauri://localhost') return cb(null, true)
    // 本机 localhost / 127.0.0.1（Vite dev server、集成测试等），本机请求可信
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return cb(null, true)
    }
    // 其余（外部网页）一律拒绝
    cb(Object.assign(new Error('CORS: origin not allowed'), { statusCode: 403 }), false)
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type'],
  credentials: false,
})

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, reply) => {
  let providerInfo = 'unknown'
  try {
    const p = getDefaultProvider()
    providerInfo = `${p.providerId}/${p.modelId}`
  } catch { /* ignore */ }
  return reply.send({ status: 'ok', version: VERSION, provider: providerInfo })
})

// ─── SSE Events（Phase 4: 通知推送）─────────────────────────────────────────
app.get('/events', async (req, reply) => {
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  reply.raw.flushHeaders()
  sseClients.add(reply.raw)
  reply.raw.on('close', () => sseClients.delete(reply.raw))
  // 不 reply.send()，保持连接
})

// ─── Cron API（Phase 4）──────────────────────────────────────────────────────
app.get('/cron/jobs', async (_req, reply) => {
  return reply.send(cronScheduler.listJobs())
})

app.delete<{ Params: { id: string } }>('/cron/jobs/:id', async (req, reply) => {
  const ok = cronScheduler.removeJob(req.params.id)
  return reply.send({ ok })
})

// 手动触发 job 或测试通知
app.post<{ Params: { id: string } }>('/cron/jobs/:id/run', async (req, reply) => {
  const result = await cronScheduler.runJobNow(req.params.id)
  return reply.send({ ok: !!result, result })
})

app.post('/test/notify', async (req, reply) => {
  const { title, body } = req.body as { title?: string; body?: string }
  broadcastNotification(title ?? 'Equality 测试', body ?? '这是一条测试通知')
  return reply.send({ ok: true })
})

// ─── Tasks API（Phase E4.1）───────────────────────────────────────────────────
app.get('/tasks', async (req, reply) => {
  const { runtime } = req.query as { runtime?: string }
  const filter = runtime ? { runtime: runtime as TaskRuntime } : undefined
  return reply.send(taskRegistry.list(filter))
})

app.get<{ Params: { taskId: string } }>('/tasks/:taskId', async (req, reply) => {
  const task = taskRegistry.get(req.params.taskId)
  if (!task) return reply.status(404).send({ error: 'task not found' })
  return reply.send(task)
})

app.post<{ Params: { taskId: string }; Body: { message?: string } }>('/tasks/:taskId/steer', async (req, reply) => {
  const { message } = req.body ?? {}
  if (!message?.trim()) return reply.status(400).send({ ok: false, reason: 'message required' })
  const task = taskRegistry.get(req.params.taskId)
  if (!task) return reply.status(404).send({ ok: false, reason: 'task not found' })
  if (TERMINAL_STATES.has(task.state)) {
    return reply.status(409).send({ ok: false, reason: `task is already ${task.state}` })
  }
  taskRegistry.steer(req.params.taskId, message.trim())
  return reply.send({ ok: true })
})

app.delete<{ Params: { taskId: string } }>('/tasks/:taskId', async (req, reply) => {
  try {
    const task = taskRegistry.cancel(req.params.taskId)
    return reply.send({ ok: true, state: task.state })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(400).send({ ok: false, reason: msg })
  }
})

// ─── Phase Q: Chat Commands (/ 指令系统) ─────────────────────────────────────
import { ChatCommandRegistry } from './commands/registry.js'
import { registerBuiltins } from './commands/builtins/index.js'
import { isChatCommand, parseChatCommand } from './commands/parser.js'
import type { ChatCommandContext } from './commands/types.js'

const chatCommandRegistry = new ChatCommandRegistry()
registerBuiltins(chatCommandRegistry)
log.info(`已注册 ${chatCommandRegistry.size} 个 Chat Commands: ${chatCommandRegistry.list().join(', ')}`)

// GET /chat/commands — 列出所有可用指令（前端补全用）
app.get('/chat/commands', async (_req, reply) => {
  return reply.send({ commands: chatCommandRegistry.listDetails() })
})

// POST /chat/command — 执行指令
app.post<{ Body: { sessionKey?: string; input: string } }>('/chat/command', async (req, reply) => {
  const { sessionKey: rawKey, input } = req.body ?? {}
  const sessionKey = rawKey || DESKTOP_SESSION_KEY

  if (!input?.trim()) {
    return reply.status(400).send({ ok: false, error: 'input is required' })
  }

  if (!isChatCommand(input)) {
    return reply.send({ ok: false, error: 'Not a command (must start with /)' })
  }

  const parsed = parseChatCommand(input)
  if (!parsed) {
    return reply.send({ ok: false, error: 'Invalid command format' })
  }

  const definition = chatCommandRegistry.get(parsed.name)
  if (!definition) {
    return reply.send({ ok: false, error: `Unknown command: /${parsed.name}` })
  }

  try {
    const session = get(sessionKey)
    const messages = session?.messages ?? []
    const ctx: ChatCommandContext = {
      sessionKey,
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      metadata: session ? { model: (session as any).model, provider: (session as any).provider } : {},
    }

    const result = await definition.execute(parsed.args, ctx)

    // 处理副作用指令
    if (result.data.action === 'reset' && session) {
      session.messages.length = 0
    }

    return reply.send({ ok: true, command: parsed.name, result })
  } catch (err) {
    log.error(`[chat/command] /${parsed.name} failed: ${(err as Error).message}`)
    return reply.send({ ok: false, error: `Command failed: ${(err as Error).message}` })
  }
})

// ─── Chat Abort Registry ──────────────────────────────────────────────────────
/** sessionKey → 当前活跃请求的 AbortController（借鉴 OpenClaw chat-abort.ts） */
const activeAborts = new Map<string, AbortController>()

/** sessionKey → 当前运行中的 Steering 消息队列（阶段 D）
 *  生命周期与 runAttempt 相同，不持久化。
 *  写入不走 SessionQueue（中途注入语义），直接由 runner 内部消费。 */
const steeringQueues = new Map<string, string[]>()

// ─── Chat Stream ──────────────────────────────────────────────────────────────
interface ChatBody {
  message: string
  sessionKey?: string
  model?: string
  language?: string
}

app.post<{ Body: ChatBody }>('/chat/stream', async (req, reply) => {
  const { message, sessionKey: rawKey, model: requestModel, language: requestLanguage } = req.body ?? {}
  const sessionKey = rawKey || DESKTOP_SESSION_KEY

  if (!message?.trim()) {
    return reply.status(400).send({ error: 'message is required' })
  }

  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  reply.raw.flushHeaders()

  const send = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify({ ...obj as object, sessionKey })}\n\n`)

  // 如果该 session 有正在进行的请求，先中止它
  const prevAbort = activeAborts.get(sessionKey)
  if (prevAbort) prevAbort.abort()

  const abort = new AbortController()
  activeAborts.set(sessionKey, abort)
  let done = false
  // 监听响应流关闭（客户端断开连接），而非请求体关闭
  reply.raw.on('close', () => { if (!done) abort.abort() })

  try {
    // 模型路由："auto" 或空 → 智能路由；具体 "provider/model" → 直接指定
    let provider: import('./providers/types.js').LLMProvider | undefined
    const effectiveModel = requestModel || (hasSecret('MODEL_ROUTING') && getSecret('MODEL_ROUTING') === 'manual' && hasSecret('SELECTED_MODEL') ? getSecret('SELECTED_MODEL') : undefined)
    if (effectiveModel && effectiveModel !== 'auto') {
      const parts = effectiveModel.includes('/') ? effectiveModel.split('/') : ['copilot', effectiveModel]
      provider = getProviderById(parts[0], parts[1])
    }

    const result = await sessionQueue.enqueue(sessionKey, () => {
      // 提取 mention 标记
      const skillMatch = message.match(/^\[(@[a-zA-Z0-9_-]+(?:,@[a-zA-Z0-9_-]+)*)\]\s*/)
      const activeSkillNames = skillMatch
        ? skillMatch[1].split(',').map(s => s.replace(/^@/, '').trim()).filter(Boolean)
        : undefined
      const toolMatch = message.match(/\[#([a-zA-Z0-9_,#-]+)\]/)
      const allowedTools = toolMatch
        ? toolMatch[1].split(',').map(t => t.replace(/^#/, '').trim()).filter(Boolean)
        : undefined

      // 为本次 run 准备 steering queue（复用或新建）
      if (!steeringQueues.has(sessionKey)) steeringQueues.set(sessionKey, [])
      const steeringQueue = steeringQueues.get(sessionKey)!

      return runAttempt({
        sessionKey,
        userMessage: message,
        abortSignal: abort.signal,
        language: requestLanguage,
        toolRegistry,
        workspaceDir: getWorkspaceDir(),
        skills: skillsWatcher.getSkills().map(e => e.skill),
        activeSkillNames,
        allowedTools,
        steeringQueue,
        beforeToolCall: securityBeforeToolCall,
        contextEngine: new DefaultContextEngine(),
        onModelSwitch: (info) => send({ type: 'model_switch', from: info.fromProvider, to: info.toProvider, reason: info.reason }),
        onInteractive: (payload) => send({ type: 'interactive', payload }),
        onMemoryCaptured: (info) => send({ type: 'memory_captured', id: info.id, content: info.text, category: info.category }),
        ...(provider ? { provider } : {}),
        onDelta: (chunk) => send({ type: 'delta', content: chunk }),
        onToolStart: (info) => send({ type: 'tool_start', name: info.name, args: info.args, toolCallId: info.toolCallId }),
        onToolUpdate: (info) => send({ type: 'tool_update', toolCallId: info.toolCallId, content: info.content }),
        onToolResult: (info) => send({ type: 'tool_result', name: info.name, content: info.content.slice(0, 500), isError: info.isError, toolCallId: info.toolCallId }),
      })
    })
    send({ type: 'delta', content: `\n\n${result.costLine}` })
    if (result.quotaWarning) {
      send({ type: 'delta', content: `\n${result.quotaWarning}` })
    }
    done = true
    send({ type: 'done', usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalCny: result.totalCny, toolCallCount: result.toolCallCount, quotaWarning: result.quotaWarning } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)

    // 回滚: runAttempt 失败时，移除已追加的 user 消息（防止重试时重复）
    try {
      const session = await getOrCreate(sessionKey)
      if (session.messages.length > 0) {
        const last = session.messages[session.messages.length - 1]
        if (last.role === 'user') {
          session.messages.pop()
          log.info('[chat/stream] 回滚失败请求的 user message，防止重复追加')
        }
      }
    } catch { /* ignore rollback error */ }

    // API Key 相关错误
    const API_KEY_SECRETS = ['DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'VOLC_API_KEY', 'CUSTOM_API_KEY', 'CUSTOM_BASE_URL', 'MINIMAX_API_KEY']
    const isApiKeyMissing = API_KEY_SECRETS.some(k => msg.includes(`Secret not configured: ${k}`))
    if (msg.includes('Secret not configured: GITHUB_TOKEN') || (msg.includes('Copilot') && msg.includes('not configured'))) {
      send({ type: 'error', message: '⚠️ GitHub Copilot 登录已过期，请在设置中重新登录 Copilot。' })
    } else if (isApiKeyMissing) {
      send({ type: 'error', message: '请先在设置中配置 API Key' })
    } else if (msg.includes('insufficient balance') || msg.includes('1008')) {
      send({ type: 'error', message: '❌ API 余额不足（错误码 1008）。请前往 platform.minimaxi.com 充值，或更换其他模型。' })
    } else if (msg.includes('1000') && msg.includes('unknown error')) {
      send({ type: 'error', message: '❌ MiniMax 服务内部错误（错误码 1000），请稍后重试或更换其他模型。' })
    } else if (msg.includes('invalid api key') || msg.includes('401') || msg.includes('Unauthorized')) {
      send({ type: 'error', message: '❌ API Key 无效或已过期，请在设置中重新填入正确的 Key。' })
    } else if (msg.includes('rate limit') || msg.includes('429')) {
      send({ type: 'error', message: '❌ 请求过于频繁（限速），请稍等片刻后重试。' })
    } else if (msg.includes('Connection error') || msg.includes('ECONNRESET') || msg.includes('fetch failed') || msg.includes('socket hang up')) {
      send({ type: 'error', message: '❌ 与 AI 模型的网络连接中断。已自动重试 1 次仍失败。\n可能原因：网络不稳定 / 代理中断 / 模型服务暂时不可用。\n建议：稍等片刻后重试，或切换到其他模型。' })
    } else if (msg.includes('Secret not configured:')) {
      log.error(`[chat/stream] internal config error: ${msg}`)
      send({ type: 'error', message: `❌ 内部配置错误：${msg}，请反馈给开发者。` })
    } else {
      send({ type: 'error', message: msg })
    }
  } finally {
    activeAborts.delete(sessionKey)
    steeringQueues.delete(sessionKey)
    reply.raw.end()

    // 后台异步生成会话标题（不阻塞响应）
    ;(async () => {
      try {
        const session = await getOrCreate(sessionKey)
        if (!session.title) {
          const provider = getDefaultProvider()
          await generateTitle(session, provider)
        }
      } catch { /* 标题生成失败不影响流程 */ }
    })()
  }
})

// ─── Chat Abort（借鉴 OpenClaw chat.abort RPC）─────────────────────────────────
app.post<{ Body: { sessionKey?: string } }>('/chat/abort', async (req, reply) => {
  const sessionKey = req.body?.sessionKey || DESKTOP_SESSION_KEY
  const controller = activeAborts.get(sessionKey)
  if (controller) {
    controller.abort()
    activeAborts.delete(sessionKey)
    return reply.send({ ok: true, aborted: true })
  }
  return reply.send({ ok: true, aborted: false })
})

// ─── Chat Steer（阶段 D：运行中注入用户指令）──────────────────────────────────
app.post<{ Body: { sessionKey?: string; message: string } }>('/chat/steer', async (req, reply) => {
  const { sessionKey: rawKey, message } = req.body ?? {}
  const sessionKey = rawKey || DESKTOP_SESSION_KEY

  if (!message?.trim()) {
    return reply.status(400).send({ ok: false, reason: 'message is required' })
  }

  // 仅当 session 当前在 activeAborts 中（正在运行）时才入队
  if (!activeAborts.has(sessionKey)) {
    return reply.send({ ok: true, queued: false, reason: 'session is idle, use /chat/stream instead' })
  }

  const queue = steeringQueues.get(sessionKey)
  if (!queue) {
    return reply.send({ ok: true, queued: false, reason: 'no active steering queue' })
  }

  queue.push(message.trim())
  log.info(`[chat/steer] 📥 sessionKey=${sessionKey}, queued="${message.slice(0, 60)}", queueLen=${queue.length}`)
  return reply.send({ ok: true, queued: true })
})

// ─── Session 主动持久化（暂停时调用，确保工具结果不因进程重启丢失）─────────────
app.post<{ Params: { key: string } }>('/sessions/:key/persist', async (req, reply) => {
  const { key } = req.params
  const session = get(key)
  if (!session) return reply.send({ ok: false, reason: 'session not found in memory' })
  await persist(session)
  return reply.send({ ok: true, messages: session.messages.length })
})

// ─── Session truncate（重新生成时截断 session messages）─────────────
app.post<{ Params: { key: string } }>('/sessions/:key/truncate', async (req, reply) => {
  const { key } = req.params
  const { keepCount } = req.body as { keepCount?: number }
  const session = get(key)
  if (!session) return reply.send({ ok: false, reason: 'session not found' })
  if (typeof keepCount !== 'number' || keepCount < 0) return reply.send({ ok: false, reason: 'invalid keepCount' })

  // keepCount is the number of frontend-visible messages (user + assistant) to keep.
  // We need to map this to the backend session.messages array which also contains
  // system, tool, and assistant+tool_calls messages.
  let visibleCount = 0
  let cutIdx = session.messages.length // default: no cut

  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i] as { role: string }
    if (msg.role === 'user' || msg.role === 'assistant') {
      if (visibleCount === keepCount) {
        cutIdx = i
        break
      }
      visibleCount++
    }
  }

  if (cutIdx < session.messages.length) {
    session.messages.splice(cutIdx)
    // Clean up costLines for removed indices
    for (const idx of Object.keys(session.costLines).map(Number)) {
      if (idx >= cutIdx) delete session.costLines[idx]
    }
    await persist(session)
  }
  return reply.send({ ok: true, messages: session.messages.length })
})

// ─── Tools API ────────────────────────────────────────────────────────────────
app.get('/tools', async (_req, reply) => {
  return reply.send(toolRegistry.list().map(name => ({ name })))
})

// 诊断端点：返回完整的 tool schemas（调试 tool calling 问题）
app.get('/tools/schemas', async (_req, reply) => {
  return reply.send(toolRegistry.getToolSchemas())
})

// ─── Skills API ───────────────────────────────────────────────────────────────
app.get('/skills', async (_req, reply) => {
  const skills = skillsWatcher.getSkills()
  return reply.send(skills.map(e => ({
    name: e.skill.name,
    description: e.skill.description,
    source: e.source,
    filePath: e.skill.filePath,
    body: (e.skill.body || '').slice(0, 2000),
    category: e.skill.metadata?.category || 'other',
  })))
})

app.post('/skills/reload', async (_req, reply) => {
  const skills = skillsWatcher.reload()
  return reply.send({ count: skills.length, skills: skills.map(e => e.skill.name) })
})

// ─── Skills Status API（Phase 7）─────────────────────────────────────────────

/** 状态报告：每个 Skill 的启用状态 + 依赖满足情况 */
app.get('/skills/status', async (_req, reply) => {
  const entries = skillsWatcher.getSkills()
  const report = buildSkillStatus(entries)
  return reply.send(report)
})

/** 强制扫描指定 Skill */
app.post<{ Params: { name: string } }>('/skills/:name/scan', async (req, reply) => {
  const { name } = req.params
  const entries = skillsWatcher.getSkills()
  const entry = entries.find(e => e.skill.name === name)
  if (!entry) {
    return reply.status(404).send({ error: `Skill "${name}" not found` })
  }
  const summary = scanSkillDirNoCache(entry.skill.baseDir)
  // 更新 blocked 状态
  entry.blocked = summary.critical > 0
  entry.scanSummary = summary
  return reply.send(summary)
})

// ─── Skills Gallery (安全安装) ────────────────────────────────────────────────

/** 列出可信仓库 */
app.get('/skills/gallery/repos', async (_req, reply) => {
  return reply.send(TRUSTED_REPOS)
})

/** 从可信仓库获取可安装的 Skills */
app.get('/skills/gallery', async (_req, reply) => {
  const proxyUrl = getSecret('HTTPS_PROXY' as SecretKey) || undefined
  try {
    const gallery = await fetchGallery(proxyUrl)
    return reply.send(gallery)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(500).send({ error: msg })
  }
})

/** 安装一个 Skill（安全检查 + 白名单验证） */
app.post<{ Body: { name: string; repoId: string; downloadUrl: string; remotePath: string } }>('/skills/gallery/install', async (req, reply) => {
  const { name, repoId, downloadUrl, remotePath } = req.body ?? {}
  if (!name || !repoId || !downloadUrl) {
    return reply.status(400).send({ error: 'name, repoId, downloadUrl required' })
  }
  const proxyUrl = getSecret('HTTPS_PROXY' as SecretKey) || undefined
  const result = await installSkill({ name, repoId, downloadUrl, remotePath }, proxyUrl)

  if (result.ok) {
    // 安装成功后重载 Skills
    skillsWatcher.reload()
  }

  return reply.send(result)
})

/** 卸载一个 Skill */
app.post<{ Body: { name: string } }>('/skills/gallery/uninstall', async (req, reply) => {
  const { name } = req.body ?? {}
  if (!name) return reply.status(400).send({ error: 'name required' })

  const result = uninstallSkill(name)
  if (result.ok) skillsWatcher.reload()

  return reply.send(result)
})

/** 扫描 Skill 内容安全性（独立调用） */
app.post<{ Body: { content: string } }>('/skills/scan', async (req, reply) => {
  const { content } = req.body ?? {}
  if (!content) return reply.status(400).send({ error: 'content required' })
  return reply.send(scanSkillContent(content))
})

// ─── Providers API ────────────────────────────────────────────────────────────

// ─── Crew API ─────────────────────────────────────────────────────────────────

app.get('/crews', async (_req, reply) => {
  const crews = await listCrews()
  return reply.send(crews)
})

app.get<{ Params: { id: string } }>('/crews/:id', async (req, reply) => {
  const crew = await getCrewById(req.params.id)
  if (!crew) return reply.status(404).send({ error: 'Crew not found' })
  return reply.send(crew)
})

app.post<{ Body: CrewCreateInput }>('/crews', async (req, reply) => {
  const { name, skillNames, ...rest } = req.body ?? {} as CrewCreateInput
  if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
  const crew = await createCrew({ name, skillNames: skillNames ?? [], ...rest })
  return reply.status(201).send(crew)
})

app.put<{ Params: { id: string }; Body: CrewUpdateInput }>('/crews/:id', async (req, reply) => {
  const crew = await updateCrew(req.params.id, req.body ?? {})
  if (!crew) return reply.status(404).send({ error: 'Crew not found' })
  return reply.send(crew)
})

app.delete<{ Params: { id: string } }>('/crews/:id', async (req, reply) => {
  const ok = await deleteCrew(req.params.id)
  if (!ok) return reply.status(404).send({ error: 'Crew not found' })
  return reply.send({ ok: true })
})

/** 以指定 Crew 创建新的 Crew Session */
app.post<{ Params: { id: string } }>('/crews/:id/session', async (req, reply) => {
  const crew = await getCrewById(req.params.id)
  if (!crew) return reply.status(404).send({ error: 'Crew not found' })
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  const sessionKey = `agent:main:desktop:crew:${crew.id}:${ts}-${rand}`
  const session = await getOrCreate(sessionKey)
  // 在 session 上标记 mode 和 crewId
  ;(session as any).mode = 'crew'
  ;(session as any).crewId = crew.id
  return reply.status(201).send({ sessionKey, crewId: crew.id, crewName: crew.name })
})

/** Phase 2: 从 Chat 历史生成 Briefing */
app.post<{ Body: { sourceSessionKey: string; crewId?: string } }>('/briefing/generate', async (req, reply) => {
  const { sourceSessionKey, crewId } = req.body ?? {}
  if (!sourceSessionKey) return reply.status(400).send({ error: 'sourceSessionKey is required' })

  const sourceSession = get(sourceSessionKey)
  if (!sourceSession || sourceSession.messages.length === 0) {
    return reply.status(404).send({ error: 'Source session not found or empty' })
  }

  try {
    const result = await generateBriefing(sourceSession.messages, sourceSessionKey)

    // 如果指定了 crewId，自动创建 Crew Session 并注入 briefing
    if (crewId) {
      const crew = await getCrewById(crewId)
      if (!crew) return reply.status(404).send({ error: 'Crew not found' })

      const ts = Date.now().toString(36)
      const rand = Math.random().toString(36).slice(2, 8)
      const newSessionKey = `agent:main:desktop:crew:${crew.id}:${ts}-${rand}`
      const newSession = await getOrCreate(newSessionKey)
      ;(newSession as any).mode = 'crew'
      ;(newSession as any).crewId = crew.id
      ;(newSession as any).briefing = {
        sourceSessionKey,
        summary: result.summary,
      }

      return reply.send({
        briefing: result,
        sessionKey: newSessionKey,
        crewId: crew.id,
        crewName: crew.name,
      })
    }

    return reply.send({ briefing: result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(500).send({ error: `Briefing generation failed: ${msg}` })
  }
})

/** Phase 4: AI 辅助推荐 Crew 配置 */
app.post<{ Body: { sourceSessionKey: string } }>('/crews/recommend', async (req, reply) => {
  const { sourceSessionKey } = req.body ?? {}
  if (!sourceSessionKey) return reply.status(400).send({ error: 'sourceSessionKey is required' })

  const sourceSession = get(sourceSessionKey)
  if (!sourceSession || sourceSession.messages.length === 0) {
    return reply.status(404).send({ error: 'Source session not found or empty' })
  }

  try {
    const recommendation = await recommendCrew(sourceSession.messages)
    return reply.send(recommendation)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(500).send({ error: `Crew recommendation failed: ${msg}` })
  }
})

// ─── Providers API (continued) ────────────────────────────────────────────────

/** 列出所有 Provider 及其配置状态 */
app.get('/providers', async (_req, reply) => {
  const settings = listSecrets()
  const activeProvider = settings.find(s => s.key === 'COPILOT_MODEL' || s.key === 'CUSTOM_API_KEY')
  return reply.send(listProviders())
})

/** 合并所有已配置 Provider 的可用模型（动态） */
app.get('/models', async (_req, reply) => {
  const models: Array<{ value: string; label: string; provider: string; multiplier?: number; category?: string; preview?: boolean }> = []

  // Copilot 模型（动态获取）
  if (isCopilotLoggedIn()) {
    try {
      const copilotList = await fetchCopilotModels()
      for (const m of copilotList) {
        models.push({ value: `copilot/${m.id}`, label: m.name, provider: 'copilot', multiplier: m.multiplier, category: m.category, preview: m.preview })
      }
    } catch {
      for (const m of COPILOT_MODELS) {
        models.push({ value: `copilot/${m.id}`, label: m.name, provider: 'copilot', multiplier: m.multiplier, category: m.category, preview: m.preview })
      }
    }
  }

  // DeepSeek
  if (hasSecret('DEEPSEEK_API_KEY')) {
    models.push({ value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', provider: 'deepseek' })
    models.push({ value: 'deepseek/deepseek-reasoner', label: 'DeepSeek Reasoner', provider: 'deepseek' })
  }

  // Qwen
  if (hasSecret('QWEN_API_KEY')) {
    models.push({ value: 'qwen/qwen-turbo', label: 'Qwen Turbo', provider: 'qwen' })
    models.push({ value: 'qwen/qwen-plus', label: 'Qwen Plus', provider: 'qwen' })
    models.push({ value: 'qwen/qwen-max', label: 'Qwen Max', provider: 'qwen' })
  }

  // Volc
  if (hasSecret('VOLC_API_KEY')) {
    models.push({ value: 'volc/doubao-seed-1-6-250615', label: '豆包 Seed', provider: 'volc' })
  }

  // MiniMax
  if (hasSecret('MINIMAX_API_KEY')) {
    models.push({ value: 'minimax/MiniMax-M2.5', label: 'MiniMax M2.5', provider: 'minimax', multiplier: 1 })
    models.push({ value: 'minimax/MiniMax-M2.7', label: 'MiniMax M2.7', provider: 'minimax', multiplier: 1 })
    models.push({ value: 'minimax/MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 Highspeed', provider: 'minimax', multiplier: 1 })
  }

  // Custom
  if (hasSecret('CUSTOM_API_KEY') && hasSecret('CUSTOM_BASE_URL')) {
    const model = hasSecret('CUSTOM_MODEL') ? getSecret('CUSTOM_MODEL') : 'custom-model'
    models.push({ value: `custom/${model}`, label: `自定义 (${model})`, provider: 'custom' })
  }

  return reply.send(models)
})

// ─── Sessions API ─────────────────────────────────────────────────────────────

/** 列出所有持久化的会话 */
app.get('/sessions', async (_req, reply) => {
  const sessions = await listSessions()
  return reply.send(sessions)
})

/** 获取某个会话的历史消息 */
app.get<{ Params: { key: string }; Querystring: { key?: string } }>('/sessions/:key', async (req, reply) => {
  const key = req.query.key ?? req.params.key
  const session = await getOrCreate(key)

  // 构建 tool_call_id -> tool result 的快速查找表
  const toolResultMap = new Map<string, { content: string; isError?: boolean }>()
  for (const m of session.messages) {
    if (!('role' in m)) continue
    const msg = m as { role: string; tool_call_id?: string; content?: unknown }
    if (msg.role === 'tool' && msg.tool_call_id) {
      toolResultMap.set(msg.tool_call_id, {
        content: typeof msg.content === 'string' ? msg.content : '',
      })
    }
  }

  type HistoryToolCall = { toolCallId: string; name: string; args?: Record<string, unknown>; result?: string; status: string }
  type HistoryMessage = { role: string; content: string; toolCalls?: HistoryToolCall[] }
  const messages: HistoryMessage[] = []

  session.messages.forEach((m, idx) => {
    if (!('role' in m)) return
    const role = (m as { role: string }).role

    if (role === 'assistant') {
      const msg = m as { role: string; content?: unknown; tool_calls?: Array<{ id: string; function: { name: string; arguments?: string } }> }
      let content = typeof msg.content === 'string' ? msg.content : ''
      // 对 assistant 消息追加费用行（仅用于前端显示）
      const cl = session.costLines[idx]
      if (cl) content += `\n\n${cl}`

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // assistant 工具调用消息：将 tool_calls + 对应的 tool result 合并返回
        const toolCalls: HistoryToolCall[] = msg.tool_calls.map(tc => {
          let args: Record<string, unknown> = {}
          try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {} } catch { /* ignore */ }
          const resultEntry = toolResultMap.get(tc.id)
          return {
            toolCallId: tc.id,
            name: tc.function.name,
            args,
            result: resultEntry?.content,
            status: resultEntry ? 'done' : 'running',
          }
        })
        messages.push({ role: 'assistant', content, toolCalls })
      } else if (content) {
        // 纯文本 assistant 消息
        messages.push({ role: 'assistant', content })
      }
    } else if (role === 'user') {
      const content = typeof (m as { content?: unknown }).content === 'string' ? (m as { content: string }).content : ''
      if (content) messages.push({ role: 'user', content })
    }
    // tool 和 system 消息不直接返回（tool 结果已内嵌到 assistant 的 toolCalls 里）
  })

  return reply.send({
    key: session.key,
    title: session.title,
    createdAt: session.createdAt,
    messages,
  })
})

/** 删除一个会话 */
app.delete<{ Params: { key: string }; Querystring: { key?: string } }>('/sessions/:key', async (req, reply) => {
  const key = req.query.key ?? req.params.key
  // 先清理该 session 的浏览器上下文（如果有的话）
  await closeSessionBrowser(key).catch(() => {})
  await deleteSessionFromDisk(key)
  return reply.send({ ok: true })
})

// ─── Settings: save API key ────────────────────────────────────────────────────
interface SaveKeyBody {
  provider: SecretKey
  key: string
}

app.post<{ Body: SaveKeyBody }>('/settings/api-key', async (req, reply) => {
  const { provider, key } = req.body ?? {}
  if (!provider || !key) return reply.status(400).send({ error: 'provider and key required' })
  setSecret(provider, key)
  // 代理设置变更时同步更新运行时代理
  if (provider === 'HTTPS_PROXY') {
    setProxyUrl(key)
  }
  return reply.send({ ok: true })
})

// ─── Settings: get current config ─────────────────────────────────────────────
app.get('/settings', async (_req, reply) => {
  const configured = listSecrets()
  // 判断当前激活的 provider — 顺序与 PROVIDER_ORDER 一致：copilot > deepseek > qwen > volc > custom
  let activeProvider: string | null = null
  if (isCopilotLoggedIn()) {
    activeProvider = 'copilot'
  } else if (hasSecret('DEEPSEEK_API_KEY')) {
    activeProvider = 'deepseek'
  } else if (hasSecret('QWEN_API_KEY')) {
    activeProvider = 'qwen'
  } else if (hasSecret('VOLC_API_KEY')) {
    activeProvider = 'volc'
  } else if (hasSecret('MINIMAX_API_KEY')) {
    activeProvider = 'minimax'
  } else if (hasSecret('CUSTOM_API_KEY') && hasSecret('CUSTOM_BASE_URL')) {
    activeProvider = 'custom'
  }
  const modelRouting = hasSecret('MODEL_ROUTING') ? getSecret('MODEL_ROUTING') : 'auto'
  const selectedModel = hasSecret('SELECTED_MODEL') ? getSecret('SELECTED_MODEL') : ''

  // R2: Intent Judge 配置
  const intentJudge = (hasSecret('INTENT_JUDGE_PROVIDER') && hasSecret('INTENT_JUDGE_MODEL')
    && getSecret('INTENT_JUDGE_PROVIDER') && getSecret('INTENT_JUDGE_MODEL'))
    ? { provider: getSecret('INTENT_JUDGE_PROVIDER'), model: getSecret('INTENT_JUDGE_MODEL') }
    : null

  return reply.send({ configured, activeProvider, modelRouting, selectedModel, storageMode: getStorageMode(), intentJudge })
})

// ─── Settings: delete a key ───────────────────────────────────────────────────
app.delete<{ Params: { key: string } }>('/settings/:key', async (req, reply) => {
  const { key } = req.params
  setSecret(key as SecretKey, '')
  // 代理设置清除时同步更新运行时
  if (key === 'HTTPS_PROXY') {
    setProxyUrl(null)
  }
  return reply.send({ ok: true })
})

// ─── Cost summary ─────────────────────────────────────────────────────────
app.get('/cost/summary', async (_req, reply) => {
  return reply.send(dailySummary(7))
})

/** 按会话查询费用 */
app.get<{ Params: { key: string } }>('/cost/session/:key', async (req, reply) => {
  const result = sessionCostSummary(req.params.key)
  return reply.send(result ?? { totalCny: 0, totalTokens: 0, callCount: 0 })
})

/** 所有会话费用概览 */
app.get('/cost/sessions', async (_req, reply) => {
  return reply.send(allSessionsCostSummary())
})

/** 全局费用总计 */
app.get('/cost/global', async (_req, reply) => {
  return reply.send(globalCostSummary())
})

// ─── Phase U: Request Quota API ──────────────────────────────────────────
app.get('/quota', async (_req, reply) => {
  return reply.send({
    configs: listQuotaConfigs(),
    statuses: allQuotaStatuses(),
  })
})

app.put<{ Body: QuotaConfig }>('/quota', async (req, reply) => {
  const config = req.body
  if (!config?.provider || !config?.tier || !config?.monthlyLimit) {
    return reply.status(400).send({ error: 'provider, tier, monthlyLimit are required' })
  }
  setQuotaConfig({
    provider: config.provider,
    tier: config.tier,
    monthlyLimit: config.monthlyLimit,
    warnPct: config.warnPct ?? 0.8,
    criticalPct: config.criticalPct ?? 0.95,
    autoDowngrade: config.autoDowngrade ?? true,
  })
  return reply.send({ ok: true })
})

app.delete<{ Body: { provider: string; tier: string } }>('/quota', async (req, reply) => {
  const { provider, tier } = req.body ?? {} as any
  if (!provider || !tier) {
    return reply.status(400).send({ error: 'provider and tier are required' })
  }
  deleteQuotaConfig(provider, tier as any)
  return reply.send({ ok: true })
})

// ─── Security Audit（Phase I3, T21）────────────────────────────────────────
import { runSecurityAudit } from './security/audit.js'

app.get('/security-audit', async (_req, reply) => {
  const storageMode = getStorageMode()
  const report = runSecurityAudit({
    sandboxEnabled: !!process.env.EQUALITY_SANDBOX,
    workspaceDir: getWorkspaceDir(),
    registeredTools: toolRegistry.list(),
    secretStorageMode: storageMode === 'dpapi' ? 'encrypted' : 'env',
    proxyUrl: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined,
  })
  return reply.send(report)
})

// ─── Memory Management（Phase M1）─────────────────────────────────────────────

// T8: GET /memories — 分页列表
app.get<{ Querystring: Record<string, string | undefined> }>('/memories', async (req, reply) => {
  const q = req.query
  const options: MemoryListPagedOptions = {
    page: q.page ? parseInt(q.page) : 1,
    pageSize: q.pageSize ? parseInt(q.pageSize) : 20,
    category: q.category || undefined,
    agentId: q.agent || undefined,
    workspaceDir: q.workspace || undefined,
    source: q.source || undefined,
    search: q.search || undefined,
    archived: q.archived === 'true' ? true : q.archived === 'false' ? false : undefined,
    pinned: q.pinned === 'true' ? true : q.pinned === 'false' ? false : undefined,
  }
  return reply.send(memoryListPaged(options))
})

// T9: GET /memories/stats — 统计
app.get('/memories/stats', async (_req, reply) => {
  return reply.send(memoryStats())
})

// T9: GET /memories/:id — 详情
app.get<{ Params: { id: string } }>('/memories/:id', async (req, reply) => {
  const entry = memoryGetById(req.params.id)
  if (!entry) return reply.status(404).send({ error: 'not_found' })
  return reply.send(entry)
})

// T10: POST /memories — 创建（manual source + 安全扫描 + 去重）
app.post('/memories', async (req, reply) => {
  const body = req.body as {
    text?: string
    category?: string
    importance?: number
    agentId?: string
    workspaceDir?: string
    pinned?: boolean
  }

  if (!body.text?.trim()) {
    return reply.status(400).send({ error: 'text_required' })
  }

  // 安全扫描
  const threat = scanMemoryThreats(body.text.trim())
  if (!threat.safe) {
    return reply.status(400).send({ error: 'memory_threat_detected', type: threat.type })
  }

  // 去重检查
  const dup = checkMemoryDuplicate(body.text.trim())
  if (dup.duplicate) {
    return reply.send({
      duplicate: true,
      existingId: dup.existingId,
      existingText: dup.existingText,
      similarity: dup.similarity,
    })
  }

  const opts: MemorySaveOptions = {
    category: body.category,
    importance: body.importance,
    agentId: body.agentId,
    workspaceDir: body.workspaceDir,
    source: 'manual',
    pinned: body.pinned,
  }

  const result = memorySave(body.text, opts)
  if ('blocked' in result) {
    return reply.status(400).send({ error: 'memory_threat_detected', type: result.type })
  }
  if ('duplicate' in result) {
    return reply.send(result)
  }
  return reply.status(201).send(result)
})

// T11: PATCH /memories/:id — 编辑 + 快照失效
app.patch<{ Params: { id: string } }>('/memories/:id', async (req, reply) => {
  const body = req.body as {
    text?: string
    category?: string
    importance?: number
    pinned?: boolean
    archived?: boolean
  }

  const updated = memoryUpdate(req.params.id, body)
  if (!updated) return reply.status(404).send({ error: 'not_found' })

  // T16: 快照失效 — 清空活跃 session 的冻结快照
  try {
    const { invalidateMemorySnapshots } = await import('./session/store.js')
    invalidateMemorySnapshots()
  } catch {
    // session store 未初始化时忽略
  }

  return reply.send(updated)
})

// T12: DELETE /memories/:id — 单条删除
app.delete<{ Params: { id: string } }>('/memories/:id', async (req, reply) => {
  const ok = memoryDelete(req.params.id)
  if (!ok) return reply.status(404).send({ error: 'not_found' })

  // 快照失效
  try {
    const { invalidateMemorySnapshots } = await import('./session/store.js')
    invalidateMemorySnapshots()
  } catch { /* ignore */ }

  return reply.send({ ok: true })
})

// T12: DELETE /memories?ids= — 批量删除
app.delete('/memories', async (req, reply) => {
  const q = (req.query as Record<string, string | undefined>)
  const idsParam = q.ids
  if (!idsParam) return reply.status(400).send({ error: 'ids_required' })

  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
  let deleted = 0
  for (const id of ids) {
    if (memoryDelete(id)) deleted++
  }

  // 快照失效
  if (deleted > 0) {
    try {
      const { invalidateMemorySnapshots } = await import('./session/store.js')
      invalidateMemorySnapshots()
    } catch { /* ignore */ }
  }

  return reply.send({ ok: true, deleted })
})

// M3/T33: GET /memories/export — 导出全部记忆
app.get('/memories/export', async (_req, reply) => {
  try {
    const data = memoryExport()
    return reply.send(data)
  } catch (err) {
    return reply.status(500).send({ error: String(err) })
  }
})

// M3/T33: POST /memories/import — 导入记忆
app.post<{ Body: { items: unknown[]; mode?: 'merge' | 'replace' } }>('/memories/import', async (req, reply) => {
  const { items, mode } = req.body ?? {}
  if (!Array.isArray(items)) return reply.status(400).send({ error: 'items must be an array' })
  try {
    const result = memoryImport(items as any[], mode ?? 'merge')
    // 导入后快照失效
    try {
      const { invalidateMemorySnapshots } = await import('./session/store.js')
      invalidateMemorySnapshots()
    } catch { /* ignore */ }
    return reply.send(result)
  } catch (err) {
    return reply.status(500).send({ error: String(err) })
  }
})

// M3/T34: POST /memories/gc — 手动触发 GC
app.post('/memories/gc', async (_req, reply) => {
  try {
    const result = memoryGC()
    return reply.send(result)
  } catch (err) {
    return reply.status(500).send({ error: String(err) })
  }
})

// ─── Copilot: Device Flow Login ───────────────────────────────────────────────
app.post('/copilot/login', async (_req, reply) => {
  try {
    const result = await startDeviceFlow()
    return reply.send(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(500).send({ error: msg })
  }
})

app.get('/copilot/login/status', async (_req, reply) => {
  try {
    const status = await pollForToken()
    return reply.send({ ...status, interval: getPollingInterval() })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.send({ status: 'error', message: msg })
  }
})

app.post('/copilot/logout', async (_req, reply) => {
  clearCopilotAuth()
  return reply.send({ ok: true })
})

app.get('/copilot/models', async (_req, reply) => {
  try {
    const models = await fetchCopilotModels()
    return reply.send(models)
  } catch {
    return reply.send(COPILOT_MODELS)
  }
})

// ─── Startup + reap timer ────────────────────────────────────────────────────

// Graceful shutdown: 关闭 MCP 连接
process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down...')
  try { await taskRegistry.flush() } catch (e) { log.warn(`taskRegistry.flush() failed: ${e}`) }
  await mcpManager.stop()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down...')
  try { await taskRegistry.flush() } catch (e) { log.warn(`taskRegistry.flush() failed: ${e}`) }
  await mcpManager.stop()
  process.exit(0)
})

try {
  await app.listen({ port: PORT, host: HOST })
  log.info(`v${VERSION} listening on ${HOST}:${PORT}`)

  // K2: 异步回填旧记忆的 embedding（不阻塞启动）
  setTimeout(() => {
    try {
      const count = backfillEmbeddings()
      if (count > 0) log.info(`embedding 回填完成: ${count} 条`)
    } catch (err) {
      log.warn(`embedding 回填失败: ${err}`)
    }
  }, 2000) // 延迟 2s，等数据库初始化稳定后再回填

  // M3/T34: 启动时 GC + 每 24h 自动 GC
  setTimeout(() => {
    try {
      const gc = memoryGC()
      if (gc.archived > 0 || gc.deleted > 0) {
        log.info(`memory GC: archived=${gc.archived}, deleted=${gc.deleted}`)
      }
    } catch (err) {
      log.warn(`memory GC 失败: ${err}`)
    }
  }, 5000) // 延迟 5s
  setInterval(() => {
    try {
      const gc = memoryGC()
      if (gc.archived > 0 || gc.deleted > 0) {
        log.info(`memory GC (scheduled): archived=${gc.archived}, deleted=${gc.deleted}`)
      }
    } catch (err) {
      log.warn(`memory GC 失败: ${err}`)
    }
  }, 24 * 3600_000) // 24h
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

setInterval(() => {
  const removed = reap()
  if (removed > 0) log.info(`reaped ${removed} idle sessions`)
}, 60 * 60 * 1000)
