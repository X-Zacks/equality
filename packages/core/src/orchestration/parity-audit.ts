/**
 * orchestration/parity-audit.ts — Spec 一致性审计
 *
 * Phase N1 (N1.5.1): 借鉴 claw-code parity_audit.py
 *
 * ParityAuditor 自动检测 Plan 执行结果与 OpenSpec 规格的一致性：
 * - Spec 需求覆盖率
 * - 测试覆盖率
 * - 未提交变更
 * - Markdown 报告
 */

import type { PlanGraph } from './plan-types.js'
import { PLAN_DONE_STATUSES } from './plan-types.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SpecRequirement {
  /** 需求标识（如 "N1.2.1"） */
  id: string
  /** 需求描述 */
  description: string
  /** 关联的 spec 文件路径 */
  specFile?: string
}

export interface TestMapping {
  /** 模块名称（如 "plan-dag"） */
  module: string
  /** 测试文件路径 */
  testFile?: string
  /** 是否有测试覆盖 */
  hasCoverage: boolean
}

export interface ParityAuditResult {
  /** 关联的 Plan ID */
  planId: string
  /** Spec 需求覆盖率 */
  specCoverage: { covered: number; total: number }
  /** 测试覆盖率 */
  testCoverage: { passing: number; total: number }
  /** 未被实现覆盖的 Spec requirement */
  missingSpecs: string[]
  /** 缺少测试的模块 */
  missingTests: string[]
  /** 未提交的文件变更 */
  uncommittedChanges: string[]
  /** Markdown 格式审计报告 */
  report: string
}

export interface ParityAuditorConfig {
  /** Spec 需求列表 */
  requirements: SpecRequirement[]
  /** 模块-测试映射列表 */
  testMappings: TestMapping[]
  /** 获取未提交变更的回调（可选，用于 git 集成） */
  getUncommittedChanges?: () => string[] | Promise<string[]>
}

// ─── ParityAuditor 类 ─────────────────────────────────────────────────────────

export class ParityAuditor {
  private readonly _config: ParityAuditorConfig

  constructor(config: ParityAuditorConfig) {
    this._config = config
  }

  /**
   * 执行审计。
   *
   * @param plan - PlanGraph（用于检查节点完成状态与 spec 对应关系）
   * @param nodeToRequirement - 可选的节点 ID → 需求 ID 映射。
   *   如果提供，则检查已完成节点覆盖了哪些需求。
   *   如果不提供，则使用节点 ID 作为需求 ID 进行匹配。
   */
  async audit(
    plan: PlanGraph,
    nodeToRequirement?: Map<string, string>,
  ): Promise<ParityAuditResult> {
    // 1. 计算 spec 覆盖率
    const coveredReqIds = new Set<string>()

    for (const node of plan.nodes) {
      if (PLAN_DONE_STATUSES.has(node.status)) {
        // 查找该节点对应的需求
        const reqId = nodeToRequirement?.get(node.id) ?? node.id
        coveredReqIds.add(reqId)
      }
    }

    const allReqIds = new Set(this._config.requirements.map(r => r.id))
    const covered = [...allReqIds].filter(id => coveredReqIds.has(id)).length
    const missingSpecs = [...allReqIds].filter(id => !coveredReqIds.has(id))

    // 2. 计算测试覆盖率
    const totalModules = this._config.testMappings.length
    const passingModules = this._config.testMappings.filter(m => m.hasCoverage).length
    const missingTests = this._config.testMappings
      .filter(m => !m.hasCoverage)
      .map(m => m.module)

    // 3. 获取未提交变更
    let uncommittedChanges: string[] = []
    if (this._config.getUncommittedChanges) {
      uncommittedChanges = await this._config.getUncommittedChanges()
    }

    // 4. 生成报告
    const specCoverage = { covered, total: allReqIds.size }
    const testCoverage = { passing: passingModules, total: totalModules }

    const report = ParityAuditor._generateReport({
      planId: plan.id,
      specCoverage,
      testCoverage,
      missingSpecs,
      missingTests,
      uncommittedChanges,
    })

    return {
      planId: plan.id,
      specCoverage,
      testCoverage,
      missingSpecs,
      missingTests,
      uncommittedChanges,
      report,
    }
  }

  // ─── 报告生成 ─────────────────────────────────────────────────────────────

  private static _generateReport(data: Omit<ParityAuditResult, 'report'>): string {
    const lines: string[] = []

    lines.push('# Parity Audit')
    lines.push('')
    lines.push(`**Plan ID:** ${data.planId}`)
    lines.push('')

    // Spec 覆盖率
    const specPct = data.specCoverage.total > 0
      ? Math.round((data.specCoverage.covered / data.specCoverage.total) * 100)
      : 100
    lines.push(`## Spec Coverage: ${data.specCoverage.covered}/${data.specCoverage.total} (${specPct}%)`)
    lines.push('')

    if (data.missingSpecs.length > 0) {
      lines.push('### Missing Specs')
      for (const id of data.missingSpecs) {
        lines.push(`- ${id}`)
      }
      lines.push('')
    }

    // 测试覆盖率
    const testPct = data.testCoverage.total > 0
      ? Math.round((data.testCoverage.passing / data.testCoverage.total) * 100)
      : 100
    lines.push(`## Test Coverage: ${data.testCoverage.passing}/${data.testCoverage.total} (${testPct}%)`)
    lines.push('')

    if (data.missingTests.length > 0) {
      lines.push('### Missing Tests')
      for (const mod of data.missingTests) {
        lines.push(`- ${mod}`)
      }
      lines.push('')
    }

    // 未提交变更
    if (data.uncommittedChanges.length > 0) {
      lines.push(`## Uncommitted Changes (${data.uncommittedChanges.length})`)
      lines.push('')
      for (const f of data.uncommittedChanges) {
        lines.push(`- ${f}`)
      }
      lines.push('')
    }

    // 总结
    const allGood = data.missingSpecs.length === 0
      && data.missingTests.length === 0
      && data.uncommittedChanges.length === 0
    lines.push('## Summary')
    lines.push('')
    lines.push(allGood
      ? '✅ All specs covered, all tests passing, no uncommitted changes.'
      : '⚠️ Issues found. Please review the items above.',
    )

    return lines.join('\n')
  }
}
