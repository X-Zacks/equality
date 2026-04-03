/**
 * Phase D.2 — MCP Client 测试
 *
 * T7: McpServerConfig 解析 — 有效配置
 * T8: McpServerConfig 解析 — 缺少 command → 报错
 * T9: 工具名生成 — mcp_{server}_{tool} 格式
 * T10: MCP 工具 schema → ToolDefinition 转换
 * T11: 连接失败不阻塞启动（McpClientManager）
 * T12: 重连计数器：3 次后停止（McpClient.reconnect）
 */

import { parseMcpServersConfig, mcpToolName } from '../tools/mcp/types.js'
import { mcpToolToDefinition } from '../tools/mcp/bridge.js'
import { McpClient } from '../tools/mcp/client.js'
import { McpClientManager } from '../tools/mcp/index.js'
import { ToolRegistry } from '../tools/registry.js'
import type { McpToolDescription } from '../tools/mcp/types.js'

// ─── 辅助 ────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ─── 测试 ────────────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════════════════════════')
console.log('Phase D.2 — MCP Client 测试')
console.log('══════════════════════════════════════════════════════════════════════════')

// T7: 有效配置解析
console.log('\n── T7: McpServerConfig 解析 — 有效配置 ──')
{
  const json = JSON.stringify([
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: 'ghp_test' },
      timeout: 60000,
    },
  ])

  const configs = parseMcpServersConfig(json)
  assert(configs.length === 2, 'T7a — 解析出 2 个配置')
  assert(configs[0].name === 'filesystem', 'T7b — 第一个服务器名 filesystem')
  assert(configs[0].transport === 'stdio', 'T7c — transport = stdio')
  assert(configs[0].command === 'npx', 'T7d — command = npx')
  assert(configs[0].args!.length === 3, 'T7e — args 长度 3')
  assert(configs[1].name === 'github', 'T7f — 第二个服务器名 github')
  assert(configs[1].env!.GITHUB_TOKEN === 'ghp_test', 'T7g — env 传递')
  assert(configs[1].timeout === 60000, 'T7h — timeout 传递')

  // 无 transport → 默认 stdio
  const json2 = JSON.stringify([{ name: 'test', command: 'echo' }])
  const configs2 = parseMcpServersConfig(json2)
  assert(configs2[0].transport === 'stdio', 'T7i — 默认 transport = stdio')
}

// T8: 无效配置
console.log('\n── T8: McpServerConfig 解析 — 无效配置 ──')
{
  // 非 JSON
  let err1 = ''
  try { parseMcpServersConfig('not json') } catch (e) { err1 = (e as Error).message }
  assert(err1.includes('JSON'), 'T8a — 非 JSON → 报错提到 JSON')

  // 非数组
  let err2 = ''
  try { parseMcpServersConfig('{}') } catch (e) { err2 = (e as Error).message }
  assert(err2.includes('数组'), 'T8b — 非数组 → 报错提到数组')

  // 缺少 name
  let err3 = ''
  try { parseMcpServersConfig('[{"command": "echo"}]') } catch (e) { err3 = (e as Error).message }
  assert(err3.includes('name'), 'T8c — 缺少 name → 报错')

  // 缺少 command
  let err4 = ''
  try { parseMcpServersConfig('[{"name": "test"}]') } catch (e) { err4 = (e as Error).message }
  assert(err4.includes('command'), 'T8d — 缺少 command → 报错')

  // 不支持的 transport
  let err5 = ''
  try { parseMcpServersConfig('[{"name": "test", "command": "echo", "transport": "sse"}]') } catch (e) { err5 = (e as Error).message }
  assert(err5.includes('sse'), 'T8e — 不支持 sse transport → 报错')

  // 空数组 → OK
  const empty = parseMcpServersConfig('[]')
  assert(empty.length === 0, 'T8f — 空数组 → 返回空列表')
}

// T9: 工具名生成
console.log('\n── T9: 工具名生成 — mcp_{server}_{tool} 格式 ──')
{
  assert(mcpToolName('filesystem', 'read_file') === 'mcp_filesystem_read_file', 'T9a — 标准格式')
  assert(mcpToolName('github', 'create_issue') === 'mcp_github_create_issue', 'T9b — 下划线保留')
  assert(mcpToolName('my-tools', 'query_db') === 'mcp_my-tools_query_db', 'T9c — 中划线保留')
  assert(mcpToolName('server.test', 'foo') === 'mcp_server_test_foo', 'T9d — 点号替换为下划线')
  assert(mcpToolName('a b', 'c d') === 'mcp_a_b_c_d', 'T9e — 空格替换为下划线')
}

// T10: MCP 工具 schema → ToolDefinition 转换
console.log('\n── T10: MCP 工具 schema → ToolDefinition 转换 ──')
{
  const mcpTool: McpToolDescription = {
    name: 'query_db',
    description: 'Query the database',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute' },
        limit: { type: 'number', description: 'Max rows', default: 100 },
      },
      required: ['sql'],
    },
  }

  // 创建 mock McpClient（不实际连接）
  const mockClient = new McpClient({
    name: 'test-db',
    transport: 'stdio',
    command: 'echo',
  })

  const def = mcpToolToDefinition('test-db', mcpTool, mockClient)

  assert(def.name === 'mcp_test-db_query_db', 'T10a — 工具名格式正确')
  assert(def.description.includes('MCP:test-db'), 'T10b — description 包含服务器名')
  assert(def.description.includes('Query the database'), 'T10c — description 包含原始描述')
  assert(def.inputSchema.type === 'object', 'T10d — inputSchema.type = object')
  assert(def.inputSchema.properties.sql !== undefined, 'T10e — sql 属性存在')
  assert(def.inputSchema.properties.sql.type === 'string', 'T10f — sql 类型 string')
  assert(def.inputSchema.properties.limit !== undefined, 'T10g — limit 属性存在')
  assert(def.inputSchema.required?.includes('sql') ?? false, 'T10h — required 包含 sql')
  assert(typeof def.execute === 'function', 'T10i — execute 是函数')

  // 无 inputSchema 的工具
  const minimalTool: McpToolDescription = { name: 'ping' }
  const minDef = mcpToolToDefinition('srv', minimalTool, mockClient)
  assert(minDef.name === 'mcp_srv_ping', 'T10j — 最小工具名')
  assert(minDef.description.includes('MCP:srv'), 'T10k — 最小工具 description')
  assert(Object.keys(minDef.inputSchema.properties).length === 0, 'T10l — 无属性 → 空 properties')
}

// T11: McpClientManager — 连接失败不阻塞
console.log('\n── T11: 连接失败不阻塞启动 ──')
{
  const registry = new ToolRegistry()
  const manager = new McpClientManager(registry)

  // 使用不存在的命令，期望连接失败但不抛出
  const fakeConfig = [
    { name: 'fake-server', transport: 'stdio' as const, command: '__nonexistent_mcp_binary_xyz__' },
  ]

  let threw = false
  try {
    await manager.start(fakeConfig)
  } catch {
    threw = true
  }
  assert(!threw, 'T11a — manager.start() 不抛出异常')

  const status = manager.getStatus()
  assert(status.length === 1, 'T11b — 状态列表有 1 个条目')
  assert(status[0].status === 'error', `T11c — 状态为 error (got ${status[0].status})`)
  assert(status[0].lastError !== undefined, 'T11d — lastError 有值')
  assert(status[0].toolCount === 0, 'T11e — toolCount = 0')

  await manager.stop()
  assert(true, 'T11f — manager.stop() 正常执行')
}

// T12: 重连计数器
console.log('\n── T12: 重连计数器 — 3 次后停止 ──')
{
  const client = new McpClient({
    name: 'reconnect-test',
    transport: 'stdio',
    command: '__nonexistent_reconnect_test__',
  })

  // 尝试重连 4 次（前 3 次应返回 false，第 4 次因超过限制也返回 false）
  // 注意：每次 reconnect 会有延迟（1s/2s/4s），使用短超时的假命令
  assert(client.reconnectCount === 0, 'T12a — 初始 reconnectCount = 0')

  // 直接测试 reconnectCount 的累加逻辑
  // 由于实际重连会涉及 spawn + 延迟，我们测试关键逻辑：
  // McpClient 内部 MAX_RECONNECT = 3

  // 模拟 3 次重连
  const r1 = await client.reconnect()
  assert(!r1, 'T12b — 重连 #1 失败（命令不存在）')
  assert(client.reconnectCount === 1, 'T12c — reconnectCount = 1')

  const r2 = await client.reconnect()
  assert(!r2, 'T12d — 重连 #2 失败')
  assert(client.reconnectCount === 2, 'T12e — reconnectCount = 2')

  const r3 = await client.reconnect()
  assert(!r3, 'T12f — 重连 #3 失败')
  assert(client.reconnectCount === 3, 'T12g — reconnectCount = 3')

  // 第 4 次应该直接放弃（不再尝试）
  const r4 = await client.reconnect()
  assert(!r4, 'T12h — 重连 #4 直接放弃')
  assert(client.reconnectCount === 3, 'T12i — reconnectCount 不再增加，仍为 3')
}

// ── 结果汇总 ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════════')
console.log(`Phase D.2 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
console.log('══════════════════════════════════════════════════════════════════════════')

if (failed > 0) process.exit(1)
