/**
 * Phase N1 — PlanDAG 单元测试
 *
 * N1.8.1: ~40 断言
 * - 拓扑排序
 * - 环检测
 * - 就绪节点
 * - 并发限制调度
 * - 关键路径
 * - 后代查询
 * - 验证（自引用、孤立依赖、节点数超限、环）
 * - 终止判断
 * - 状态修改辅助
 */

import { PlanDAG } from '../orchestration/plan-dag.js'
import { createPlanGraph, createPlanNode } from '../orchestration/plan-types.js'
import type { PlanGraph, PlanNode } from '../orchestration/plan-types.js'

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

/** 创建简单的测试节点 */
function node(id: string, deps: string[] = [], priority = 0): PlanNode {
  return createPlanNode({ id, role: 'developer', task: `Task ${id}`, dependsOn: deps, priority })
}

/** 创建测试 PlanGraph */
function graph(nodes: PlanNode[], opts?: { maxConcurrent?: number; maxTotalNodes?: number }): PlanGraph {
  return createPlanGraph({
    id: 'test-plan',
    title: 'Test',
    nodes,
    maxConcurrent: opts?.maxConcurrent ?? 3,
    maxTotalNodes: opts?.maxTotalNodes ?? 50,
  })
}

// ─── D1: 无环 DAG 拓扑排序 ──────────────────────────────────────────────────

console.log('\n── D1: 拓扑排序 ──')
{
  // A→B→D, A→C→D
  const g = graph([
    node('A'),
    node('B', ['A']),
    node('C', ['A']),
    node('D', ['B', 'C']),
  ])
  const dag = new PlanDAG(g)
  const sorted = dag.topologicalSort()

  assert(sorted !== null, '无环图返回非 null')
  assert(sorted!.length === 4, '排序结果包含 4 个节点')
  assert(sorted!.indexOf('A') < sorted!.indexOf('B'), 'A 在 B 之前')
  assert(sorted!.indexOf('A') < sorted!.indexOf('C'), 'A 在 C 之前')
  assert(sorted!.indexOf('B') < sorted!.indexOf('D'), 'B 在 D 之前')
  assert(sorted!.indexOf('C') < sorted!.indexOf('D'), 'C 在 D 之前')
}

// ─── D2: 单节点图 ──────────────────────────────────────────────────────────

console.log('\n── D2: 单节点图 ──')
{
  const dag = new PlanDAG(graph([node('A')]))
  const sorted = dag.topologicalSort()
  assert(sorted !== null && sorted.length === 1, '单节点拓扑排序返回 [A]')
  assert(sorted![0] === 'A', '排序结果为 A')
}

// ─── D3: 空图 ──────────────────────────────────────────────────────────────

console.log('\n── D3: 空图 ──')
{
  const dag = new PlanDAG(graph([]))
  const sorted = dag.topologicalSort()
  assert(sorted !== null && sorted.length === 0, '空图拓扑排序返回空数组')
  assert(dag.nodeCount === 0, '空图节点数为 0')
}

// ─── D4: 环检测 ─────────────────────────────────────────────────────────────

console.log('\n── D4: 环检测 ──')
{
  // A→B→C→A（环）
  const g = graph([
    node('A', ['C']),
    node('B', ['A']),
    node('C', ['B']),
  ])
  const dag = new PlanDAG(g)

  const cycle = dag.detectCycle()
  assert(cycle !== null, '有环图 detectCycle() 返回非 null')
  assert(cycle!.length >= 3, '环路径至少 3 个节点')

  const sorted = dag.topologicalSort()
  assert(sorted === null, '有环图 topologicalSort() 返回 null')
}

// ─── D5: 无环图的 detectCycle ────────────────────────────────────────────────

console.log('\n── D5: 无环图 detectCycle ──')
{
  const dag = new PlanDAG(graph([
    node('A'),
    node('B', ['A']),
    node('C', ['A']),
  ]))
  assert(dag.detectCycle() === null, '无环图 detectCycle() 返回 null')
}

// ─── D6: 就绪节点计算 ──────────────────────────────────────────────────────

console.log('\n── D6: 就绪节点计算 ──')
{
  const g = graph([
    node('A'),          // 无依赖 → 就绪
    node('B', ['A']),   // 依赖 A
    node('C', ['A']),   // 依赖 A
    node('D'),          // 无依赖 → 就绪
  ])
  // 设 A 为 completed
  g.nodes[0].status = 'completed'

  const dag = new PlanDAG(g)
  const ready = dag.getReadyNodes()

  assert(ready.length === 3, '就绪节点为 B, C, D (共 3 个)')

  const readyIds = ready.map(n => n.id)
  assert(readyIds.includes('B'), 'B 就绪（A 已完成）')
  assert(readyIds.includes('C'), 'C 就绪（A 已完成）')
  assert(readyIds.includes('D'), 'D 就绪（无依赖）')
}

// ─── D7: 就绪节点——skipped 视为完成 ─────────────────────────────────────────

console.log('\n── D7: skipped 视为完成 ──')
{
  const g = graph([
    node('A'),
    node('B', ['A']),
  ])
  g.nodes[0].status = 'skipped'

  const dag = new PlanDAG(g)
  const ready = dag.getReadyNodes()
  assert(ready.length === 1 && ready[0].id === 'B', 'A skipped 后 B 就绪')
}

// ─── D8: 就绪节点——前置未完成 ──────────────────────────────────────────────

console.log('\n── D8: 前置未完成 ──')
{
  const g = graph([
    node('A'),
    node('B', ['A']),
  ])
  // A 仍为 pending

  const dag = new PlanDAG(g)
  const ready = dag.getReadyNodes()
  assert(ready.length === 1 && ready[0].id === 'A', '只有 A 就绪（无依赖），B 不就绪')
}

// ─── D9: 并发限制调度 ──────────────────────────────────────────────────────

console.log('\n── D9: 并发限制调度 ──')
{
  const g = graph([
    node('A', [], 2),   // priority=2
    node('B', [], 0),   // priority=0 (最高)
    node('C', [], 1),   // priority=1
  ])

  const dag = new PlanDAG(g)

  // 当前 1 个 running，maxConcurrent=2 → 只能调度 1 个
  const sched1 = dag.getSchedulableNodes(1, 2)
  assert(sched1.length === 1, '有 1 个名额时返回 1 个节点')
  assert(sched1[0].id === 'B', '返回 priority 最高的 B')

  // 当前 0 个 running，maxConcurrent=2 → 调度 2 个
  const sched2 = dag.getSchedulableNodes(0, 2)
  assert(sched2.length === 2, '有 2 个名额时返回 2 个节点')
  assert(sched2[0].id === 'B', '第一个为 priority=0 的 B')
  assert(sched2[1].id === 'C', '第二个为 priority=1 的 C')

  // 满载
  const sched3 = dag.getSchedulableNodes(3, 3)
  assert(sched3.length === 0, '满载时返回空数组')
}

// ─── D10: 关键路径 ──────────────────────────────────────────────────────────

console.log('\n── D10: 关键路径 ──')
{
  // A→B→D (长度 3), A→C→D (长度 3)
  // 两条路径等长，取一条
  const g = graph([
    node('A'),
    node('B', ['A']),
    node('C', ['A']),
    node('D', ['B', 'C']),
  ])

  const dag = new PlanDAG(g)
  const cp = dag.criticalPath()
  assert(cp.length === 3, '关键路径长度为 3')
  assert(cp[0] === 'A', '关键路径起点为 A')
  assert(cp[cp.length - 1] === 'D', '关键路径终点为 D')
}

// ─── D11: 关键路径——线性链 ──────────────────────────────────────────────────

console.log('\n── D11: 关键路径——线性链 ──')
{
  const g = graph([
    node('A'),
    node('B', ['A']),
    node('C', ['B']),
  ])
  const cp = new PlanDAG(g).criticalPath()
  assert(cp.length === 3, '线性链关键路径长度为 3')
  assert(cp[0] === 'A' && cp[1] === 'B' && cp[2] === 'C', '路径为 A→B→C')
}

// ─── D12: 后代查询 ─────────────────────────────────────────────────────────

console.log('\n── D12: 后代查询 ──')
{
  // A→B→C, A→D
  const g = graph([
    node('A'),
    node('B', ['A']),
    node('C', ['B']),
    node('D', ['A']),
  ])

  const dag = new PlanDAG(g)
  const desc = dag.getDescendants('A')

  assert(desc.size === 3, 'A 的后代有 3 个')
  assert(desc.has('B'), '后代包含 B')
  assert(desc.has('C'), '后代包含 C')
  assert(desc.has('D'), '后代包含 D')

  const descB = dag.getDescendants('B')
  assert(descB.size === 1 && descB.has('C'), 'B 的后代只有 C')

  const descD = dag.getDescendants('D')
  assert(descD.size === 0, 'D 无后代')
}

// ─── D13: 验证——自引用 ──────────────────────────────────────────────────────

console.log('\n── D13: 验证——自引用 ──')
{
  const g = graph([node('A', ['A'])])
  const dag = new PlanDAG(g)
  const v = dag.validate()
  assert(!v.valid, '自引用图 valid=false')
  assert(v.errors.some(e => e.includes('depends on itself')), '错误信息包含 "depends on itself"')
}

// ─── D14: 验证——孤立依赖 ────────────────────────────────────────────────────

console.log('\n── D14: 验证——孤立依赖 ──')
{
  const g = graph([node('B', ['X'])])
  const dag = new PlanDAG(g)
  const v = dag.validate()
  assert(!v.valid, '孤立依赖图 valid=false')
  assert(v.errors.some(e => e.includes('unknown node X')), '错误信息包含 "unknown node X"')
}

// ─── D15: 验证——节点数超限 ──────────────────────────────────────────────────

console.log('\n── D15: 验证——节点数超限 ──')
{
  const nodes = Array.from({ length: 6 }, (_, i) => node(`N${i}`))
  const g = graph(nodes, { maxTotalNodes: 5 })
  const dag = new PlanDAG(g)
  const v = dag.validate()
  assert(!v.valid, '节点数超限 valid=false')
  assert(v.errors.some(e => e.includes('exceeds limit 5')), '错误信息包含 "exceeds limit 5"')
}

// ─── D16: 验证——环 ──────────────────────────────────────────────────────────

console.log('\n── D16: 验证——环 ──')
{
  const g = graph([
    node('A', ['C']),
    node('B', ['A']),
    node('C', ['B']),
  ])
  const dag = new PlanDAG(g)
  const v = dag.validate()
  assert(!v.valid, '有环图 valid=false')
  assert(v.errors.some(e => e.includes('Cycle detected')), '错误信息包含 "Cycle detected"')
}

// ─── D17: 验证——合法图 ──────────────────────────────────────────────────────

console.log('\n── D17: 验证——合法图 ──')
{
  const g = graph([node('A'), node('B', ['A']), node('C', ['A', 'B'])])
  const v = new PlanDAG(g).validate()
  assert(v.valid, '合法图 valid=true')
  assert(v.errors.length === 0, '无错误')
}

// ─── D18: 终止判断 ─────────────────────────────────────────────────────────

console.log('\n── D18: 终止判断 ──')
{
  const g = graph([node('A'), node('B', ['A'])])
  const dag = new PlanDAG(g)

  assert(!dag.isTerminated(), '初始状态非终止')

  dag.updateNodeStatus('A', 'completed')
  assert(!dag.isTerminated(), 'A 完成、B pending 非终止')

  dag.updateNodeStatus('B', 'cancelled')
  assert(dag.isTerminated(), 'A completed + B cancelled = 终止')
}

// ─── D19: stuck 检测 ────────────────────────────────────────────────────────

console.log('\n── D19: stuck 检测 ──')
{
  const g = graph([node('A'), node('B', ['A'])])
  const dag = new PlanDAG(g)

  // A pending, B 依赖 A → A 就绪 → 不 stuck
  assert(!dag.isStuck(), '有就绪节点不是 stuck')

  // A failed, B 依赖 A → B 不就绪 → stuck
  dag.updateNodeStatus('A', 'failed')
  assert(dag.isStuck(), 'A failed, B 不就绪, 无 running → stuck')
}

// ─── D20: 状态修改辅助 ─────────────────────────────────────────────────────

console.log('\n── D20: 状态修改辅助 ──')
{
  const g = graph([node('A'), node('B', ['A']), node('C', ['A'])])
  const dag = new PlanDAG(g)

  assert(dag.updateNodeStatus('A', 'completed'), 'updateNodeStatus 返回 true')
  assert(dag.getNode('A')!.status === 'completed', 'A 状态变为 completed')
  assert(!dag.updateNodeStatus('NONEXIST', 'failed'), '不存在的节点返回 false')

  const cancelled = dag.cancelDescendants('A')
  assert(cancelled.length === 2, 'A 的后代 B、C 被取消')
  assert(dag.getNode('B')!.status === 'cancelled', 'B 被取消')
  assert(dag.getNode('C')!.status === 'cancelled', 'C 被取消')
}

// ─── D21: cancelAllPending ─────────────────────────────────────────────────

console.log('\n── D21: cancelAllPending ──')
{
  const g = graph([node('A'), node('B'), node('C')])
  const dag = new PlanDAG(g)
  dag.updateNodeStatus('A', 'running')

  const cancelled = dag.cancelAllPending()
  assert(cancelled.length === 2, 'cancelAllPending 取消了 B 和 C')
  assert(dag.getNode('A')!.status === 'running', 'running 节点不受影响')
}

// ─── D22: getRunningNodes ──────────────────────────────────────────────────

console.log('\n── D22: getRunningNodes ──')
{
  const g = graph([node('A'), node('B'), node('C')])
  const dag = new PlanDAG(g)

  assert(dag.getRunningNodes().length === 0, '初始无 running 节点')

  dag.updateNodeStatus('A', 'running')
  dag.updateNodeStatus('B', 'running')
  assert(dag.getRunningNodes().length === 2, '2 个 running 节点')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`PlanDAG 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
