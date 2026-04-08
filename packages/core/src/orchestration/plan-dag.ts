/**
 * orchestration/plan-dag.ts — Plan DAG 引擎
 *
 * Phase N1 (N1.2.1): 拓扑排序、环检测、就绪节点、关键路径、后代查询、合法性验证
 *
 * 所有图操作基于 adjacency list + in-degree 实现，复杂度 O(V+E)。
 */

import type {
  PlanGraph,
  PlanNode,
  PlanNodeStatus,
  PlanValidationResult,
} from './plan-types.js'
import { PLAN_DONE_STATUSES, PLAN_TERMINAL_STATUSES } from './plan-types.js'

// ─── PlanDAG 类 ───────────────────────────────────────────────────────────────

export class PlanDAG {
  private readonly _graph: PlanGraph

  /** nodeId → PlanNode 索引 */
  private readonly _nodeMap: Map<string, PlanNode>

  /** nodeId → 出边 (dependsOn 的反向：parent → children) */
  private readonly _children: Map<string, Set<string>>

  /** nodeId → 入度 (dependsOn.length) */
  private readonly _inDegree: Map<string, number>

  constructor(graph: PlanGraph) {
    this._graph = graph
    this._nodeMap = new Map()
    this._children = new Map()
    this._inDegree = new Map()

    // 构建索引
    for (const node of graph.nodes) {
      this._nodeMap.set(node.id, node)
      this._children.set(node.id, new Set())
      this._inDegree.set(node.id, 0)
    }

    // 构建邻接表和入度表
    for (const node of graph.nodes) {
      for (const dep of node.dependsOn) {
        if (this._children.has(dep)) {
          this._children.get(dep)!.add(node.id)
        }
        this._inDegree.set(node.id, (this._inDegree.get(node.id) ?? 0) + 1)
      }
    }
  }

  // ─── 访问器 ───────────────────────────────────────────────────────────────

  /** 底层 PlanGraph 引用 */
  get graph(): PlanGraph {
    return this._graph
  }

  /** 获取节点 */
  getNode(id: string): PlanNode | undefined {
    return this._nodeMap.get(id)
  }

  /** 节点数量 */
  get nodeCount(): number {
    return this._nodeMap.size
  }

  // ─── 拓扑排序 (Kahn 算法) ─────────────────────────────────────────────────

  /**
   * 返回拓扑排序后的节点 ID。
   * 如果存在环则返回 null。
   * 复杂度: O(V + E)
   */
  topologicalSort(): string[] | null {
    const inDeg = new Map<string, number>()
    for (const [id, deg] of this._inDegree) {
      inDeg.set(id, deg)
    }

    const queue: string[] = []
    for (const [id, deg] of inDeg) {
      if (deg === 0) queue.push(id)
    }

    const result: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)

      for (const child of this._children.get(current) ?? []) {
        const newDeg = (inDeg.get(child) ?? 1) - 1
        inDeg.set(child, newDeg)
        if (newDeg === 0) queue.push(child)
      }
    }

    return result.length === this._nodeMap.size ? result : null
  }

  // ─── 环检测 ───────────────────────────────────────────────────────────────

  /**
   * 检测环。如果存在环，返回环路径（节点 ID 数组，首尾相同）。
   * 无环返回 null。
   * 使用 DFS 三色标记法。
   */
  detectCycle(): string[] | null {
    const WHITE = 0, GRAY = 1, BLACK = 2
    const color = new Map<string, number>()
    const parent = new Map<string, string | null>()

    for (const id of this._nodeMap.keys()) {
      color.set(id, WHITE)
      parent.set(id, null)
    }

    for (const startId of this._nodeMap.keys()) {
      if (color.get(startId) !== WHITE) continue

      const stack: Array<{ id: string; childIter: Iterator<string> }> = []
      color.set(startId, GRAY)
      stack.push({ id: startId, childIter: (this._children.get(startId) ?? new Set()).values() })

      while (stack.length > 0) {
        const top = stack[stack.length - 1]
        const next = top.childIter.next()

        if (next.done) {
          color.set(top.id, BLACK)
          stack.pop()
          continue
        }

        const childId = next.value
        const childColor = color.get(childId) ?? WHITE

        if (childColor === GRAY) {
          // 找到环 —— 回溯构建环路径
          const cyclePath: string[] = [childId]
          for (let i = stack.length - 1; i >= 0; i--) {
            cyclePath.push(stack[i].id)
            if (stack[i].id === childId) break
          }
          cyclePath.reverse()
          return cyclePath
        }

        if (childColor === WHITE) {
          color.set(childId, GRAY)
          parent.set(childId, top.id)
          stack.push({
            id: childId,
            childIter: (this._children.get(childId) ?? new Set()).values(),
          })
        }
      }
    }

    return null
  }

  // ─── 就绪节点 ─────────────────────────────────────────────────────────────

  /**
   * 返回所有就绪节点：
   * - 自身状态为 pending
   * - 所有前置节点状态为 completed 或 skipped（PLAN_DONE_STATUSES）
   *
   * 返回按 priority 升序排列（priority 越小越优先）。
   */
  getReadyNodes(): PlanNode[] {
    const ready: PlanNode[] = []

    for (const node of this._nodeMap.values()) {
      if (node.status !== 'pending') continue

      const allDepsDone = node.dependsOn.every(depId => {
        const dep = this._nodeMap.get(depId)
        return dep != null && PLAN_DONE_STATUSES.has(dep.status)
      })

      if (allDepsDone) {
        ready.push(node)
      }
    }

    // 按 priority 升序排序
    ready.sort((a, b) => a.priority - b.priority)
    return ready
  }

  /**
   * 从就绪节点中选取可调度节点（不超过并发限制）。
   * @param currentRunning 当前运行中节点数
   * @param maxConcurrent 最大并发数
   * @returns 可调度节点列表（按 priority 排序）
   */
  getSchedulableNodes(currentRunning: number, maxConcurrent: number): PlanNode[] {
    const available = maxConcurrent - currentRunning
    if (available <= 0) return []

    const ready = this.getReadyNodes()
    return ready.slice(0, available)
  }

  // ─── 终止判断 ─────────────────────────────────────────────────────────────

  /**
   * 所有节点是否均在终止态。
   * 终止态包括: completed, failed, exhausted, skipped, cancelled
   */
  isTerminated(): boolean {
    for (const node of this._nodeMap.values()) {
      if (!PLAN_TERMINAL_STATUSES.has(node.status)) return false
    }
    return true
  }

  /**
   * 检查是否卡住（deadlock）：
   * 没有 running 节点，也没有 ready 节点，但还有非终止态节点。
   */
  isStuck(): boolean {
    let hasNonTerminal = false
    let hasRunning = false

    for (const node of this._nodeMap.values()) {
      if (node.status === 'running') hasRunning = true
      if (!PLAN_TERMINAL_STATUSES.has(node.status)) hasNonTerminal = true
    }

    if (!hasNonTerminal) return false // 全部终止，不算 stuck
    if (hasRunning) return false // 还有 running，不算 stuck

    return this.getReadyNodes().length === 0
  }

  // ─── 关键路径 ─────────────────────────────────────────────────────────────

  /**
   * 计算关键路径（最长依赖链）。
   * 使用动态规划：dp[node] = max(dp[dep]) + 1
   * 复杂度: O(V + E)
   *
   * 返回节点 ID 数组（从起始到末端）。空图返回空数组。
   */
  criticalPath(): string[] {
    const sorted = this.topologicalSort()
    if (sorted == null || sorted.length === 0) return []

    // dp[nodeId] = 到达该节点的最长路径长度
    const dp = new Map<string, number>()
    // prev[nodeId] = 在最长路径上的前驱
    const prev = new Map<string, string | null>()

    for (const id of sorted) {
      dp.set(id, 1)
      prev.set(id, null)
    }

    for (const id of sorted) {
      const node = this._nodeMap.get(id)!
      for (const child of this._children.get(id) ?? []) {
        const newLen = (dp.get(id) ?? 1) + 1
        if (newLen > (dp.get(child) ?? 1)) {
          dp.set(child, newLen)
          prev.set(child, id)
        }
      }
    }

    // 找到最长路径末端
    let maxLen = 0
    let endNode = sorted[0]
    for (const [id, len] of dp) {
      if (len > maxLen) {
        maxLen = len
        endNode = id
      }
    }

    // 回溯构建路径
    const path: string[] = []
    let current: string | null = endNode
    while (current != null) {
      path.push(current)
      current = prev.get(current) ?? null
    }
    path.reverse()

    return path
  }

  // ─── 后代查询 ─────────────────────────────────────────────────────────────

  /**
   * 获取指定节点的所有后代（BFS 遍历所有可达子节点）。
   * 用于级联取消。
   * 复杂度: O(V + E)
   */
  getDescendants(nodeId: string): Set<string> {
    const descendants = new Set<string>()
    const queue: string[] = [nodeId]

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const child of this._children.get(current) ?? []) {
        if (!descendants.has(child)) {
          descendants.add(child)
          queue.push(child)
        }
      }
    }

    return descendants
  }

  // ─── 验证 ─────────────────────────────────────────────────────────────────

  /**
   * 验证 PlanGraph 的合法性：
   * 1. 无环
   * 2. 无自引用
   * 3. 无孤立依赖（dependsOn 的 ID 必须存在于图中）
   * 4. 节点数不超过 maxTotalNodes
   */
  validate(): PlanValidationResult {
    const errors: string[] = []

    // 1. 节点数上限检查
    if (this._graph.nodes.length > this._graph.maxTotalNodes) {
      errors.push(
        `Node count ${this._graph.nodes.length} exceeds limit ${this._graph.maxTotalNodes}`,
      )
    }

    // 2. 自引用检查
    for (const node of this._graph.nodes) {
      if (node.dependsOn.includes(node.id)) {
        errors.push(`Node ${node.id} depends on itself`)
      }
    }

    // 3. 孤立依赖检查
    for (const node of this._graph.nodes) {
      for (const dep of node.dependsOn) {
        if (!this._nodeMap.has(dep)) {
          errors.push(`Node ${node.id} depends on unknown node ${dep}`)
        }
      }
    }

    // 4. 环检测
    const cycle = this.detectCycle()
    if (cycle != null) {
      errors.push(`Cycle detected: ${cycle.join(' → ')}`)
    }

    return { valid: errors.length === 0, errors }
  }

  // ─── 状态修改辅助 ─────────────────────────────────────────────────────────

  /**
   * 更新节点状态。直接修改底层 PlanNode 引用。
   * 同时更新 PlanGraph.updatedAt。
   * 如果节点不存在返回 false。
   */
  updateNodeStatus(nodeId: string, status: PlanNodeStatus): boolean {
    const node = this._nodeMap.get(nodeId)
    if (node == null) return false
    node.status = status
    this._graph.updatedAt = Date.now()
    return true
  }

  /**
   * 批量取消后代节点。
   * 将 nodeId 的所有后代中尚未终止的节点置为 cancelled。
   * 返回被取消的节点 ID 列表。
   */
  cancelDescendants(nodeId: string): string[] {
    const descendants = this.getDescendants(nodeId)
    const cancelled: string[] = []

    for (const descId of descendants) {
      const node = this._nodeMap.get(descId)
      if (node != null && !PLAN_TERMINAL_STATUSES.has(node.status) && node.status !== 'running') {
        node.status = 'cancelled'
        cancelled.push(descId)
      }
    }

    if (cancelled.length > 0) {
      this._graph.updatedAt = Date.now()
    }

    return cancelled
  }

  /**
   * 获取运行中节点列表。
   */
  getRunningNodes(): PlanNode[] {
    return this._graph.nodes.filter(n => n.status === 'running')
  }

  /**
   * 将所有非终止态、非运行态节点置为 cancelled。
   * 返回被取消的节点 ID 列表。
   */
  cancelAllPending(): string[] {
    const cancelled: string[] = []
    for (const node of this._graph.nodes) {
      if (!PLAN_TERMINAL_STATUSES.has(node.status) && node.status !== 'running') {
        node.status = 'cancelled'
        cancelled.push(node.id)
      }
    }
    if (cancelled.length > 0) {
      this._graph.updatedAt = Date.now()
    }
    return cancelled
  }
}
