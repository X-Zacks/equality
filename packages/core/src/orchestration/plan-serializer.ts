/**
 * orchestration/plan-serializer.ts — Plan 序列化器
 *
 * Phase N1 (N1.4.1): tasks.md ↔ PlanGraph 双向转换 + JSON 序列化
 *
 * Markdown 格式约定:
 * ```markdown
 * # Plan: {title}
 *
 * > Status: {status} | Completed: {n}/{total} | Running: {n}
 *
 * ## Phase 1: {phase_title}
 * - [x] {nodeId} [{role}] {task} ✅
 *   - depends: {dep1}, {dep2}
 *   - output: {output}
 * - [ ] {nodeId} [{role}] {task} ⏳
 *   - depends: {dep1}
 * ```
 */

import type {
  AgentRole,
  PlanGraph,
  PlanNode,
  PlanNodeStatus,
} from './plan-types.js'
import { AGENT_ROLES, createPlanGraph, createPlanNode } from './plan-types.js'

// ─── 状态 emoji 映射 ─────────────────────────────────────────────────────────

const STATUS_EMOJI: Record<PlanNodeStatus, string> = {
  pending: '⏳',
  ready: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  exhausted: '💀',
  skipped: '⏭️',
  cancelled: '🚫',
}

const EMOJI_TO_STATUS: Record<string, PlanNodeStatus> = {
  '⏳': 'pending',
  '🔄': 'running',
  '✅': 'completed',
  '❌': 'failed',
  '💀': 'exhausted',
  '⏭️': 'skipped',
  '🚫': 'cancelled',
}

// ─── PlanSerializer ───────────────────────────────────────────────────────────

export class PlanSerializer {
  // ─── PlanGraph → Markdown ─────────────────────────────────────────────────

  static toMarkdown(plan: PlanGraph): string {
    const lines: string[] = []

    // 标题
    lines.push(`# Plan: ${plan.title}`)
    lines.push('')

    // 状态行
    const completedCount = plan.nodes.filter(n => n.status === 'completed').length
    const runningCount = plan.nodes.filter(n => n.status === 'running').length
    const overallStatus = PlanSerializer._computeOverallStatus(plan)
    lines.push(
      `> Status: ${overallStatus} | Completed: ${completedCount}/${plan.nodes.length} | Running: ${runningCount}`,
    )
    lines.push('')

    // 按 priority 分组展示（相同 priority 视为同一 phase）
    const phases = PlanSerializer._groupByPhase(plan.nodes)

    let phaseIndex = 0
    for (const [phaseTitle, nodes] of phases) {
      phaseIndex++
      lines.push(`## Phase ${phaseIndex}: ${phaseTitle}`)

      for (const node of nodes) {
        const checkbox = node.status === 'completed' || node.status === 'skipped' ? '[x]' : '[ ]'
        const emoji = STATUS_EMOJI[node.status]
        lines.push(`- ${checkbox} ${node.id} [${node.role}] ${node.task} ${emoji}`)

        if (node.dependsOn.length > 0) {
          lines.push(`  - depends: ${node.dependsOn.join(', ')}`)
        }
        if (node.output) {
          lines.push(`  - output: ${node.output}`)
        }
      }

      lines.push('')
    }

    return lines.join('\n')
  }

  // ─── Markdown → PlanGraph ─────────────────────────────────────────────────

  static fromMarkdown(md: string, planId?: string): PlanGraph {
    const lines = md.split('\n')
    const nodes: PlanNode[] = []

    // 解析标题
    let title = 'Untitled'
    for (const line of lines) {
      const titleMatch = line.match(/^#\s+Plan:\s*(.+)/)
      if (titleMatch) {
        title = titleMatch[1].trim()
        break
      }
    }

    // 解析节点
    let currentNode: PlanNode | null = null

    for (const line of lines) {
      // 匹配任务行: - [x] nodeId [role] task emoji
      const taskMatch = line.match(
        /^-\s+\[([ x])\]\s+(\S+)\s+\[(\w+)\]\s+(.+?)\s*(⏳|🔄|✅|❌|💀|⏭️|🚫)?\s*$/,
      )
      if (taskMatch) {
        // 保存前一个节点
        if (currentNode) nodes.push(currentNode)

        const [, checkmark, nodeId, role, task, emoji] = taskMatch

        // 确定状态
        let status: PlanNodeStatus = 'pending'
        if (emoji && EMOJI_TO_STATUS[emoji]) {
          status = EMOJI_TO_STATUS[emoji]
        } else if (checkmark === 'x') {
          status = 'completed'
        }

        // 验证角色
        const validRole = AGENT_ROLES.has(role as AgentRole) ? (role as AgentRole) : 'developer'

        currentNode = createPlanNode({
          id: nodeId,
          role: validRole,
          task: task.trim(),
        })
        currentNode.status = status
        continue
      }

      // 匹配 depends 行
      const depsMatch = line.match(/^\s+-\s+depends:\s*(.+)/)
      if (depsMatch && currentNode) {
        const deps = depsMatch[1]
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0 && s !== '(none)')
        currentNode.dependsOn = deps
        continue
      }

      // 匹配 output 行
      const outputMatch = line.match(/^\s+-\s+output:\s*(.+)/)
      if (outputMatch && currentNode) {
        currentNode.output = outputMatch[1].trim()
      }
    }

    // 最后一个节点
    if (currentNode) nodes.push(currentNode)

    return createPlanGraph({
      id: planId ?? crypto.randomUUID(),
      title,
      nodes,
    })
  }

  // ─── JSON 序列化 ──────────────────────────────────────────────────────────

  static toJSON(plan: PlanGraph): string {
    return JSON.stringify(plan)
  }

  static fromJSON(json: string): PlanGraph {
    return JSON.parse(json) as PlanGraph
  }

  // ─── 内部辅助 ─────────────────────────────────────────────────────────────

  private static _computeOverallStatus(plan: PlanGraph): string {
    if (plan.nodes.length === 0) return 'empty'
    const allCompleted = plan.nodes.every(
      n => n.status === 'completed' || n.status === 'skipped',
    )
    if (allCompleted) return 'completed'
    const anyRunning = plan.nodes.some(n => n.status === 'running')
    if (anyRunning) return 'running'
    const anyFailed = plan.nodes.some(
      n => n.status === 'failed' || n.status === 'exhausted',
    )
    if (anyFailed) return 'partial'
    return 'pending'
  }

  /**
   * 将节点按 priority 分组。
   * 相同 priority 的节点归入同一 phase。
   * 返回 [phaseTitle, nodes[]] 的有序数组。
   */
  private static _groupByPhase(nodes: PlanNode[]): Array<[string, PlanNode[]]> {
    const groups = new Map<number, PlanNode[]>()

    for (const node of nodes) {
      const p = node.priority
      if (!groups.has(p)) groups.set(p, [])
      groups.get(p)!.push(node)
    }

    // 按 priority 排序
    const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0])

    return sorted.map(([priority, groupNodes]) => {
      // 从第一个节点的角色推断 phase title
      const roleSet = new Set(groupNodes.map(n => n.role))
      const roleStr = [...roleSet].join(' + ')
      return [`Priority ${priority} (${roleStr})`, groupNodes] as [string, PlanNode[]]
    })
  }
}
