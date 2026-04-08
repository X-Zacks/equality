/**
 * Phase N1 — HistoryLog 单元测试
 *
 * N1.8.5: ~10 断言
 * - 事件记录
 * - 节点/角色过滤
 * - Markdown 导出
 * - JSON 往返一致性
 */

import { HistoryLog } from '../orchestration/history-log.js'
import type { AgentRole } from '../orchestration/plan-types.js'

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

// ─── H1: 事件记录 ────────────────────────────────────────────────────────────

console.log('\n── H1: 事件记录 ──')
{
  const log = new HistoryLog()

  assert(log.length === 0, '初始化后事件数为 0')
  assert(log.createdAt > 0, 'createdAt 有值')

  const e1 = log.add('启动', '开始执行', { nodeId: 'N1', role: 'supervisor' })
  const e2 = log.add('节点完成', '节点 N1 成功')
  const e3 = log.add('中间步骤', '处理中', { nodeId: 'N2', role: 'developer', timestamp: 1000 })

  assert(log.length === 3, '添加 3 个事件后长度为 3')
  assert(e1.timestamp > 0, '事件 timestamp 自动设置')
  assert(e1.nodeId === 'N1', '事件 nodeId 正确')
  assert(e1.role === 'supervisor', '事件 role 正确')
  assert(e3.timestamp === 1000, '自定义 timestamp 生效')
  assert(e2.nodeId === undefined, '无 nodeId 时为 undefined')
}

// ─── H2: 过滤功能 ───────────────────────────────────────────────────────────

console.log('\n── H2: 过滤功能 ──')
{
  const log = new HistoryLog()
  log.add('A', 'detailA', { nodeId: 'N1', role: 'developer' })
  log.add('B', 'detailB', { nodeId: 'N1', role: 'tester' })
  log.add('C', 'detailC', { nodeId: 'N2', role: 'developer' })

  const nodeN1 = log.forNode('N1')
  assert(nodeN1.length === 2, 'forNode("N1") 返回 2 个事件')

  const devEvents = log.forRole('developer')
  assert(devEvents.length === 2, 'forRole("developer") 返回 2 个事件')

  const lastOne = log.last(1)
  assert(lastOne.length === 1 && lastOne[0].title === 'C', 'last(1) 返回最后一个事件')
}

// ─── H3: Markdown 导出 ──────────────────────────────────────────────────────

console.log('\n── H3: Markdown 导出 ──')
{
  const log = new HistoryLog()

  // 空日志
  const emptyMd = log.asMarkdown()
  assert(emptyMd.includes('# Plan History'), '空日志包含标题')
  assert(emptyMd.includes('No events'), '空日志包含提示文字')

  // 有事件的日志
  log.add('启动', '开始执行', { nodeId: 'N1', role: 'supervisor' })
  log.add('完成', '成功')

  const md = log.asMarkdown()
  assert(md.includes('# Plan History'), 'Markdown 包含 # Plan History 标题')
  assert(md.includes('启动'), 'Markdown 包含事件 title')
  assert(md.includes('[supervisor]'), 'Markdown 包含角色信息')
  assert(md.includes('(N1)'), 'Markdown 包含节点 ID')
}

// ─── H4: JSON 往返一致性 ────────────────────────────────────────────────────

console.log('\n── H4: JSON 往返一致性 ──')
{
  const log = new HistoryLog(12345)
  log.add('事件A', '详情A', { nodeId: 'X', role: 'architect', timestamp: 100 })
  log.add('事件B', '详情B', { timestamp: 200 })

  const json = log.toJSON()
  const parsed = JSON.parse(json)
  assert(Array.isArray(parsed.events), 'JSON 包含 events 数组')
  assert(parsed.events.length === 2, 'events 长度为 2')
  assert(parsed.createdAt === 12345, 'createdAt 保留')

  const restored = HistoryLog.fromJSON(json)
  assert(restored.length === 2, '恢复后事件数为 2')
  assert(restored.createdAt === 12345, '恢复后 createdAt 正确')
  assert(restored.events[0].title === '事件A', '恢复后第一个事件 title 正确')
  assert(restored.events[0].nodeId === 'X', '恢复后第一个事件 nodeId 正确')
  assert(restored.events[1].role === undefined, '无 role 的事件恢复后仍无 role')
}

// ─── H5: clear 清空 ────────────────────────────────────────────────────────

console.log('\n── H5: clear ──')
{
  const log = new HistoryLog()
  log.add('test', 'detail')
  assert(log.length === 1, '清空前有 1 个事件')
  log.clear()
  assert(log.length === 0, '清空后事件数为 0')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`HistoryLog 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
