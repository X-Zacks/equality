/**
 * Phase N1 — PlanSerializer 单元测试
 *
 * N1.8.3: ~20 断言
 * - Markdown → PlanGraph
 * - PlanGraph → Markdown
 * - 往返一致性
 * - JSON 序列化
 */

import { PlanSerializer } from '../orchestration/plan-serializer.js'
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

// ─── S1: PlanGraph → Markdown ────────────────────────────────────────────────

console.log('\n── S1: PlanGraph → Markdown ──')
{
  const nodes: PlanNode[] = [
    { ...createPlanNode({ id: 'N1', role: 'developer', task: '实现 DAG 引擎', dependsOn: [], priority: 0 }), status: 'completed', output: 'plan-dag.ts' },
    { ...createPlanNode({ id: 'N2', role: 'tester', task: '编写 DAG 测试', dependsOn: ['N1'], priority: 1 }), status: 'running' },
    createPlanNode({ id: 'N3', role: 'reviewer', task: '审查代码', dependsOn: ['N2'], priority: 2 }),
  ]
  const plan = createPlanGraph({ id: 'plan-001', title: '测试 Plan', nodes })

  const md = PlanSerializer.toMarkdown(plan)

  assert(md.includes('# Plan: 测试 Plan'), 'Markdown 包含 # Plan: 标题')
  assert(md.includes('Completed:'), 'Markdown 包含 Completed 统计')
  assert(md.includes('[x] N1'), '已完成节点为 [x]')
  assert(md.includes('[ ] N2'), '未完成节点为 [ ]')
  assert(md.includes('[developer]'), '包含角色 developer')
  assert(md.includes('[tester]'), '包含角色 tester')
  assert(md.includes('✅'), '已完成节点有 ✅')
  assert(md.includes('🔄'), '运行中节点有 🔄')
  assert(md.includes('⏳'), 'pending 节点有 ⏳')
  assert(md.includes('depends: N1'), 'N2 包含 depends: N1')
  assert(md.includes('output: plan-dag.ts'), 'N1 包含 output')
}

// ─── S2: Markdown → PlanGraph ────────────────────────────────────────────────

console.log('\n── S2: Markdown → PlanGraph ──')
{
  const md = `# Plan: 解析测试

> Status: running | Completed: 1/3 | Running: 1

## Phase 1: 开发
- [x] N1 [developer] 编写代码 ✅
  - depends: (none)
  - output: src/main.ts
- [ ] N2 [tester] 运行测试 🔄
  - depends: N1
- [ ] N3 [reviewer] 审查 ⏳
  - depends: N1, N2
`

  const plan = PlanSerializer.fromMarkdown(md, 'fixed-id')

  assert(plan.title === '解析测试', '标题解析正确')
  assert(plan.id === 'fixed-id', '自定义 ID 生效')
  assert(plan.nodes.length === 3, '解析出 3 个节点')

  const n1 = plan.nodes.find(n => n.id === 'N1')!
  assert(n1.role === 'developer', 'N1 role=developer')
  assert(n1.task === '编写代码', 'N1 task 正确')
  assert(n1.status === 'completed', 'N1 status=completed')
  assert(n1.output === 'src/main.ts', 'N1 output 正确')
  assert(n1.dependsOn.length === 0, 'N1 无依赖')

  const n2 = plan.nodes.find(n => n.id === 'N2')!
  assert(n2.role === 'tester', 'N2 role=tester')
  assert(n2.status === 'running', 'N2 status=running')
  assert(n2.dependsOn.length === 1 && n2.dependsOn[0] === 'N1', 'N2 依赖 N1')

  const n3 = plan.nodes.find(n => n.id === 'N3')!
  assert(n3.dependsOn.length === 2, 'N3 有 2 个依赖')
  assert(n3.dependsOn.includes('N1') && n3.dependsOn.includes('N2'), 'N3 依赖 N1 和 N2')
}

// ─── S3: 往返一致性 ─────────────────────────────────────────────────────────

console.log('\n── S3: 往返一致性 ──')
{
  const nodes: PlanNode[] = [
    createPlanNode({ id: 'A', role: 'architect', task: '设计架构', dependsOn: [] }),
    createPlanNode({ id: 'B', role: 'developer', task: '编写代码', dependsOn: ['A'] }),
  ]
  const original = createPlanGraph({ id: 'round-trip', title: '往返测试', nodes })
  original.nodes[0].status = 'completed'

  const md = PlanSerializer.toMarkdown(original)
  const restored = PlanSerializer.fromMarkdown(md, 'round-trip')

  assert(restored.nodes.length === original.nodes.length, '往返后节点数一致')

  const rA = restored.nodes.find(n => n.id === 'A')!
  const rB = restored.nodes.find(n => n.id === 'B')!
  assert(rA.status === 'completed', '往返后 A 状态一致')
  assert(rB.dependsOn.includes('A'), '往返后 B 依赖关系一致')
  assert(rA.role === 'architect', '往返后 A 角色一致')
}

// ─── S4: JSON 序列化 ────────────────────────────────────────────────────────

console.log('\n── S4: JSON 序列化 ──')
{
  const nodes: PlanNode[] = [
    createPlanNode({ id: 'X', role: 'supervisor', task: '统筹', dependsOn: [] }),
    createPlanNode({ id: 'Y', role: 'developer', task: '开发', dependsOn: ['X'] }),
  ]
  const plan = createPlanGraph({ id: 'json-test', title: 'JSON 测试', nodes })

  const json = PlanSerializer.toJSON(plan)
  const restored = PlanSerializer.fromJSON(json)

  assert(restored.id === plan.id, 'JSON 往返 id 一致')
  assert(restored.title === plan.title, 'JSON 往返 title 一致')
  assert(restored.nodes.length === plan.nodes.length, 'JSON 往返节点数一致')
  assert(restored.nodes[0].id === 'X', 'JSON 往返节点 ID 一致')
  assert(restored.nodes[1].dependsOn[0] === 'X', 'JSON 往返依赖关系一致')
  assert(restored.maxConcurrent === plan.maxConcurrent, 'JSON 往返 maxConcurrent 一致')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`PlanSerializer 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
