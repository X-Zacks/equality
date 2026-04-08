/**
 * Phase N1 — ParityAuditor 单元测试
 *
 * N1.8.4: ~15 断言
 * - 完全覆盖
 * - 部分覆盖
 * - 缺少测试
 * - 报告格式
 * - 未提交变更
 */

import { ParityAuditor } from '../orchestration/parity-audit.js'
import { createPlanGraph, createPlanNode } from '../orchestration/plan-types.js'
import type { SpecRequirement, TestMapping } from '../orchestration/parity-audit.js'

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

// ─── P1: 完全覆盖 ───────────────────────────────────────────────────────────

console.log('\n── P1: 完全覆盖 ──')
{
  const requirements: SpecRequirement[] = [
    { id: 'N1', description: '需求1' },
    { id: 'N2', description: '需求2' },
  ]
  const testMappings: TestMapping[] = [
    { module: 'mod-a', hasCoverage: true },
    { module: 'mod-b', hasCoverage: true },
  ]

  const auditor = new ParityAuditor({ requirements, testMappings })

  // Plan 中 N1, N2 都完成
  const plan = createPlanGraph({
    id: 'audit-1',
    title: 'Test',
    nodes: [
      { ...createPlanNode({ id: 'N1', role: 'developer', task: 'T1' }), status: 'completed' },
      { ...createPlanNode({ id: 'N2', role: 'developer', task: 'T2' }), status: 'completed' },
    ],
  })

  const result = await auditor.audit(plan)

  assert(result.specCoverage.covered === 2, 'specCoverage.covered = 2')
  assert(result.specCoverage.total === 2, 'specCoverage.total = 2')
  assert(result.missingSpecs.length === 0, 'missingSpecs 为空')
  assert(result.testCoverage.passing === 2, 'testCoverage.passing = 2')
  assert(result.missingTests.length === 0, 'missingTests 为空')
}

// ─── P2: 部分覆盖 ───────────────────────────────────────────────────────────

console.log('\n── P2: 部分覆盖 ──')
{
  const requirements: SpecRequirement[] = [
    { id: 'R1', description: '需求1' },
    { id: 'R2', description: '需求2' },
    { id: 'R3', description: '需求3' },
    { id: 'R4', description: '需求4' },
    { id: 'R5', description: '需求5' },
  ]
  const testMappings: TestMapping[] = [
    { module: 'mod-a', hasCoverage: true },
    { module: 'mod-b', hasCoverage: false },
    { module: 'mod-c', hasCoverage: true },
  ]

  const auditor = new ParityAuditor({ requirements, testMappings })

  const plan = createPlanGraph({
    id: 'audit-2',
    title: 'Partial',
    nodes: [
      { ...createPlanNode({ id: 'R1', role: 'developer', task: 'T1' }), status: 'completed' },
      { ...createPlanNode({ id: 'R2', role: 'developer', task: 'T2' }), status: 'completed' },
      { ...createPlanNode({ id: 'R3', role: 'developer', task: 'T3' }), status: 'completed' },
      { ...createPlanNode({ id: 'R4', role: 'developer', task: 'T4' }), status: 'failed' },
      { ...createPlanNode({ id: 'R5', role: 'developer', task: 'T5' }), status: 'pending' },
    ],
  })

  const result = await auditor.audit(plan)

  assert(result.specCoverage.covered === 3, 'specCoverage.covered = 3')
  assert(result.specCoverage.total === 5, 'specCoverage.total = 5')
  assert(result.missingSpecs.length === 2, 'missingSpecs 包含 2 个')
  assert(result.missingSpecs.includes('R4'), 'R4 在 missingSpecs 中')
  assert(result.missingSpecs.includes('R5'), 'R5 在 missingSpecs 中')
  assert(result.missingTests.length === 1, 'missingTests 包含 1 个')
  assert(result.missingTests[0] === 'mod-b', '缺少测试的模块为 mod-b')
}

// ─── P3: 报告格式 ───────────────────────────────────────────────────────────

console.log('\n── P3: 报告格式 ──')
{
  const auditor = new ParityAuditor({
    requirements: [
      { id: 'R1', description: '需求1' },
    ],
    testMappings: [
      { module: 'mod-a', hasCoverage: false },
    ],
    getUncommittedChanges: () => ['file1.ts', 'file2.ts'],
  })

  const plan = createPlanGraph({
    id: 'audit-3',
    title: 'Report',
    nodes: [
      { ...createPlanNode({ id: 'R1', role: 'developer', task: 'T1' }), status: 'completed' },
    ],
  })

  const result = await auditor.audit(plan)

  assert(result.report.includes('# Parity Audit'), '报告包含 # Parity Audit 标题')
  assert(result.report.includes('Spec Coverage'), '报告包含 Spec Coverage')
  assert(result.report.includes('Test Coverage'), '报告包含 Test Coverage')
  assert(result.report.includes('Missing Tests'), '报告包含 Missing Tests')
  assert(result.report.includes('Uncommitted Changes'), '报告包含 Uncommitted Changes')
  assert(result.report.includes('file1.ts'), '报告包含未提交文件')
  assert(result.uncommittedChanges.length === 2, 'uncommittedChanges 有 2 个')
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`ParityAuditor 测试完成: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
