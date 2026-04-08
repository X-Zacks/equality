/**
 * Phase N5 — RoleConfig + ToolPermissionContext + ExecutionRegistry 测试
 *
 * N5.7.1 + N5.7.2: ~35 断言
 */

import { getRoleConfig, listRoles, DEFAULT_ROLE_CONFIGS } from '../orchestration/role-config.js'
import type { AgentRoleConfig } from '../orchestration/role-config.js'
import {
  createPermissionContext,
  isToolBlocked,
  emptyPermissionContext,
} from '../tools/permission-context.js'
import { ExecutionRegistry } from '../orchestration/execution-registry.js'
import type { ExecutionEntry } from '../orchestration/execution-registry.js'

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

// ═══════════════════════════════════════════════════════════════════════════════
// Part 1: RoleConfig
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── RC1: 预置角色数量 ──')
{
  const roles = listRoles()
  assert(roles.length === 5, `5 个预置角色 (实际 ${roles.length})`)
  assert(roles.includes('supervisor'), '包含 supervisor')
  assert(roles.includes('architect'), '包含 architect')
  assert(roles.includes('developer'), '包含 developer')
  assert(roles.includes('tester'), '包含 tester')
  assert(roles.includes('reviewer'), '包含 reviewer')
}

console.log('\n── RC2: 加载 developer 角色 ──')
{
  const cfg = getRoleConfig('developer')
  assert(cfg.role === 'developer', 'role=developer')
  assert(cfg.identity.includes('开发'), 'identity 包含 "开发"')
  assert(cfg.toolDenyPrefixes?.includes('subagent_') === true, 'toolDenyPrefixes 包含 subagent_')
  assert(cfg.skills?.includes('project-dev-workflow') === true, 'skills 包含 project-dev-workflow')
  assert(cfg.toolProfile === 'coding', 'toolProfile=coding')
}

console.log('\n── RC3: supervisor 工具白名单 ──')
{
  const cfg = getRoleConfig('supervisor')
  assert(cfg.toolAllow !== undefined, 'supervisor 有 toolAllow')
  assert(cfg.toolAllow!.includes('subagent_spawn'), 'allow 包含 subagent_spawn')
  assert(cfg.toolDeny!.includes('bash'), 'deny 包含 bash')
  assert(cfg.maxToolLoops === 100, 'maxToolLoops=100')
}

console.log('\n── RC4: reviewer 限制 ──')
{
  const cfg = getRoleConfig('reviewer')
  assert(cfg.toolDeny!.includes('write_file'), 'deny write_file')
  assert(cfg.toolDeny!.includes('edit_file'), 'deny edit_file')
  assert(cfg.toolDeny!.includes('bash'), 'deny bash')
  assert(cfg.toolDenyPrefixes?.includes('subagent_') === true, 'deny subagent_ prefix')
}

console.log('\n── RC5: 自定义覆盖 ──')
{
  const cfg = getRoleConfig('developer', { maxToolLoops: 200, model: 'gpt-4o' })
  assert(cfg.maxToolLoops === 200, 'maxToolLoops 被覆盖为 200')
  assert(cfg.model === 'gpt-4o', 'model 被覆盖')
  assert(cfg.toolProfile === 'coding', 'toolProfile 保持默认')
  assert(cfg.toolDenyPrefixes?.includes('subagent_') === true, 'toolDenyPrefixes 保持默认')
}

console.log('\n── RC6: 未知角色 ──')
{
  let threw = false
  try {
    getRoleConfig('nonexistent' as any)
  } catch {
    threw = true
  }
  assert(threw, '未知角色抛出异常')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Part 2: ToolPermissionContext
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── PC1: 精确名称阻止 ──')
{
  const ctx = createPermissionContext({ toolDeny: ['bash', 'write_file'] })
  assert(isToolBlocked('bash', ctx) === true, 'bash 被阻止')
  assert(isToolBlocked('write_file', ctx) === true, 'write_file 被阻止')
  assert(isToolBlocked('read_file', ctx) === false, 'read_file 不被阻止')
}

console.log('\n── PC2: 前缀阻止 ──')
{
  const ctx = createPermissionContext({ toolDenyPrefixes: ['subagent_'] })
  assert(isToolBlocked('subagent_spawn', ctx) === true, 'subagent_spawn 被阻止')
  assert(isToolBlocked('subagent_list', ctx) === true, 'subagent_list 被阻止')
  assert(isToolBlocked('read_file', ctx) === false, 'read_file 不被阻止')
}

console.log('\n── PC3: 大小写不敏感 ──')
{
  const ctx = createPermissionContext({ toolDeny: ['Bash'], toolDenyPrefixes: ['MCP_'] })
  assert(isToolBlocked('BASH', ctx) === true, 'BASH 匹配 Bash')
  assert(isToolBlocked('bash', ctx) === true, 'bash 匹配 Bash')
  assert(isToolBlocked('mcp_git', ctx) === true, 'mcp_git 匹配 MCP_')
  assert(isToolBlocked('MCP_SLACK', ctx) === true, 'MCP_SLACK 匹配 MCP_')
}

console.log('\n── PC4: 空权限上下文 ──')
{
  const ctx = emptyPermissionContext()
  assert(isToolBlocked('any_tool', ctx) === false, '空上下文不阻止任何工具')
  assert(isToolBlocked('bash', ctx) === false, '空上下文不阻止 bash')
}

console.log('\n── PC5: deny + prefix 组合 ──')
{
  const ctx = createPermissionContext({
    toolDeny: ['bash'],
    toolDenyPrefixes: ['mcp_'],
  })
  assert(isToolBlocked('bash', ctx) === true, 'bash 被 deny 阻止')
  assert(isToolBlocked('mcp_git', ctx) === true, 'mcp_git 被 prefix 阻止')
  assert(isToolBlocked('read_file', ctx) === false, 'read_file 可用')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Part 3: ExecutionRegistry
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── ER1: 注册和获取 ──')
{
  const reg = new ExecutionRegistry()
  reg.register({ name: 'read_file', kind: 'tool', sourceHint: 'builtins', available: true })
  reg.register({ name: 'bash', kind: 'tool', sourceHint: 'builtins', available: true })

  assert(reg.get('read_file')?.name === 'read_file', '获取 read_file')
  assert(reg.get('nonexistent') === undefined, '不存在返回 undefined')
  assert(reg.size === 2, 'size=2')
}

console.log('\n── ER2: 按种类查询 ──')
{
  const reg = new ExecutionRegistry()
  reg.registerAll([
    { name: 'read_file', kind: 'tool', sourceHint: 'builtins', available: true },
    { name: 'write_file', kind: 'tool', sourceHint: 'builtins', available: true },
    { name: 'bash', kind: 'tool', sourceHint: 'builtins', available: true },
    { name: '/help', kind: 'command', sourceHint: 'builtins', available: true },
    { name: 'supervisor-workflow', kind: 'skill', sourceHint: 'skills/supervisor-workflow', available: true },
    { name: 'testing-workflow', kind: 'skill', sourceHint: 'skills/testing-workflow', available: true },
    { name: 'review-workflow', kind: 'skill', sourceHint: 'skills/review-workflow', available: true },
  ])

  assert(reg.getByKind('tool').length === 3, '3 个 tool')
  assert(reg.getByKind('command').length === 1, '1 个 command')
  assert(reg.getByKind('skill').length === 3, '3 个 skill')
}

console.log('\n── ER3: CommandGraph 分类 ──')
{
  const reg = new ExecutionRegistry()
  reg.registerAll([
    { name: 'read_file', kind: 'tool', sourceHint: 'builtins', available: true },
    { name: 'slack_send', kind: 'tool', sourceHint: 'plugins/slack', available: true },
    { name: 'discord_send', kind: 'tool', sourceHint: 'extensions/discord', available: false },
    { name: 'supervisor-workflow', kind: 'skill', sourceHint: 'skills/supervisor-workflow', available: true },
  ])

  const graph = reg.getGraph()
  assert(graph.builtins.length === 1, '1 builtin')
  assert(graph.plugins.length === 2, '2 plugins (slack + discord)')
  assert(graph.skills.length === 1, '1 skill')
  assert(graph.builtins[0].name === 'read_file', 'builtin = read_file')
}

console.log('\n── ER4: 可用性检查 ──')
{
  const reg = new ExecutionRegistry()
  reg.register({ name: 'tool_a', kind: 'tool', sourceHint: 'builtins', available: true })
  reg.register({ name: 'tool_b', kind: 'tool', sourceHint: 'builtins', available: false })

  assert(reg.isAvailable('tool_a') === true, 'tool_a 可用')
  assert(reg.isAvailable('tool_b') === false, 'tool_b 不可用')
  assert(reg.isAvailable('nonexistent') === false, '不存在的也不可用')
}

console.log('\n── ER5: Markdown 输出 ──')
{
  const reg = new ExecutionRegistry()
  reg.registerAll([
    { name: 'read_file', kind: 'tool', sourceHint: 'builtins', available: true, description: '读取文件' },
    { name: 'supervisor-workflow', kind: 'skill', sourceHint: 'skills/supervisor-workflow', available: true },
  ])

  const md = reg.toMarkdown()
  assert(md.includes('# Execution Registry'), '包含标题')
  assert(md.includes('read_file'), '包含 read_file')
  assert(md.includes('supervisor-workflow'), '包含 supervisor-workflow')
  assert(md.includes('Builtins'), '包含 Builtins 节')
  assert(md.includes('Skills'), '包含 Skills 节')
}

console.log('\n── ER6: 覆盖注册 ──')
{
  const reg = new ExecutionRegistry()
  reg.register({ name: 'tool_x', kind: 'tool', sourceHint: 'builtins', available: false })
  assert(reg.isAvailable('tool_x') === false, '初始不可用')
  reg.register({ name: 'tool_x', kind: 'tool', sourceHint: 'builtins', available: true })
  assert(reg.isAvailable('tool_x') === true, '覆盖后可用')
}

console.log('\n── ER7: 清空 ──')
{
  const reg = new ExecutionRegistry()
  reg.registerAll([
    { name: 'a', kind: 'tool', sourceHint: 'builtins', available: true },
    { name: 'b', kind: 'tool', sourceHint: 'builtins', available: true },
  ])
  assert(reg.size === 2, '清空前 size=2')
  reg.clear()
  assert(reg.size === 0, '清空后 size=0')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Phase N5 — RoleConfig + Permission + Registry: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
