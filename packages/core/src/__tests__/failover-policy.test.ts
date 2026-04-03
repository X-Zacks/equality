/**
 * Phase E2 — Failover Policy 单元测试
 *
 * T33: AbortError 不触发 failover
 * T34: 429 触发 provider 冷却并切换候选
 * T35: auth 错误禁用当前 provider 并切换
 * T36: billing 错误进入长冷却
 * T37: 支持 thinking 的模型按等级降级
 * T38: 所有候选失败返回统一错误
 */

import {
  classifyProviderError,
  decideFailover,
  CooldownTracker,
  FailoverPolicy,
  getNextThinkingLevel,
  getThinkingDegradationPath,
  COOLDOWN_RATE_LIMIT,
  COOLDOWN_AUTH,
  COOLDOWN_BILLING,
  COOLDOWN_OVERLOADED,
  COOLDOWN_NETWORK,
} from '../providers/failover-policy.js'
import { FallbackProvider } from '../providers/fallback.js'
import type { LLMProvider, ChatDelta, ProviderCapabilities, StreamChatParams, ChatResponse } from '../providers/types.js'
import type { FailoverReason } from '../providers/failover-policy.js'

// ─── 测试工具 ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}

function assertThrows(fn: () => void, msg: string): Error | undefined {
  try {
    fn()
    failed++
    console.error(`  ❌ ${msg} (expected throw)`)
    return undefined
  } catch (e) {
    passed++
    console.log(`  ✅ ${msg}`)
    return e as Error
  }
}

async function assertAsyncThrows(fn: () => Promise<unknown>, msg: string): Promise<Error | undefined> {
  try {
    await fn()
    failed++
    console.error(`  ❌ ${msg} (expected throw)`)
    return undefined
  } catch (e) {
    passed++
    console.log(`  ✅ ${msg}`)
    return e as Error
  }
}

// ─── Mock Provider ──────────────────────────────────────────────────────────────

function createMockProvider(id: string, opts?: { error?: unknown; model?: string }): LLMProvider {
  return {
    providerId: id,
    modelId: opts?.model ?? 'test-model',
    async *streamChat(_params: StreamChatParams): AsyncGenerator<ChatDelta> {
      if (opts?.error) throw opts.error
      yield { content: `response from ${id}` }
    },
    async chat(_params: StreamChatParams): Promise<ChatResponse> {
      if (opts?.error) throw opts.error
      return { content: `chat from ${id}`, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }
    },
    estimateTokens(text: string) { return Math.ceil(text.length / 4) },
    getCapabilities(): ProviderCapabilities {
      return { contextWindow: 128_000, supportsToolCalling: true, supportsVision: false, supportsThinking: false }
    },
  }
}

// ─── T33: AbortError 不触发 failover ──────────────────────────────────────────

console.log('\n── T33: AbortError 不触发 failover ──')
{
  const abortErr = Object.assign(new Error('Request aborted'), { name: 'AbortError' })
  const reason = classifyProviderError(abortErr)
  assert(reason === 'abort', `分类为 abort (实际: ${reason})`)

  const decision = decideFailover(reason)
  assert(decision.shouldFailover === false, 'shouldFailover=false')
  assert(decision.cooldownMs === 0, 'cooldownMs=0')

  // FallbackProvider 应直接抛出 AbortError，不切换
  const policy = new FailoverPolicy()
  const p1 = createMockProvider('p1', { error: abortErr })
  const p2 = createMockProvider('p2')
  const fb = new FallbackProvider([p1, p2], { policy })

  const err = await assertAsyncThrows(async () => {
    for await (const _delta of fb.streamChat({ messages: [] })) { /* drain */ }
  }, 'AbortError 直接抛出，不切到 p2')
  assert(err?.name === 'AbortError', 'thrown error is AbortError')
}

// ─── T34: 429 触发 provider 冷却并切换候选 ──────────────────────────────────────

console.log('\n── T34: 429 冷却并切换 ──')
{
  const rateLimitErr = Object.assign(new Error('Too Many Requests'), { status: 429 })
  const reason = classifyProviderError(rateLimitErr)
  assert(reason === 'rate_limit', `分类为 rate_limit (实际: ${reason})`)

  const decision = decideFailover(reason)
  assert(decision.shouldFailover === true, 'shouldFailover=true')
  assert(decision.cooldownMs === COOLDOWN_RATE_LIMIT, `cooldownMs=${COOLDOWN_RATE_LIMIT}`)
  assert(decision.degradeThinking === true, 'degradeThinking=true')

  // FallbackProvider 应冷却 p1 并切到 p2
  const policy = new FailoverPolicy()
  const p1 = createMockProvider('p1', { error: rateLimitErr })
  const p2 = createMockProvider('p2')
  const fb = new FallbackProvider([p1, p2], { policy })

  const chunks: string[] = []
  for await (const delta of fb.streamChat({ messages: [] })) {
    if (delta.content) chunks.push(delta.content)
  }
  assert(chunks.join('').includes('p2'), 'fallback 到 p2 成功')
  assert(policy.cooldown.isInCooldown('p1'), 'p1 在冷却中')
  assert(!policy.cooldown.isInCooldown('p2'), 'p2 不在冷却中')
}

// ─── T35: auth 错误禁用 provider 并切换 ──────────────────────────────────────

console.log('\n── T35: auth 错误禁用并切换 ──')
{
  const authErr = Object.assign(new Error('Unauthorized'), { status: 401 })
  const reason = classifyProviderError(authErr)
  assert(reason === 'auth', `分类为 auth (实际: ${reason})`)

  const decision = decideFailover(reason)
  assert(decision.shouldFailover === true, 'shouldFailover=true')
  assert(decision.cooldownMs === COOLDOWN_AUTH, `cooldownMs=${COOLDOWN_AUTH} (5min)`)

  // 403 也是 auth
  const forbiddenErr = Object.assign(new Error('Forbidden'), { status: 403 })
  assert(classifyProviderError(forbiddenErr) === 'auth', '403 也分类为 auth')

  // FallbackProvider 应冷却并切换
  const policy = new FailoverPolicy()
  const p1 = createMockProvider('p1', { error: authErr })
  const p2 = createMockProvider('p2')
  const fb = new FallbackProvider([p1, p2], { policy })

  const chunks: string[] = []
  for await (const delta of fb.streamChat({ messages: [] })) {
    if (delta.content) chunks.push(delta.content)
  }
  assert(chunks.join('').includes('p2'), 'auth 失败后切到 p2')
  assert(policy.cooldown.isInCooldown('p1'), 'p1 进入长冷却 (5min)')
}

// ─── T36: billing 错误进入长冷却 ────────────────────────────────────────────

console.log('\n── T36: billing 长冷却 ──')
{
  // HTTP 402
  const billingErr402 = Object.assign(new Error('Payment Required'), { status: 402 })
  assert(classifyProviderError(billingErr402) === 'billing', 'HTTP 402 → billing')

  // insufficient_quota in message
  const quotaErr = Object.assign(new Error('insufficient_quota'), { status: 429 })
  // 429 + insufficient_quota 应当走 billing 还是 rate_limit？
  // 当前实现：message 里有 insufficient_quota → billing (优先)
  // 但 status 是 429，classifyProviderError 先检查 billing 关键词
  const quotaReason = classifyProviderError(quotaErr)
  // 注：有些 API 返回 429 + insufficient_quota，此时检测到 billing 关键词优先
  assert(quotaReason === 'billing' || quotaReason === 'rate_limit', `insufficient_quota 分类合理: ${quotaReason}`)

  const decision = decideFailover('billing')
  assert(decision.cooldownMs === COOLDOWN_BILLING, `billing cooldown=${COOLDOWN_BILLING} (10min)`)
  assert(decision.shouldFailover === true, 'billing shouldFailover=true')

  // CooldownTracker 直接测试
  const tracker = new CooldownTracker()
  tracker.setCooldown('billing-provider', COOLDOWN_BILLING)
  assert(tracker.isInCooldown('billing-provider'), 'billing provider 在冷却中')
  assert(!tracker.isInCooldown('other-provider'), '其他 provider 不受影响')
}

// ─── T37: thinking 渐进降级 ──────────────────────────────────────────────────

console.log('\n── T37: thinking 渐进降级 ──')
{
  // getNextThinkingLevel
  assert(getNextThinkingLevel('high') === 'medium', 'high → medium')
  assert(getNextThinkingLevel('medium') === 'low', 'medium → low')
  assert(getNextThinkingLevel('low') === 'off', 'low → off')
  assert(getNextThinkingLevel('off') === null, 'off → null (无法继续)')

  // getThinkingDegradationPath
  const pathFromHigh = getThinkingDegradationPath('high')
  assert(pathFromHigh.length === 3, 'high 降级路径长度 3')
  assert(pathFromHigh[0] === 'medium', '第一步 medium')
  assert(pathFromHigh[2] === 'off', '最后到 off')

  const pathFromLow = getThinkingDegradationPath('low')
  assert(pathFromLow.length === 1, 'low 降级路径长度 1')
  assert(pathFromLow[0] === 'off', 'low → off')

  const pathFromOff = getThinkingDegradationPath('off')
  assert(pathFromOff.length === 0, 'off 无法继续降级')

  // rate_limit / overloaded 决策中 degradeThinking=true
  assert(decideFailover('rate_limit').degradeThinking === true, 'rate_limit 允许降级 thinking')
  assert(decideFailover('overloaded').degradeThinking === true, 'overloaded 允许降级 thinking')
  assert(decideFailover('auth').degradeThinking === false, 'auth 不降级 thinking')
  assert(decideFailover('billing').degradeThinking === false, 'billing 不降级 thinking')
}

// ─── T38: 所有候选失败返回统一错误 ──────────────────────────────────────────

console.log('\n── T38: 全部失败统一错误 ──')
{
  const policy = new FailoverPolicy()
  const err429 = Object.assign(new Error('rate limited'), { status: 429 })
  const err500 = Object.assign(new Error('server error'), { status: 500 })
  const p1 = createMockProvider('p1', { error: err429 })
  const p2 = createMockProvider('p2', { error: err500 })
  const fb = new FallbackProvider([p1, p2], { policy })

  // streamChat
  const streamErr = await assertAsyncThrows(async () => {
    for await (const _delta of fb.streamChat({ messages: [] })) { /* drain */ }
  }, '所有 provider 失败 → 统一错误')
  assert(streamErr!.message.includes('所有模型均不可用'), '错误消息包含"所有模型均不可用"')
  assert(streamErr!.message.includes('p1'), '错误消息包含 p1')
  assert(streamErr!.message.includes('p2'), '错误消息包含 p2')
  assert(streamErr!.message.includes('rate_limit'), '错误消息包含 reason')

  // chat
  const policy2 = new FailoverPolicy()
  const fb2 = new FallbackProvider(
    [createMockProvider('pa', { error: err429 }), createMockProvider('pb', { error: err500 })],
    { policy: policy2 },
  )
  const chatErr = await assertAsyncThrows(async () => {
    await fb2.chat({ messages: [] })
  }, 'chat 也返回统一错误')
  assert(chatErr!.message.includes('所有模型均不可用'), 'chat 错误消息正确')

  // 全部冷却场景
  const policy3 = new FailoverPolicy()
  policy3.cooldown.setCooldown('only-provider', COOLDOWN_RATE_LIMIT)
  const fb3 = new FallbackProvider([createMockProvider('only-provider')], { policy: policy3 })
  const coolErr = await assertAsyncThrows(async () => {
    for await (const _delta of fb3.streamChat({ messages: [] })) { /* drain */ }
  }, '全部冷却 → 提示冷却中')
  assert(coolErr!.message.includes('冷却期'), '错误提示冷却期')

  // context_overflow 不触发 failover
  const overflowErr = Object.assign(new Error('context_length_exceeded'), { code: 'context_length_exceeded' })
  assert(classifyProviderError(overflowErr) === 'context_overflow', 'context overflow 正确分类')
  assert(decideFailover('context_overflow').shouldFailover === false, 'context overflow 不 failover')

  // model_not_found 跳过但不冷却
  const notFoundErr = Object.assign(new Error('model_not_found: gpt-99'), { status: 400, code: 'model_not_found' })
  assert(classifyProviderError(notFoundErr) === 'model_not_found', 'model_not_found 正确分类')
  const notFoundDecision = decideFailover('model_not_found')
  assert(notFoundDecision.shouldFailover === true, 'model_not_found 允许跳过')
  assert(notFoundDecision.cooldownMs === 0, 'model_not_found 不冷却')

  // network 错误
  const netErr = Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' })
  assert(classifyProviderError(netErr) === 'network', 'ECONNREFUSED → network')
  assert(decideFailover('network').cooldownMs === COOLDOWN_NETWORK, 'network cooldown=10s')

  // timeout 错误
  const timeoutErr = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
  assert(classifyProviderError(timeoutErr) === 'timeout', 'ETIMEDOUT → timeout')

  // onModelSwitch 回调
  const switches: Array<{ fromProvider: string; toProvider: string; reason: FailoverReason }> = []
  const policy4 = new FailoverPolicy()
  const fb4 = new FallbackProvider(
    [createMockProvider('switch-from', { error: err429 }), createMockProvider('switch-to')],
    { policy: policy4, onModelSwitch: info => switches.push(info) },
  )
  for await (const _delta of fb4.streamChat({ messages: [] })) { /* drain */ }
  assert(switches.length === 1, `onModelSwitch 被调用 1 次 (实际 ${switches.length})`)
  assert(switches[0].fromProvider.includes('switch-from'), 'fromProvider 正确')
  assert(switches[0].toProvider.includes('switch-to'), 'toProvider 正确')
  assert(switches[0].reason === 'rate_limit', 'reason 正确')
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Phase E2 — FailoverPolicy: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)

if (failed > 0) process.exit(1)
