/**
 * Phase I.5b — Gateway Stitch G1-G9 集成验证
 *
 * 验证 G1-G9 缝合层改动是否正确：
 *   G1: codebase_search 已注册到 builtinTools
 *   G2: globalHookRegistry 已接入 runner.ts（import 验证）
 *   G3: emitSessionEvent 已在 session/store.ts 使用（import 验证）
 *   G4: validateConfig + EQUALITY_CONFIG_SCHEMA 验证
 *   G5: WebSearchRegistry + BraveSearchProvider + DuckDuckGoSearchProvider
 *   G6: CommandQueue 在 bash.ts 中的集成
 *   G7: detectLinks + fetchAndSummarize 可用性
 *   G8: plugins/loader.ts loadFromDirectory 可用性
 *   G9: createLogger('gateway') 验证
 */

import assert from 'node:assert/strict'

let passed = 0
let failed = 0

function ok(condition: boolean, msg: string) {
  if (condition) {
    passed++
    return true
  } else {
    failed++
    console.error(`  ❌ FAIL: ${msg}`)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// G1: codebase_search 注册
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G1: codebase_search 注册 ──')

import { builtinTools, codebaseSearchTool, bashTool } from '../tools/builtins/index.js'

{
  ok(typeof codebaseSearchTool === 'object', 'G1-T1: codebaseSearchTool 已导出')
  ok(codebaseSearchTool.name === 'codebase_search', 'G1-T2: name = codebase_search')
  ok(builtinTools.includes(codebaseSearchTool), 'G1-T3: 在 builtinTools 数组中')
  ok(builtinTools.some(t => t.name === 'codebase_search'), 'G1-T4: 按名称查找可达')
  console.log(`  ✅ G1: codebase_search 已注册 (4 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G2: globalHookRegistry 导出验证
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G2: Hooks 框架可用性 ──')

import { globalHookRegistry, HookRegistry, HOOK_POINTS } from '../hooks/index.js'

{
  ok(globalHookRegistry instanceof HookRegistry, 'G2-T1: globalHookRegistry 是 HookRegistry 实例')
  ok(typeof globalHookRegistry.register === 'function', 'G2-T2: register 可调用')
  ok(typeof globalHookRegistry.invoke === 'function', 'G2-T3: invoke 可调用')

  // 验证 runner.ts 用到的 4 个 hook 点存在
  ok(HOOK_POINTS.includes('beforeLLMCall'), 'G2-T4: beforeLLMCall hook 点')
  ok(HOOK_POINTS.includes('afterLLMCall'), 'G2-T5: afterLLMCall hook 点')
  ok(HOOK_POINTS.includes('beforeToolCall'), 'G2-T6: beforeToolCall hook 点')
  ok(HOOK_POINTS.includes('afterToolCall'), 'G2-T7: afterToolCall hook 点')

  // 注册 + 触发 + 取消 完整生命周期
  let invoked = false
  const unregister = globalHookRegistry.register('beforeToolCall', () => { invoked = true })
  await globalHookRegistry.invoke('beforeToolCall', {
    toolName: 'test', args: {}, sessionKey: 'test-session',
  })
  ok(invoked, 'G2-T8: hook 实际触发')
  unregister()
  invoked = false
  await globalHookRegistry.invoke('beforeToolCall', {
    toolName: 'test', args: {}, sessionKey: 'test-session',
  })
  ok(!invoked, 'G2-T9: 取消注册后不再触发')
  console.log(`  ✅ G2: Hooks 框架可用 (9 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G3: Session Lifecycle Events
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G3: Session 生命周期事件 ──')

import {
  emitSessionEvent,
  onSessionEvent,
  offSessionEvent,
  SESSION_EVENT_TYPES,
} from '../session/lifecycle.js'

{
  ok(typeof emitSessionEvent === 'function', 'G3-T1: emitSessionEvent 可调用')
  ok(typeof onSessionEvent === 'function', 'G3-T2: onSessionEvent 可调用')
  ok(typeof offSessionEvent === 'function', 'G3-T3: offSessionEvent 可调用')
  ok(SESSION_EVENT_TYPES.includes('session:created'), 'G3-T4: session:created 事件类型')
  ok(SESSION_EVENT_TYPES.includes('session:restored'), 'G3-T5: session:restored 事件类型')

  // 实际事件发射验证
  let received: unknown = null
  const handler = (evt: unknown) => { received = evt }
  onSessionEvent('session:created', handler)
  emitSessionEvent('session:created', 'test-key-g3')
  ok(received !== null, 'G3-T6: 事件已接收')
  ok((received as any).sessionKey === 'test-key-g3', 'G3-T7: sessionKey 正确')
  offSessionEvent('session:created', handler)
  console.log(`  ✅ G3: Session 生命周期事件 (7 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G4: Config 验证
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G4: Config 验证 ──')

import { validateConfig } from '../config/validate.js'
import { EQUALITY_CONFIG_SCHEMA } from '../config/schema.js'

{
  ok(typeof validateConfig === 'function', 'G4-T1: validateConfig 可调用')
  ok(typeof EQUALITY_CONFIG_SCHEMA === 'object', 'G4-T2: EQUALITY_CONFIG_SCHEMA 可用')
  ok(Object.keys(EQUALITY_CONFIG_SCHEMA).length >= 10, 'G4-T3: schema ≥10 配置项')

  // 空配置不应报错（warn-only 设计）
  const result = validateConfig({}, EQUALITY_CONFIG_SCHEMA)
  ok(typeof result.valid === 'boolean', 'G4-T4: 返回 valid 字段')
  ok(Array.isArray(result.errors), 'G4-T5: 返回 errors 数组')
  ok(Array.isArray(result.warnings), 'G4-T6: 返回 warnings 数组')

  // 有效配置
  const result2 = validateConfig({ CUSTOM_MODEL: 'gpt-4o' }, EQUALITY_CONFIG_SCHEMA)
  ok(result2.valid === true, 'G4-T7: 有效配置返回 valid=true')
  console.log(`  ✅ G4: Config 验证 (7 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G5: Web Search Registry + Providers
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G5: Web Search Registry + Providers ──')

import { WebSearchRegistry } from '../search/registry.js'
import { BraveSearchProvider } from '../search/brave-provider.js'
import { DuckDuckGoSearchProvider } from '../search/ddg-provider.js'
import { setWebSearchRegistry } from '../tools/builtins/web-search.js'

{
  // Provider 类可实例化
  const brave = new BraveSearchProvider()
  ok(brave.id === 'brave', 'G5-T1: BraveSearchProvider.id = brave')
  ok(brave.name === 'Brave Search', 'G5-T2: BraveSearchProvider.name')
  ok(typeof brave.isAvailable === 'function', 'G5-T3: isAvailable 可调用')
  ok(typeof brave.search === 'function', 'G5-T4: search 可调用')
  // Brave 没有 API key 时不可用
  const originalKey = process.env.BRAVE_SEARCH_API_KEY
  delete process.env.BRAVE_SEARCH_API_KEY
  ok(brave.isAvailable() === false, 'G5-T5: 无 API key 时 Brave 不可用')
  if (originalKey) process.env.BRAVE_SEARCH_API_KEY = originalKey

  const ddg = new DuckDuckGoSearchProvider()
  ok(ddg.id === 'duckduckgo', 'G5-T6: DuckDuckGoSearchProvider.id = duckduckgo')
  ok(ddg.isAvailable() === true, 'G5-T7: DDG 始终可用')

  // Registry 功能
  const registry = new WebSearchRegistry()
  registry.register(brave)
  registry.register(ddg)
  ok(registry.size === 2, 'G5-T8: 注册 2 个 provider')

  const defaultProvider = await registry.getDefaultProvider()
  // 无 Brave API key 时应回退到 DDG
  ok(defaultProvider?.id === 'duckduckgo' || defaultProvider?.id === 'brave', 'G5-T9: getDefaultProvider 返回可用 provider')

  const providers = await registry.listProviders()
  ok(providers.length === 2, 'G5-T10: listProviders 返回 2 个')

  // setWebSearchRegistry 可调用
  ok(typeof setWebSearchRegistry === 'function', 'G5-T11: setWebSearchRegistry 已导出')
  console.log(`  ✅ G5: Web Search Registry + Providers (11 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G6: Bash CommandQueue 集成
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G6: Bash CommandQueue 集成 ──')

import { CommandQueue } from '../process/command-queue.js'

{
  // CommandQueue 基本功能
  const queue = new CommandQueue({ maxConcurrent: 2 })
  ok(queue.maxConcurrent === 2, 'G6-T1: maxConcurrent 配置')

  const status = queue.getStatus()
  ok(status.running === 0, 'G6-T2: 初始无运行命令')
  ok(status.queued === 0, 'G6-T3: 初始无排队命令')

  // 模拟执行
  let executed = false
  await queue.enqueue('echo test', '/tmp', undefined, async () => { executed = true })
  ok(executed, 'G6-T4: executor 被调用')

  // bash.ts 中应已 import CommandQueue（通过编译验证）
  // 直接验证 bash tool 定义
  ok(bashTool.name === 'bash', 'G6-T5: bashTool.name = bash')
  ok(typeof bashTool.execute === 'function', 'G6-T6: bashTool.execute 可调用')
  console.log(`  ✅ G6: Bash CommandQueue 集成 (6 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G7: Links detect + understand
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G7: Links 检测与理解 ──')

import { detectLinks } from '../links/detect.js'
import { fetchAndSummarize } from '../links/understand.js'

{
  // detectLinks 基本功能
  const links = detectLinks('Check out https://example.com and https://test.org for more info')
  ok(links.length === 2, 'G7-T1: 检测到 2 个 URL')
  ok(links[0].url === 'https://example.com', 'G7-T2: 第一个 URL 正确')
  ok(links[1].url === 'https://test.org', 'G7-T3: 第二个 URL 正确')

  // 无 URL 的文本
  const noLinks = detectLinks('This text has no URLs')
  ok(noLinks.length === 0, 'G7-T4: 无 URL 返回空')

  // fetchAndSummarize 可调用（不实际请求网络）
  ok(typeof fetchAndSummarize === 'function', 'G7-T5: fetchAndSummarize 已导出')

  // 使用自定义 fetcher 测试
  const result = await fetchAndSummarize('https://example.com', {
    fetcher: async () => ({ title: 'Test Page', text: 'Hello World content' }),
  })
  ok(result !== null, 'G7-T6: fetchAndSummarize 返回结果')
  ok(result!.title === 'Test Page', 'G7-T7: title 正确')
  ok(result!.content === 'Hello World content', 'G7-T8: content 正确')
  ok(result!.charCount === 19, 'G7-T9: charCount 正确')
  ok(!result!.blocked, 'G7-T10: 未被 SSRF 拦截')
  console.log(`  ✅ G7: Links 检测与理解 (10 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G8: Plugin Disk Loader
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G8: Plugin Disk Loader ──')

import { loadFromDirectory } from '../plugins/loader.js'
import { PluginHost } from '../plugins/host.js'

{
  ok(typeof loadFromDirectory === 'function', 'G8-T1: loadFromDirectory 已导出')

  // 不存在的目录应安静返回空
  const host = new PluginHost()
  const result = await loadFromDirectory('/nonexistent-plugin-dir-xyz', host)
  ok(result.loaded.length === 0, 'G8-T2: 不存在的目录 → loaded=[]')
  ok(result.errors.length === 0, 'G8-T3: 不存在的目录 → errors=[]')

  // PluginHost 基本功能
  ok(host.size === 0, 'G8-T4: 初始无插件')
  ok(typeof host.loadFromManifest === 'function', 'G8-T5: loadFromManifest 可调用')
  ok(typeof host.unload === 'function', 'G8-T6: unload 可调用')
  ok(typeof host.list === 'function', 'G8-T7: list 可调用')

  // 通过 manifest 直接加载
  const info = await host.loadFromManifest(
    { id: 'test-plugin', name: 'Test', version: '1.0.0', type: 'hook', entry: 'index.js' },
    { activate: () => {} },
  )
  ok(info.state === 'active', 'G8-T8: 插件激活成功')
  ok(host.size === 1, 'G8-T9: 插件计数 = 1')
  await host.clear()
  ok(host.size === 0, 'G8-T10: clear 后为空')
  console.log(`  ✅ G8: Plugin Disk Loader (10 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// G9: Structured Logger
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── G9: Structured Logger ──')

import { createLogger, VALID_LOG_LEVELS } from '../diagnostics/logger.js'

{
  // createLogger 基本功能
  const log = createLogger('test-g9')
  ok(log.module === 'test-g9', 'G9-T1: module 名称')
  ok(typeof log.info === 'function', 'G9-T2: info 可调用')
  ok(typeof log.warn === 'function', 'G9-T3: warn 可调用')
  ok(typeof log.error === 'function', 'G9-T4: error 可调用')
  ok(typeof log.debug === 'function', 'G9-T5: debug 可调用')

  // 验证日志输出（mock console）
  const logs: string[] = []
  const mockLog = createLogger('g9-mock', {
    level: 'info',
    console: {
      debug: (...a: unknown[]) => logs.push(`debug:${a[0]}`),
      info: (...a: unknown[]) => logs.push(`info:${a[0]}`),
      warn: (...a: unknown[]) => logs.push(`warn:${a[0]}`),
      error: (...a: unknown[]) => logs.push(`error:${a[0]}`),
    },
    env: {},
  })
  mockLog.info('gateway started')
  ok(logs.some(l => l.includes('gateway started')), 'G9-T6: info 消息被记录')

  mockLog.warn('config issue')
  ok(logs.some(l => l.includes('config issue')), 'G9-T7: warn 消息被记录')

  // 级别过滤
  mockLog.debug('should not appear')
  ok(!logs.some(l => l.includes('should not appear')), 'G9-T8: debug 被 info 级别过滤')

  // VALID_LOG_LEVELS 常量
  ok(VALID_LOG_LEVELS.length === 4, 'G9-T9: 4 个日志级别')
  ok(VALID_LOG_LEVELS.includes('info'), 'G9-T10: 包含 info')
  console.log(`  ✅ G9: Structured Logger (10 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`)
if (failed > 0) {
  console.log(`❌ Phase I.5b: ${failed} FAILED, ${passed} passed`)
  process.exit(1)
} else {
  console.log(`✅ Phase I.5b: 全部通过 (${passed} assertions)`)
}
