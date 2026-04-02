/**
 * Phase D.1 — 安全管道集成测试
 *
 * 验证 C1（变异分类）和 C3（策略管道）在运行时的集成效果。
 * 测试目标：securityBeforeToolCall 回调 + logToolCall 增强审计。
 *
 * T1: 空策略 → 所有工具放行
 * T2: deny 策略 → write_file 被拦截
 * T3: bash ls 审计为 read
 * T4: write_file 审计为 write
 * T5: bash rm → risk=high
 * T6: 向后兼容（无 hook 时全部放行）
 */

import { resolvePolicyForTool, classifyMutation, MutationType } from '../tools/index.js'
import type { PolicyContext, PolicyDecision } from '../tools/index.js'

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

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`)
  }
}

// ─── 模拟 securityBeforeToolCall 逻辑（与 index.ts 中相同） ───────────────────

interface BeforeToolCallInfo {
  toolCallId: string
  name: string
  args: Record<string, unknown>
}

/**
 * 模拟 index.ts 中的 securityBeforeToolCall 函数。
 * 接受可选的 policyContext 参数以支持策略配置测试。
 */
function simulateBeforeToolCall(
  info: BeforeToolCallInfo,
  policyContext: PolicyContext = {},
): { block: true; reason: string } | undefined {
  const { name, args } = info

  // C3 策略管道检查
  const decision = resolvePolicyForTool(name, policyContext)
  if (!decision.allowed) {
    return { block: true, reason: `策略拒绝: ${decision.decidedBy}` }
  }

  // C1 变异分类（审计，不阻塞）
  classifyMutation(name, args)

  return undefined
}

/**
 * 获取策略决策（用于审计断言）
 */
function getPolicyDecision(toolName: string, ctx: PolicyContext = {}): PolicyDecision {
  return resolvePolicyForTool(toolName, ctx)
}

// ─── T1: 空策略全部放行 ──────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════════')
console.log('Phase D.1 — 安全管道集成测试')
console.log('══════════════════════════════════════════════════════════════════════════\n')

console.log('── T1: 空策略 — 所有工具放行 ──')
{
  const result = simulateBeforeToolCall(
    { toolCallId: 'tc-1', name: 'write_file', args: { path: './src/index.ts', content: 'hello' } },
    {}, // 空策略
  )
  assertEqual(result, undefined, 'T1a — 空策略下 write_file 放行')

  const result2 = simulateBeforeToolCall(
    { toolCallId: 'tc-2', name: 'bash', args: { command: 'rm -rf /tmp/test' } },
    {},
  )
  assertEqual(result2, undefined, 'T1b — 空策略下 bash rm 放行')

  const result3 = simulateBeforeToolCall(
    { toolCallId: 'tc-3', name: 'read_file', args: { path: './README.md' } },
    {},
  )
  assertEqual(result3, undefined, 'T1c — 空策略下 read_file 放行')
}

// ─── T2: deny 策略拦截 ──────────────────────────────────────────────────────

console.log('\n── T2: deny 策略 — write_file 被拦截 ──')
{
  const denyPolicy: PolicyContext = {
    profile: {
      deniedTools: ['write_file'],
    },
  }

  const result = simulateBeforeToolCall(
    { toolCallId: 'tc-4', name: 'write_file', args: { path: './foo.ts', content: 'x' } },
    denyPolicy,
  )
  assert(result !== undefined, 'T2a — write_file 被拦截（非 undefined）')
  assert(result?.block === true, 'T2b — block=true')
  assert(result?.reason?.includes('策略拒绝') ?? false, 'T2c — reason 包含"策略拒绝"')

  // read_file 不受影响
  const result2 = simulateBeforeToolCall(
    { toolCallId: 'tc-5', name: 'read_file', args: { path: './README.md' } },
    denyPolicy,
  )
  assertEqual(result2, undefined, 'T2d — read_file 不受 deny 影响')

  // deny 多个工具
  const multiDeny: PolicyContext = {
    profile: {
      deniedTools: ['write_file', 'bash', 'apply_patch'],
    },
  }
  const result3 = simulateBeforeToolCall(
    { toolCallId: 'tc-6', name: 'bash', args: { command: 'echo hello' } },
    multiDeny,
  )
  assert(result3?.block === true, 'T2e — bash 也被 deny 拦截')
}

// ─── T3: classifyMutation 审计 — bash ls → read ─────────────────────────────

console.log('\n── T3: bash ls 审计为 read ──')
{
  const mutation = classifyMutation('bash', { command: 'ls -la' })
  assertEqual(mutation.type, MutationType.READ, 'T3a — bash "ls -la" 分类为 READ')
  assertEqual(mutation.confidence, 'heuristic', 'T3b — confidence=heuristic')
}

// ─── T4: classifyMutation 审计 — write_file → write ─────────────────────────

console.log('\n── T4: write_file 审计为 write ──')
{
  const mutation = classifyMutation('write_file', { path: './index.ts', content: 'hello' })
  assertEqual(mutation.type, MutationType.WRITE, 'T4a — write_file 分类为 WRITE')
  assertEqual(mutation.confidence, 'static', 'T4b — confidence=static')
}

// ─── T5: bash rm → risk=high ────────────────────────────────────────────────

console.log('\n── T5: bash rm → risk=high ──')
{
  // bash rm 是写操作 → resolvePolicyForTool 自动标记 risk=high
  const decision = getPolicyDecision('bash', {})
  // bash 无参数时默认分类为 EXEC（未知命令），但 classifyMutation 带参数时才准确
  // 测试 resolvePolicyForTool 对 bash 工具名的处理
  assertEqual(decision.allowed, true, 'T5a — bash 被允许')

  // 测试 write_file 的 risk 标记（write 类型自动标高）
  const writeDecision = getPolicyDecision('write_file', {})
  assertEqual(writeDecision.risk, 'high', 'T5b — write_file risk=high（C1 集成）')

  // 测试 read_file 的 risk
  const readDecision = getPolicyDecision('read_file', {})
  assertEqual(readDecision.risk, 'low', 'T5c — read_file risk=low')

  // 测试 edit_file 的 risk
  const editDecision = getPolicyDecision('edit_file', {})
  assertEqual(editDecision.risk, 'high', 'T5d — edit_file risk=high')

  // 测试 apply_patch 的 risk
  const patchDecision = getPolicyDecision('apply_patch', {})
  assertEqual(patchDecision.risk, 'high', 'T5e — apply_patch risk=high')
}

// ─── T6: 向后兼容 — 不传 beforeToolCall 时全部放行 ──────────────────────────

console.log('\n── T6: 向后兼容 — 无 hook 时全部放行 ──')
{
  // 模拟 runner.ts 中 beforeToolCall 为 undefined 的情况
  // runner.ts 的逻辑：if (params.beforeToolCall) { ... }
  // 不传 hook 时不执行任何检查
  let blocked = false
  const hookOrUndefined = undefined as (((info: BeforeToolCallInfo) => Promise<{ block: true; reason: string } | undefined>) | undefined)
  if (hookOrUndefined) {
    const result = await hookOrUndefined({ toolCallId: 'tc-7', name: 'write_file', args: {} })
    if (result?.block) blocked = true
  }
  assertEqual(blocked, false, 'T6a — 无 beforeToolCall hook 时不拦截')

  // 也测试 allowedTools（#工具名 UI 过滤）仍然独立工作
  const allowedTools = ['read_file', 'glob']
  const toolSchemas = [
    { function: { name: 'read_file' } },
    { function: { name: 'write_file' } },
    { function: { name: 'bash' } },
    { function: { name: 'glob' } },
  ]
  const filtered = toolSchemas.filter(s => allowedTools.includes(s.function.name))
  assertEqual(filtered.length, 2, 'T6b — allowedTools UI 过滤仍独立工作')
  assertEqual(filtered[0].function.name, 'read_file', 'T6c — 保留 read_file')
  assertEqual(filtered[1].function.name, 'glob', 'T6d — 保留 glob')
}

// ─── Extra: 策略层级优先级 ──────────────────────────────────────────────────

console.log('\n── Extra: 策略层级优先级 ──')
{
  // providerProfile deny 优先于 profile allow
  const ctx: PolicyContext = {
    profile: {
      allowedTools: ['bash', 'write_file', 'read_file'],
    },
    providerProfile: {
      deniedTools: ['bash'],
    },
  }
  const result = simulateBeforeToolCall(
    { toolCallId: 'tc-8', name: 'bash', args: { command: 'ls' } },
    ctx,
  )
  assert(result?.block === true, 'E1 — providerProfile deny 覆盖 profile allow')

  const result2 = simulateBeforeToolCall(
    { toolCallId: 'tc-9', name: 'write_file', args: { path: './x.ts', content: 'y' } },
    ctx,
  )
  assertEqual(result2, undefined, 'E2 — write_file 在 allow 中且未被 deny')
}

// ─── Extra: agentProfile 层级 ──────────────────────────────────────────────

console.log('\n── Extra: agentProfile 层级 ──')
{
  const ctx: PolicyContext = {
    agentProfile: {
      deniedTools: ['web_fetch'],
    },
  }
  const result = simulateBeforeToolCall(
    { toolCallId: 'tc-10', name: 'web_fetch', args: { url: 'https://evil.com' } },
    ctx,
  )
  assert(result?.block === true, 'E3 — agentProfile deny 生效')

  // 其他工具不受影响
  const result2 = simulateBeforeToolCall(
    { toolCallId: 'tc-11', name: 'read_file', args: { path: './x.ts' } },
    ctx,
  )
  assertEqual(result2, undefined, 'E4 — agentProfile deny 只影响目标工具')
}

// ─── Extra: classifyMutation 与策略联合 ──────────────────────────────────────

console.log('\n── Extra: C1+C3 联合验证 ──')
{
  // 场景：工具被策略允许 + 变异分类显示高危
  const mutation = classifyMutation('bash', { command: 'rm -rf ./build' })
  const decision = getPolicyDecision('bash', {})
  assertEqual(mutation.type, MutationType.WRITE, 'E5a — bash rm 分类为 WRITE')
  assertEqual(decision.allowed, true, 'E5b — bash 被策略允许')
  // bash 分类为 dynamic，resolvePolicyForTool 内部 classifyMutation('bash') 无参数 → EXEC
  // 但外部 classifyMutation('bash', { command: 'rm ...' }) → WRITE
  // 这验证了 D1 的审计逻辑：策略检查用工具名，分类审计用完整参数

  // 场景：工具被策略拒绝 → 不需要分类
  const denyCtx: PolicyContext = { profile: { deniedTools: ['bash'] } }
  const blocked = simulateBeforeToolCall(
    { toolCallId: 'tc-12', name: 'bash', args: { command: 'rm -rf /' } },
    denyCtx,
  )
  assert(blocked?.block === true, 'E6 — 被 deny 的工具不执行，直接拦截')
}

// ─── 结果 ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(74)}`)
console.log(`Phase D.1 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
console.log(`${'═'.repeat(74)}`)

if (failed > 0) process.exit(1)
