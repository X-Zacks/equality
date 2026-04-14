/**
 * Phase Q — Chat Commands 单元测试
 *
 * 覆盖：parser + registry + 全部 7 个内建指令
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
// Q1: Parser
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── Q1: Parser ──')

import { isChatCommand, parseChatCommand } from '../commands/parser.js'

{
  // isChatCommand
  ok(isChatCommand('/status') === true, 'Q1-T1: /status 是指令')
  ok(isChatCommand('/model deepseek-v3') === true, 'Q1-T2: /model 带参数是指令')
  ok(isChatCommand('Tell me a joke') === false, 'Q1-T3: 普通文本不是指令')
  ok(isChatCommand('') === false, 'Q1-T4: 空字符串不是指令')
  ok(isChatCommand('/') === false, 'Q1-T5: 单独 / 不是指令')
  ok(isChatCommand('//comment') === false, 'Q1-T6: // 开头不是指令')
  ok(isChatCommand('  /status  ') === true, 'Q1-T7: 前后有空格的指令')

  // parseChatCommand
  const p1 = parseChatCommand('/status')
  ok(p1 !== null, 'Q1-T8: /status 解析成功')
  ok(p1!.name === 'status', 'Q1-T9: name = status')
  ok(p1!.args.length === 0, 'Q1-T10: args 为空')

  const p2 = parseChatCommand('/model deepseek-v3')
  ok(p2 !== null, 'Q1-T11: /model 解析成功')
  ok(p2!.name === 'model', 'Q1-T12: name = model')
  ok(p2!.args[0] === 'deepseek-v3', 'Q1-T13: args[0] = deepseek-v3')

  const p3 = parseChatCommand('not a command')
  ok(p3 === null, 'Q1-T14: 非指令返回 null')

  const p4 = parseChatCommand('/')
  ok(p4 === null, 'Q1-T15: 空指令返回 null')

  const p5 = parseChatCommand('/HELP')
  ok(p5 !== null && p5.name === 'help', 'Q1-T16: 大写指令名自动转小写')

  console.log(`  ✅ Q1: Parser (16 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Q2: Registry
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── Q2: Registry ──')

import { ChatCommandRegistry } from '../commands/registry.js'

{
  const registry = new ChatCommandRegistry()

  // 注册
  registry.register({
    name: 'test',
    description: 'test command',
    async execute() { return { data: {}, display: 'ok' } },
  })
  ok(registry.size === 1, 'Q2-T1: size = 1')
  ok(registry.get('test') !== undefined, 'Q2-T2: get("test") 有值')
  ok(registry.list().includes('test'), 'Q2-T3: list 包含 test')

  // 替换
  registry.register({
    name: 'test',
    description: 'replaced',
    async execute() { return { data: {}, display: 'replaced' } },
  })
  ok(registry.size === 1, 'Q2-T4: 替换后 size 仍为 1')
  ok(registry.get('test')!.description === 'replaced', 'Q2-T5: 描述已更新')

  // 移除
  ok(registry.unregister('test') === true, 'Q2-T6: unregister 返回 true')
  ok(registry.size === 0, 'Q2-T7: 移除后 size = 0')
  ok(registry.get('test') === undefined, 'Q2-T8: get 返回 undefined')

  // listDetails
  registry.register({
    name: 'alpha',
    description: 'A',
    usage: '/alpha <x>',
    async execute() { return { data: {}, display: '' } },
  })
  registry.register({
    name: 'beta',
    description: 'B',
    async execute() { return { data: {}, display: '' } },
  })
  const details = registry.listDetails()
  ok(details.length === 2, 'Q2-T9: listDetails 返回 2 项')
  ok(details[0].name === 'alpha', 'Q2-T10: 按字母排序')
  ok(details[0].usage === '/alpha <x>', 'Q2-T11: usage 正确')

  // clear
  registry.clear()
  ok(registry.size === 0, 'Q2-T12: clear 后为空')

  console.log(`  ✅ Q2: Registry (12 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Q3: Builtin Commands
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── Q3: Builtin Commands ──')

import { registerBuiltins } from '../commands/builtins/index.js'
import type { ChatCommandContext } from '../commands/types.js'

const registry = new ChatCommandRegistry()
registerBuiltins(registry)

{
  // 注册验证
  ok(registry.size === 7, 'Q3-T1: 7 个内建指令已注册')
  ok(registry.get('status') !== undefined, 'Q3-T2: status 已注册')
  ok(registry.get('new') !== undefined, 'Q3-T3: new 已注册')
  ok(registry.get('reset') !== undefined, 'Q3-T4: reset 已注册')
  ok(registry.get('compact') !== undefined, 'Q3-T5: compact 已注册')
  ok(registry.get('usage') !== undefined, 'Q3-T6: usage 已注册')
  ok(registry.get('model') !== undefined, 'Q3-T7: model 已注册')
  ok(registry.get('help') !== undefined, 'Q3-T8: help 已注册')

  const baseCtx: ChatCommandContext = {
    sessionKey: 'test-session',
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'how are you' },
      { role: 'assistant', content: 'fine' },
      { role: 'tool', content: '{"result":"ok"}' },
    ],
    metadata: {
      model: 'gpt-4o',
      provider: 'copilot',
      totalInputTokens: 1500,
      totalOutputTokens: 500,
      turns: 2,
    },
    getAvailableModels: () => ['gpt-4o', 'deepseek-v3', 'qwen3-coder-plus'],
  }

  // /status
  const statusResult = await registry.get('status')!.execute([], baseCtx)
  ok(statusResult.data.messageCount === 5, 'Q3-T9: status messageCount = 5')
  ok(statusResult.data.userMessages === 2, 'Q3-T10: status userMessages = 2')
  ok(statusResult.data.model === 'gpt-4o', 'Q3-T11: status model = gpt-4o')
  ok(statusResult.display.includes('会话状态'), 'Q3-T12: status display 包含标题')

  // /new
  const newResult = await registry.get('new')!.execute([], baseCtx)
  ok(typeof newResult.data.newSessionKey === 'string', 'Q3-T13: new 返回 newSessionKey')
  ok((newResult.data.newSessionKey as string).startsWith('desktop:'), 'Q3-T14: newSessionKey 以 desktop: 开头')
  ok(newResult.data.previousSessionKey === 'test-session', 'Q3-T15: previousSessionKey 正确')

  // /reset
  const resetResult = await registry.get('reset')!.execute([], baseCtx)
  ok(resetResult.data.cleared === 5, 'Q3-T16: reset cleared = 5')
  ok(resetResult.data.action === 'reset', 'Q3-T17: reset action = reset')

  // /compact
  const compactResult = await registry.get('compact')!.execute([], baseCtx)
  ok(compactResult.data.beforeMessages === 5, 'Q3-T18: compact beforeMessages = 5')
  ok(compactResult.data.action === 'compact', 'Q3-T19: compact action = compact')

  // /usage
  const usageResult = await registry.get('usage')!.execute([], baseCtx)
  ok(usageResult.data.totalInputTokens === 1500, 'Q3-T20: usage inputTokens = 1500')
  ok(usageResult.data.totalOutputTokens === 500, 'Q3-T21: usage outputTokens = 500')
  ok(usageResult.data.totalTokens === 2000, 'Q3-T22: usage totalTokens = 2000')
  ok(usageResult.data.turns === 2, 'Q3-T23: usage turns = 2')
  ok(typeof usageResult.data.estimatedCost === 'number', 'Q3-T24: usage estimatedCost 是 number')

  // /model 无参数 → 列出可用模型
  const modelListResult = await registry.get('model')!.execute([], baseCtx)
  ok(modelListResult.data.currentModel === 'gpt-4o', 'Q3-T25: model 列表 currentModel')
  ok((modelListResult.data.available as string[]).length === 3, 'Q3-T26: model 列出 3 个可用')

  // /model deepseek-v3 → 切换
  const modelSwitchResult = await registry.get('model')!.execute(['deepseek-v3'], baseCtx)
  ok(modelSwitchResult.data.newModel === 'deepseek-v3', 'Q3-T27: model switch newModel')
  ok(modelSwitchResult.data.previousModel === 'gpt-4o', 'Q3-T28: model switch previousModel')
  ok(modelSwitchResult.data.action === 'switch_model', 'Q3-T29: model switch action')

  // /model nonexistent → 错误
  const modelBadResult = await registry.get('model')!.execute(['nonexistent'], baseCtx)
  ok(modelBadResult.data.error === 'unknown_model', 'Q3-T30: model unknown_model error')

  // /help
  const helpResult = await registry.get('help')!.execute([], baseCtx)
  ok(Array.isArray(helpResult.data.commands), 'Q3-T31: help 返回 commands 数组')
  ok((helpResult.data.commands as any[]).length === 7, 'Q3-T32: help 列出 7 个指令')
  ok(helpResult.display.includes('/status'), 'Q3-T33: help display 包含 /status')
  ok(helpResult.display.includes('/help'), 'Q3-T34: help display 包含 /help')

  console.log(`  ✅ Q3: Builtin Commands (34 assertions)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`)
if (failed > 0) {
  console.log(`❌ Phase Q: ${failed} FAILED, ${passed} passed`)
  process.exit(1)
} else {
  console.log(`✅ Phase Q: 全部通过 (${passed} assertions)`)
}
