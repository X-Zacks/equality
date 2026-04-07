/**
 * Phase I 测试：多角色与诊断
 *
 * I1: Tool Catalog & Profiles  — 10 个测试
 * I2: Agent Scoping            — 9 个测试
 * I3: Security Audit           — 7 个测试
 * I4: Cache Trace              — 9 个测试
 */

import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// ─── I1: Tool Catalog & Profiles ────────────────────────────────────────────

import {
  resolveCoreToolProfilePolicy,
  listCoreToolSections,
  isKnownCoreToolId,
  resolveCoreToolProfiles,
  CORE_TOOL_GROUPS,
  PROFILE_OPTIONS,
} from '../tools/catalog.js'

async function testI1_T1_listCoreToolSections() {
  console.log('  I1-T1: listCoreToolSections 返回分组')

  const sections = listCoreToolSections()
  assert.ok(sections.length >= 5, `至少 5 个 section (实际 ${sections.length})`)

  const fsSection = sections.find((s) => s.id === 'fs')
  assert.ok(fsSection, 'fs section 存在')
  assert.ok(fsSection!.tools.length >= 4, `fs 至少 4 工具 (实际 ${fsSection!.tools.length})`)

  const runtimeSection = sections.find((s) => s.id === 'runtime')
  assert.ok(runtimeSection, 'runtime section 存在')

  console.log(`    ✅ (4 assertions, ${sections.length} sections)`)
}

async function testI1_T2_isKnownCoreToolId() {
  console.log('  I1-T2: isKnownCoreToolId')

  assert.ok(isKnownCoreToolId('read_file'), 'read_file 已知')
  assert.ok(isKnownCoreToolId('bash'), 'bash 已知')
  assert.ok(isKnownCoreToolId('web_search'), 'web_search 已知')
  assert.ok(!isKnownCoreToolId('unknown_xyz'), 'unknown_xyz 未知')
  assert.ok(!isKnownCoreToolId(''), '空字符串未知')

  console.log('    ✅ (5 assertions)')
}

async function testI1_T3_codingProfile() {
  console.log('  I1-T3: coding profile 包含 read/write/exec')

  const policy = resolveCoreToolProfilePolicy('coding')
  assert.ok(policy, 'coding 有策略')
  assert.ok(policy!.allow, 'coding 有 allow 列表')
  assert.ok(policy!.allow!.includes('read_file'), 'coding 含 read_file')
  assert.ok(policy!.allow!.includes('write_file'), 'coding 含 write_file')
  assert.ok(policy!.allow!.includes('bash'), 'coding 含 bash')
  assert.ok(policy!.allow!.includes('web_search'), 'coding 含 web_search')

  console.log(`    ✅ (6 assertions, coding allow: ${policy!.allow!.length} tools)`)
}

async function testI1_T4_minimalProfile() {
  console.log('  I1-T4: minimal profile')

  const policy = resolveCoreToolProfilePolicy('minimal')
  // minimal 可能为空 allow（没有工具标记为 minimal）或有少量
  // 当前设计中 minimal 没有任何工具，所以 allow=[]
  assert.ok(policy !== undefined, 'minimal 返回策略（非 undefined）')
  assert.ok(Array.isArray(policy!.allow), 'minimal 有 allow 数组')

  console.log(`    ✅ (2 assertions, minimal allow: ${policy!.allow?.length ?? 0} tools)`)
}

async function testI1_T5_messagingProfile() {
  console.log('  I1-T5: messaging profile 包含 subagent_list')

  const policy = resolveCoreToolProfilePolicy('messaging')
  assert.ok(policy, 'messaging 有策略')
  assert.ok(policy!.allow!.includes('subagent_list'), 'messaging 含 subagent_list')

  console.log(`    ✅ (2 assertions)`)
}

async function testI1_T6_fullProfile() {
  console.log('  I1-T6: full profile 返回 undefined（不过滤）')

  const policy = resolveCoreToolProfilePolicy('full')
  assert.equal(policy, undefined, 'full → undefined')

  console.log('    ✅ (1 assertion)')
}

async function testI1_T7_unknownProfile() {
  console.log('  I1-T7: unknown profile 返回 undefined')

  assert.equal(resolveCoreToolProfilePolicy('nonexistent'), undefined)
  assert.equal(resolveCoreToolProfilePolicy(undefined), undefined)
  assert.equal(resolveCoreToolProfilePolicy(''), undefined)

  console.log('    ✅ (3 assertions)')
}

async function testI1_T8_toolGroups() {
  console.log('  I1-T8: group:fs 包含正确工具')

  const fsGroup = CORE_TOOL_GROUPS['group:fs']
  assert.ok(fsGroup, 'group:fs 存在')
  assert.ok(fsGroup.includes('read_file'), 'group:fs 含 read_file')
  assert.ok(fsGroup.includes('write_file'), 'group:fs 含 write_file')
  assert.ok(fsGroup.includes('edit_file'), 'group:fs 含 edit_file')

  console.log(`    ✅ (4 assertions, group:fs: ${fsGroup.length} tools)`)
}

async function testI1_T9_resolveCoreToolProfiles() {
  console.log('  I1-T9: resolveCoreToolProfiles')

  const profiles = resolveCoreToolProfiles('bash')
  assert.ok(profiles.includes('coding'), 'bash 在 coding profile')
  assert.deepEqual(resolveCoreToolProfiles('nonexistent'), [], '未知工具返回空数组')

  console.log('    ✅ (2 assertions)')
}

async function testI1_T10_profileOptions() {
  console.log('  I1-T10: PROFILE_OPTIONS')

  assert.equal(PROFILE_OPTIONS.length, 4, '4 个 profile')
  assert.equal(PROFILE_OPTIONS[0].id, 'minimal')
  assert.equal(PROFILE_OPTIONS[3].id, 'full')

  console.log('    ✅ (3 assertions)')
}

// ─── I1: ToolRegistry profile 过滤 ─────────────────────────────────────────

import { ToolRegistry } from '../tools/registry.js'

async function testI1_T11_registryProfileFilter() {
  console.log('  I1-T11: getToolSchemas 带 profile 过滤')

  const registry = new ToolRegistry()
  // 注册几个假工具
  const makeTool = (name: string) => ({
    name,
    description: `Tool ${name}`,
    inputSchema: { type: 'object' as const, properties: {} },
    execute: async () => ({ content: 'ok' }),
  })

  registry.register(makeTool('read_file'))
  registry.register(makeTool('write_file'))
  registry.register(makeTool('bash'))
  registry.register(makeTool('subagent_list'))

  // 无 profile → 全部
  const all = registry.getToolSchemas()
  assert.equal(all.length, 4, '无 profile 返回全部')

  // coding → read_file, write_file, bash, subagent_list 不一定全在 coding
  // 但 read_file, write_file, bash 都在 coding
  const coding = registry.getToolSchemas({ profile: 'coding' })
  const codingNames = coding.map((s) => s.function.name)
  assert.ok(codingNames.includes('read_file'), 'coding 含 read_file')
  assert.ok(codingNames.includes('bash'), 'coding 含 bash')

  // messaging → subagent_list 在 messaging，但 read_file 不在
  const messaging = registry.getToolSchemas({ profile: 'messaging' })
  const msgNames = messaging.map((s) => s.function.name)
  assert.ok(msgNames.includes('subagent_list'), 'messaging 含 subagent_list')
  assert.ok(!msgNames.includes('read_file'), 'messaging 不含 read_file')

  // full → 全部（undefined policy）
  const full = registry.getToolSchemas({ profile: 'full' })
  assert.equal(full.length, 4, 'full 返回全部')

  console.log('    ✅ (6 assertions)')
}

// ─── I2: Agent Scoping ──────────────────────────────────────────────────────

import {
  listAgentIds,
  resolveDefaultAgentId,
  resolveAgentIdFromSessionKey,
  resolveAgentConfig,
  resolveAgentEffectiveModel,
  normalizeAgentId,
  DEFAULT_AGENT_ID,
} from '../config/agent-scope.js'
import type { EqualityConfig } from '../config/agent-types.js'

const testConfig: EqualityConfig = {
  agents: {
    defaults: { model: 'gpt-4o', workspace: '~/workspace' },
    list: [
      { id: 'coder', name: 'Coding Agent', model: 'claude-sonnet', default: true, identity: '你是一个专业的编码助手。' },
      { id: 'translator', name: 'Translation Agent', workspace: '~/translations' },
      { id: 'ops', name: 'Ops Agent', model: 'gpt-4o-mini' },
    ],
  },
}

async function testI2_T1_listAgentIds() {
  console.log('  I2-T1: listAgentIds')

  const ids = listAgentIds(testConfig)
  assert.deepEqual(ids, ['coder', 'translator', 'ops'])

  const empty = listAgentIds({})
  assert.deepEqual(empty, ['default'])

  const noList = listAgentIds({ agents: {} })
  assert.deepEqual(noList, ['default'])

  console.log('    ✅ (3 assertions)')
}

async function testI2_T2_resolveDefaultAgentId() {
  console.log('  I2-T2: resolveDefaultAgentId')

  // coder 标记为 default:true
  assert.equal(resolveDefaultAgentId(testConfig), 'coder')

  // 无 default 选第一个
  const noDefault: EqualityConfig = {
    agents: { list: [{ id: 'alpha' }, { id: 'beta' }] },
  }
  assert.equal(resolveDefaultAgentId(noDefault), 'alpha')

  // 空配置
  assert.equal(resolveDefaultAgentId({}), 'default')

  console.log('    ✅ (3 assertions)')
}

async function testI2_T3_sessionKeyParsing() {
  console.log('  I2-T3: session key 解析')

  assert.equal(resolveAgentIdFromSessionKey('agent:translator:abc123'), 'translator')
  assert.equal(resolveAgentIdFromSessionKey('agent:CODER:session1'), 'coder') // normalize
  assert.equal(resolveAgentIdFromSessionKey('desktop-main'), 'default')
  assert.equal(resolveAgentIdFromSessionKey(''), 'default')
  assert.equal(resolveAgentIdFromSessionKey(undefined), 'default')

  console.log('    ✅ (5 assertions)')
}

async function testI2_T4_resolveAgentConfig() {
  console.log('  I2-T4: resolveAgentConfig')

  const coderCfg = resolveAgentConfig(testConfig, 'coder')
  assert.ok(coderCfg, 'coder config 存在')
  assert.equal(coderCfg!.name, 'Coding Agent')
  assert.equal(coderCfg!.model, 'claude-sonnet')
  assert.equal(coderCfg!.identity, '你是一个专业的编码助手。')

  const unknown = resolveAgentConfig(testConfig, 'nonexistent')
  assert.equal(unknown, undefined, '未知 agent 返回 undefined')

  console.log('    ✅ (5 assertions)')
}

async function testI2_T5_effectiveModel() {
  console.log('  I2-T5: resolveAgentEffectiveModel')

  // coder 有自己的 model
  assert.equal(resolveAgentEffectiveModel(testConfig, 'coder'), 'claude-sonnet')

  // translator 无 model → fallback to defaults
  assert.equal(resolveAgentEffectiveModel(testConfig, 'translator'), 'gpt-4o')

  // ops 有自己的 model
  assert.equal(resolveAgentEffectiveModel(testConfig, 'ops'), 'gpt-4o-mini')

  console.log('    ✅ (3 assertions)')
}

async function testI2_T6_normalizeAgentId() {
  console.log('  I2-T6: normalizeAgentId')

  assert.equal(normalizeAgentId('CODER'), 'coder')
  assert.equal(normalizeAgentId('  MyAgent  '), 'myagent')
  assert.equal(normalizeAgentId(''), 'default')
  assert.equal(normalizeAgentId(undefined), 'default')

  console.log('    ✅ (4 assertions)')
}

// I2-T7: System prompt identity injection
import { buildSystemPrompt } from '../agent/system-prompt.js'

async function testI2_T7_identityInSystemPrompt() {
  console.log('  I2-T7: agentIdentity 注入到 system prompt')

  const withIdentity = buildSystemPrompt({ agentIdentity: '你是一个翻译专家。' })
  assert.ok(withIdentity.includes('你是一个翻译专家'), 'identity 被注入')
  assert.ok(withIdentity.includes('Agent 身份'), '有 Agent 身份 heading')

  const without = buildSystemPrompt({})
  assert.ok(!without.includes('Agent 身份'), '无 identity 时不含 heading')

  console.log('    ✅ (3 assertions)')
}

// ─── I3: Security Audit ─────────────────────────────────────────────────────

import { runSecurityAudit } from '../security/audit.js'

async function testI3_T1_basicAudit() {
  console.log('  I3-T1: 基础审计')

  const report = runSecurityAudit({})
  assert.ok(report.ts > 0, '有时间戳')
  assert.ok(report.findings.length > 0, '有发现')
  assert.ok(report.summary.info >= 0, 'summary 有 info')

  console.log(`    ✅ (3 assertions, ${report.findings.length} findings)`)
}

async function testI3_T2_sandboxEnabled() {
  console.log('  I3-T2: sandbox 启用时无 warning')

  const report = runSecurityAudit({ sandboxEnabled: true })
  const sandboxFindings = report.findings.filter((f) => f.checkId.startsWith('sandbox.'))
  assert.ok(sandboxFindings.every((f) => f.severity === 'info'), '全部 info')

  console.log('    ✅ (1 assertion)')
}

async function testI3_T3_sandboxDisabled() {
  console.log('  I3-T3: sandbox 禁用时有 warn')

  const report = runSecurityAudit({ sandboxEnabled: false })
  const warn = report.findings.find((f) => f.checkId === 'sandbox.disabled')
  assert.ok(warn, '有 sandbox.disabled')
  assert.equal(warn!.severity, 'warn')

  console.log('    ✅ (2 assertions)')
}

async function testI3_T4_dangerousToolsUnrestricted() {
  console.log('  I3-T4: 危险工具无 deny 规则')

  const report = runSecurityAudit({
    registeredTools: ['read_file', 'bash', 'web_search'],
    hasDenyRules: false,
  })
  const finding = report.findings.find((f) => f.checkId === 'tools.dangerous_unrestricted')
  assert.ok(finding, '有 tools.dangerous_unrestricted')
  assert.equal(finding!.severity, 'warn')
  assert.ok(finding!.remediation, '有 remediation')

  console.log('    ✅ (3 assertions)')
}

async function testI3_T5_summaryCount() {
  console.log('  I3-T5: summary 统计正确')

  const report = runSecurityAudit({
    sandboxEnabled: false,
    registeredTools: ['bash'],
    hasDenyRules: false,
  })

  const warnCount = report.findings.filter((f) => f.severity === 'warn').length
  assert.equal(report.summary.warn, warnCount, 'warn 计数匹配')
  assert.equal(
    report.summary.info + report.summary.warn + report.summary.critical,
    report.findings.length,
    '总数匹配',
  )

  console.log('    ✅ (2 assertions)')
}

async function testI3_T6_findingStructure() {
  console.log('  I3-T6: finding 结构完整')

  const report = runSecurityAudit({ sandboxEnabled: false })
  for (const f of report.findings) {
    assert.ok(f.checkId, 'checkId 存在')
    assert.ok(['info', 'warn', 'critical'].includes(f.severity), 'severity 合法')
    assert.ok(f.title, 'title 存在')
    assert.ok(f.detail, 'detail 存在')
  }

  console.log(`    ✅ (${report.findings.length * 4} assertions)`)
}

async function testI3_T7_proxyInsecure() {
  console.log('  I3-T7: HTTP proxy warning')

  const report = runSecurityAudit({ proxyUrl: 'http://proxy.example.com:8080' })
  const finding = report.findings.find((f) => f.checkId === 'proxy.insecure')
  assert.ok(finding, '有 proxy.insecure')

  const secure = runSecurityAudit({ proxyUrl: 'https://proxy.example.com:8080' })
  assert.ok(!secure.findings.find((f) => f.checkId === 'proxy.insecure'), 'HTTPS 无警告')

  console.log('    ✅ (2 assertions)')
}

// ─── I4: Cache Trace ────────────────────────────────────────────────────────

import { createCacheTrace, digest } from '../diagnostics/cache-trace.js'
import { sanitizeDiagnosticPayload } from '../diagnostics/redact.js'
import { createQueuedFileWriter } from '../diagnostics/queued-writer.js'

async function testI4_T1_disabledByDefault() {
  console.log('  I4-T1: 默认 disabled 返回 null')

  const trace = createCacheTrace({ env: {} })
  assert.equal(trace, null)

  console.log('    ✅ (1 assertion)')
}

async function testI4_T2_enabledViaEnv() {
  console.log('  I4-T2: env=1 启用返回 CacheTrace')

  const trace = createCacheTrace({
    env: { EQUALITY_CACHE_TRACE: '1' },
    writer: { write: () => {}, close: () => {} },
  })
  assert.ok(trace, 'trace 非 null')
  assert.equal(trace!.enabled, true)
  assert.ok(trace!.filePath.includes('cache-trace.jsonl'), 'filePath 包含文件名')

  console.log('    ✅ (3 assertions)')
}

async function testI4_T3_recordStage() {
  console.log('  I4-T3: recordStage 产生正确事件')

  const written: string[] = []
  const trace = createCacheTrace({
    env: { EQUALITY_CACHE_TRACE: '1' },
    sessionKey: 'test-session',
    provider: 'openai',
    modelId: 'gpt-4o',
    writer: { write: (data: string) => written.push(data), close: () => {} },
  })!

  trace.recordStage('session:loaded', { note: '加载完成' })
  trace.recordStage('prompt:before', { system: 'test prompt' })

  assert.equal(written.length, 2, '写入 2 个事件')

  const event1 = JSON.parse(written[0])
  assert.equal(event1.stage, 'session:loaded')
  assert.equal(event1.seq, 1)
  assert.equal(event1.sessionKey, 'test-session')
  assert.equal(event1.note, '加载完成')

  const event2 = JSON.parse(written[1])
  assert.equal(event2.stage, 'prompt:before')
  assert.equal(event2.seq, 2)
  assert.ok(event2.systemDigest, '有 systemDigest')

  console.log('    ✅ (8 assertions)')
}

async function testI4_T4_seqIncrement() {
  console.log('  I4-T4: seq 递增')

  const written: string[] = []
  const trace = createCacheTrace({
    env: { EQUALITY_CACHE_TRACE: '1' },
    writer: { write: (data: string) => written.push(data), close: () => {} },
  })!

  for (let i = 0; i < 5; i++) {
    trace.recordStage('session:loaded')
  }

  assert.equal(written.length, 5)
  for (let i = 0; i < 5; i++) {
    const event = JSON.parse(written[i])
    assert.equal(event.seq, i + 1, `seq[${i}] = ${i + 1}`)
  }

  console.log('    ✅ (6 assertions)')
}

async function testI4_T5_messageSummary() {
  console.log('  I4-T5: messageCount/messageRoles 正确')

  const written: string[] = []
  const trace = createCacheTrace({
    env: { EQUALITY_CACHE_TRACE: '1' },
    writer: { write: (data: string) => written.push(data), close: () => {} },
  })!

  const messages = [
    { role: 'system', content: 'hello' },
    { role: 'user', content: 'test' },
    { role: 'assistant', content: 'reply' },
  ]

  trace.recordStage('stream:context', { messages })

  const event = JSON.parse(written[0])
  assert.equal(event.messageCount, 3)
  assert.deepEqual(event.messageRoles, ['system', 'user', 'assistant'])
  assert.ok(event.messagesDigest, 'messagesDigest 存在')
  assert.equal(event.messagesDigest.length, 64, 'SHA-256 为 64 字符 hex')

  console.log('    ✅ (4 assertions)')
}

async function testI4_T6_digest() {
  console.log('  I4-T6: digest 稳定性')

  const d1 = digest({ a: 1, b: 2 })
  const d2 = digest({ b: 2, a: 1 }) // 不同 key 顺序
  assert.equal(d1, d2, '不同 key 顺序产生相同 digest')
  assert.equal(d1.length, 64, 'SHA-256 为 64 字符')

  const d3 = digest({ a: 1, b: 3 })
  assert.notEqual(d1, d3, '不同值产生不同 digest')

  console.log('    ✅ (3 assertions)')
}

async function testI4_T7_redaction() {
  console.log('  I4-T7: 敏感数据脱敏')

  const redacted = sanitizeDiagnosticPayload({
    apiKey: 'sk-abcdef123456789',
    password: 'secret123',
    data: 'normal text',
    nested: {
      token: 'bearer-xyz-123',
      value: 42,
    },
  })

  assert.equal(redacted.apiKey, '***', 'apiKey 脱敏')
  assert.equal(redacted.password, '***', 'password 脱敏')
  assert.equal(redacted.data, 'normal text', '普通数据不变')
  assert.equal((redacted.nested as Record<string, unknown>).token, '***', 'nested token 脱敏')
  assert.equal((redacted.nested as Record<string, unknown>).value, 42, 'nested value 不变')

  console.log('    ✅ (5 assertions)')
}

async function testI4_T8_customFilePath() {
  console.log('  I4-T8: custom filePath')

  const trace = createCacheTrace({
    env: {
      EQUALITY_CACHE_TRACE: '1',
      EQUALITY_CACHE_TRACE_FILE: '/tmp/custom-trace.jsonl',
    },
    writer: { write: () => {}, close: () => {} },
  })

  assert.ok(trace)
  assert.equal(trace!.filePath, '/tmp/custom-trace.jsonl')

  console.log('    ✅ (2 assertions)')
}

async function testI4_T9_queuedWriter() {
  console.log('  I4-T9: QueuedFileWriter 写入')

  const dir = join(tmpdir(), `equality-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, 'test-trace.jsonl')

  const writer = createQueuedFileWriter(filePath)
  writer.write('line1\n')
  writer.write('line2\n')
  writer.close()

  assert.ok(existsSync(filePath), '文件已创建')
  const content = readFileSync(filePath, 'utf-8')
  assert.ok(content.includes('line1'), '包含 line1')
  assert.ok(content.includes('line2'), '包含 line2')

  rmSync(dir, { recursive: true, force: true })

  console.log('    ✅ (3 assertions)')
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Phase I Tests ===\n')

  console.log('--- I1: Tool Catalog & Profiles ---')
  await testI1_T1_listCoreToolSections()
  await testI1_T2_isKnownCoreToolId()
  await testI1_T3_codingProfile()
  await testI1_T4_minimalProfile()
  await testI1_T5_messagingProfile()
  await testI1_T6_fullProfile()
  await testI1_T7_unknownProfile()
  await testI1_T8_toolGroups()
  await testI1_T9_resolveCoreToolProfiles()
  await testI1_T10_profileOptions()
  await testI1_T11_registryProfileFilter()

  console.log('\n--- I2: Agent Scoping ---')
  await testI2_T1_listAgentIds()
  await testI2_T2_resolveDefaultAgentId()
  await testI2_T3_sessionKeyParsing()
  await testI2_T4_resolveAgentConfig()
  await testI2_T5_effectiveModel()
  await testI2_T6_normalizeAgentId()
  await testI2_T7_identityInSystemPrompt()

  console.log('\n--- I3: Security Audit ---')
  await testI3_T1_basicAudit()
  await testI3_T2_sandboxEnabled()
  await testI3_T3_sandboxDisabled()
  await testI3_T4_dangerousToolsUnrestricted()
  await testI3_T5_summaryCount()
  await testI3_T6_findingStructure()
  await testI3_T7_proxyInsecure()

  console.log('\n--- I4: Cache Trace ---')
  await testI4_T1_disabledByDefault()
  await testI4_T2_enabledViaEnv()
  await testI4_T3_recordStage()
  await testI4_T4_seqIncrement()
  await testI4_T5_messageSummary()
  await testI4_T6_digest()
  await testI4_T7_redaction()
  await testI4_T8_customFilePath()
  await testI4_T9_queuedWriter()

  console.log('\n✅ Phase I: 全部通过')
}

main().catch((err) => {
  console.error(`\n❌ Phase I 测试失败:`, err)
  process.exit(1)
})
