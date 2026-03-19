import Fastify from 'fastify'
import cors from '@fastify/cors'
import path from 'node:path'

import { DESKTOP_SESSION_KEY } from './session/key.js'
import { reap, getOrCreate, get } from './session/store.js'
import { SessionQueue } from './session/queue.js'
import { runAttempt } from './agent/runner.js'
import { persist, listSessions, deleteSession as deleteSessionFromDisk } from './session/persist.js'
import { initSecrets, setSecret, getSecret, listSecrets, hasSecret } from './config/secrets.js'
import type { SecretKey } from './config/secrets.js'
import { initProxy, setProxyUrl } from './config/proxy.js'
import { dailySummary, sessionCostSummary, allSessionsCostSummary, globalCostSummary } from './cost/ledger.js'
import { startDeviceFlow, pollForToken, clearCopilotAuth, isCopilotLoggedIn, getPollingInterval } from './providers/copilot-auth.js'
import { COPILOT_MODELS, fetchCopilotModels } from './providers/copilot.js'
import { ToolRegistry, builtinTools } from './tools/index.js'
import { closeSessionBrowser } from './tools/builtins/browser.js'
import { SkillsWatcher } from './skills/index.js'
import { fetchGallery, installSkill, uninstallSkill, scanSkillContent, TRUSTED_REPOS } from './skills/gallery.js'
import { buildSkillStatus } from './skills/status.js'
import { scanSkillDirNoCache } from './skills/scanner.js'
import { listProviders, getDefaultProvider, getProviderById } from './providers/index.js'
import { getStorageMode } from './config/secrets.js'
import { generateTitle } from './session/title-gen.js'
import { CronScheduler } from './cron/index.js'
import { setCronScheduler } from './tools/builtins/cron.js'

const PORT = Number(process.env.EQUALITY_PORT ?? 18790)
const HOST = 'localhost'
const VERSION = '0.2.1'

// 初始化 secrets（从环境变量读取）
initSecrets()

// 初始化代理（从 settings.json 或环境变量读取）
initProxy(hasSecret('HTTPS_PROXY') ? getSecret('HTTPS_PROXY') : undefined)

// 初始化工具注册表
const toolRegistry = new ToolRegistry()
for (const tool of builtinTools) {
  toolRegistry.register(tool)
}
console.log(`[equality-core] 已注册 ${toolRegistry.size} 个工具: ${toolRegistry.list().join(', ')}`)

// 初始化 Skills 热加载
const skillsWatcher = new SkillsWatcher({
  workspaceDir: process.cwd(),
  onChange: (skills, event) => {
    console.log(`[equality-core] Skills 已重载: ${skills.length} 个 (v=${event.version}, reason=${event.reason})`)
  },
})
const initialSkills = await skillsWatcher.start()
console.log(`[equality-core] 已加载 ${initialSkills.length} 个 Skills: ${initialSkills.map(e => e.skill.name).join(', ')}`)

// ─── 初始化 CronScheduler（Phase 4）────────────────────────────────────────
const sseClients = new Set<import('node:http').ServerResponse>()

function broadcastNotification(title: string, body: string) {
  const data = JSON.stringify({ type: 'notification', title, body })
  for (const client of sseClients) {
    try { client.write(`data: ${data}\n\n`) } catch { sseClients.delete(client) }
  }
  // 同时输出到控制台
  console.log(`[CronScheduler] 🔔 ${title}: ${body}`)
}

// ─── Session 并发队列（Phase 11）────────────────────────────────────────

const sessionQueue = new SessionQueue()

const cronScheduler = new CronScheduler({
  notifier: broadcastNotification,
  runAgentTurn: async (sessionKey, userMessage) => {
    const result = await sessionQueue.enqueue(sessionKey, () => runAttempt({
      sessionKey,
      userMessage,
      toolRegistry,
      workspaceDir: process.cwd(),
      skills: skillsWatcher.getSkills().map(e => e.skill),
    }))
    return result.text.slice(0, 500)
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
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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

// ─── Chat Abort Registry ──────────────────────────────────────────────────────
/** sessionKey → 当前活跃请求的 AbortController（借鉴 OpenClaw chat-abort.ts） */
const activeAborts = new Map<string, AbortController>()

// ─── Chat Stream ──────────────────────────────────────────────────────────────
interface ChatBody {
  message: string
  sessionKey?: string
  model?: string
}

app.post<{ Body: ChatBody }>('/chat/stream', async (req, reply) => {
  const { message, sessionKey: rawKey, model: requestModel } = req.body ?? {}
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

  const send = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`)

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

    const result = await sessionQueue.enqueue(sessionKey, () => runAttempt({
      sessionKey,
      userMessage: message,
      abortSignal: abort.signal,
      toolRegistry,
      workspaceDir: process.cwd(),
      skills: skillsWatcher.getSkills().map(e => e.skill),
      ...(provider ? { provider } : {}),
      onDelta: (chunk) => send({ type: 'delta', content: chunk }),
      onToolStart: (info) => send({ type: 'tool_start', name: info.name, args: info.args, toolCallId: info.toolCallId }),
      onToolUpdate: (info) => send({ type: 'tool_update', toolCallId: info.toolCallId, content: info.content }),
      onToolResult: (info) => send({ type: 'tool_result', name: info.name, content: info.content.slice(0, 500), isError: info.isError, toolCallId: info.toolCallId }),
    }))
    send({ type: 'delta', content: `\n\n${result.costLine}` })
    done = true
    send({ type: 'done', usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalCny: result.totalCny, toolCallCount: result.toolCallCount } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Secret not configured')) {
      send({ type: 'error', message: '请先在设置中配置 API Key' })
    } else if (msg.includes('insufficient balance') || msg.includes('1008')) {
      send({ type: 'error', message: '❌ API 余额不足（错误码 1008）。请前往 platform.minimaxi.com 充值，或更换其他模型。' })
    } else if (msg.includes('invalid api key') || msg.includes('401') || msg.includes('Unauthorized')) {
      send({ type: 'error', message: '❌ API Key 无效或已过期，请在设置中重新填入正确的 Key。' })
    } else if (msg.includes('rate limit') || msg.includes('429')) {
      send({ type: 'error', message: '❌ 请求过于频繁（限速），请稍等片刻后重试。' })
    } else {
      send({ type: 'error', message: msg })
    }
  } finally {
    activeAborts.delete(sessionKey)
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

// ─── Session 主动持久化（暂停时调用，确保工具结果不因进程重启丢失）─────────────
app.post<{ Params: { key: string } }>('/sessions/:key/persist', async (req, reply) => {
  const { key } = req.params
  const session = get(key)
  if (!session) return reply.send({ ok: false, reason: 'session not found in memory' })
  await persist(session)
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
app.get<{ Params: { key: string } }>('/sessions/:key', async (req, reply) => {
  const { key } = req.params
  const session = await getOrCreate(key)
  // 只返回 user 和 assistant 消息（过滤掉 tool/system）
  const messages: Array<{ role: string; content: string }> = []
  session.messages.forEach((m, idx) => {
    if (!('role' in m)) return
    const role = (m as { role: string }).role
    if (role !== 'user' && role !== 'assistant') return
    let content = typeof (m as { content?: unknown }).content === 'string' ? (m as { content: string }).content : ''
    // 对 assistant 消息追加费用行（仅用于前端显示）
    const cl = session.costLines[idx]
    if (role === 'assistant' && cl) {
      content += `\n\n${cl}`
    }
    messages.push({ role, content })
  })
  return reply.send({
    key: session.key,
    title: session.title,
    createdAt: session.createdAt,
    messages,
  })
})

/** 删除一个会话 */
app.delete<{ Params: { key: string } }>('/sessions/:key', async (req, reply) => {
  const { key } = req.params
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
  return reply.send({ configured, activeProvider, modelRouting, selectedModel, storageMode: getStorageMode() })
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
try {
  await app.listen({ port: PORT, host: HOST })
  console.log(`[equality-core] v${VERSION} listening on ${HOST}:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

setInterval(() => {
  const removed = reap()
  if (removed > 0) console.log(`[equality-core] reaped ${removed} idle sessions`)
}, 60 * 60 * 1000)
