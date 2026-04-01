/**
 * tools/loop-detector.ts — 工具调用循环检测器
 *
 * Phase 6: Tool Loop Detection
 * Spec: openspec/specs/tools/spec.md「工具调用循环检测」章节
 *
 * 实现 4 个检测器：
 *   1. generic_repeat     — 同参数同结果连续重复（warn@10, terminate@20）
 *   2. poll_no_progress   — 轮询类工具无进展（更早触发）
 *   3. ping_pong          — A→B→A→B 交替循环（≥20 次 + 结果稳定）
 *   4. circuit_breaker    — 全局工具调用次数上限（>30 立即终止）
 *
 * Hash 算法：SHA-256 → hex 前 8 位
 */

import { createHash } from 'node:crypto'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** generic_repeat 警告阈值 */
const REPEAT_WARN_THRESHOLD = 10
/** generic_repeat 终止阈值 */
const REPEAT_TERMINATE_THRESHOLD = 20

/** poll_no_progress 警告阈值（比 generic_repeat 更早） */
const POLL_WARN_THRESHOLD = 5
/** poll_no_progress 终止阈值 */
const POLL_TERMINATE_THRESHOLD = 10

/** ping_pong 终止阈值（交替次数） */
const PING_PONG_THRESHOLD = 20

/** 历史记录滑动窗口大小（Phase A.2）*/
const HISTORY_WINDOW_SIZE = 30

/** 全局断路器默认上限 */
const DEFAULT_CIRCUIT_BREAKER_LIMIT = 50
/** 全局断路器允许的最大上限（防滥用） */
const MAX_CIRCUIT_BREAKER_LIMIT = 500

/** 已知的轮询类工具名 */
const POLL_TOOL_NAMES = new Set(['bash', 'process'])

// ─── Types ────────────────────────────────────────────────────────────────────

export type DetectorAction = 'ok' | 'warn' | 'terminate'

export interface DetectorVerdict {
  action: DetectorAction
  detector: string
  message: string
}

interface ToolCallRecord {
  name: string
  argsHash: string
  resultHash: string
}

// ─── Hash ─────────────────────────────────────────────────────────────────────

/**
 * 计算参数 hash：JSON stringify（键排序）→ SHA-256 → hex 前 8 位
 */
export function computeArgsHash(name: string, args: Record<string, unknown>): string {
  const sorted = JSON.stringify(args, Object.keys(args).sort())
  return shortHash(`${name}:${sorted}`)
}

/**
 * 计算结果 hash：SHA-256 → hex 前 8 位
 */
export function computeResultHash(content: string): string {
  return shortHash(content)
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

// ─── LoopDetector ─────────────────────────────────────────────────────────────

export class LoopDetector {
  /** 所有工具调用记录（按时间顺序） */
  private history: ToolCallRecord[] = []
  /** 全局工具调用计数 */
  private totalCalls = 0
  /** 断路器上限（可通过构造函数配置） */
  private readonly circuitBreakerLimit: number

  constructor(circuitBreakerLimit?: number) {
    const raw = circuitBreakerLimit ?? DEFAULT_CIRCUIT_BREAKER_LIMIT
    this.circuitBreakerLimit = Math.min(Math.max(raw, 1), MAX_CIRCUIT_BREAKER_LIMIT)
  }

  /**
   * 记录一次工具调用并检测循环
   *
   * 在工具执行完毕后调用，返回检测结果。
   * 调用方根据 action 决定：ok → 继续，warn → 日志警告，terminate → 终止 runAttempt。
   */
  check(name: string, argsHash: string, resultHash: string): DetectorVerdict {
    this.totalCalls++
    const record: ToolCallRecord = { name, argsHash, resultHash }
    this.history.push(record)

    // ── 滑动窗口裁剪（Phase A.2）────────────────────────────────────
    // 保持历史记录不超过 HISTORY_WINDOW_SIZE，移除最旧的记录
    if (this.history.length > HISTORY_WINDOW_SIZE) {
      this.history.shift()
    }

    // 检测器 4：全局断路器（最优先）
    const circuitResult = this.checkCircuitBreaker()
    if (circuitResult.action === 'terminate') return circuitResult

    // 检测器 2：轮询无进展（对轮询类工具优先检测）
    if (POLL_TOOL_NAMES.has(name)) {
      const pollResult = this.checkPollNoProgress(name, argsHash, resultHash)
      if (pollResult.action !== 'ok') return pollResult
    }

    // 检测器 1：通用重复检测
    const repeatResult = this.checkGenericRepeat(name, argsHash, resultHash)
    if (repeatResult.action !== 'ok') return repeatResult

    // 检测器 3：乒乓循环
    const pingPongResult = this.checkPingPong()
    if (pingPongResult.action !== 'ok') return pingPongResult

    return { action: 'ok', detector: 'none', message: '' }
  }

  /** 获取当前总调用次数 */
  get count(): number {
    return this.totalCalls
  }

  // ── 检测器 1：通用重复检测 ────────────────────────────────────────────────

  private checkGenericRepeat(name: string, argsHash: string, resultHash: string): DetectorVerdict {
    // 从最近的记录往前数连续相同的（同 name + 同 argsHash + 同 resultHash）
    let streak = 0
    for (let i = this.history.length - 1; i >= 0; i--) {
      const r = this.history[i]
      if (r.name === name && r.argsHash === argsHash && r.resultHash === resultHash) {
        streak++
      } else {
        break
      }
    }

    if (streak >= REPEAT_TERMINATE_THRESHOLD) {
      return {
        action: 'terminate',
        detector: 'generic_repeat',
        message: `工具 "${name}" 以相同参数连续调用 ${streak} 次且结果不变，检测到循环，已终止。`,
      }
    }
    if (streak >= REPEAT_WARN_THRESHOLD) {
      return {
        action: 'warn',
        detector: 'generic_repeat',
        message: `工具 "${name}" 以相同参数连续调用 ${streak} 次且结果不变，可能陷入循环。`,
      }
    }

    return { action: 'ok', detector: 'generic_repeat', message: '' }
  }

  // ── 检测器 2：轮询无进展 ──────────────────────────────────────────────────

  private checkPollNoProgress(name: string, argsHash: string, resultHash: string): DetectorVerdict {
    // 与 generic_repeat 类似，但阈值更低，专门用于轮询类工具
    let streak = 0
    for (let i = this.history.length - 1; i >= 0; i--) {
      const r = this.history[i]
      if (r.name === name && r.argsHash === argsHash && r.resultHash === resultHash) {
        streak++
      } else {
        break
      }
    }

    if (streak >= POLL_TERMINATE_THRESHOLD) {
      return {
        action: 'terminate',
        detector: 'poll_no_progress',
        message: `轮询工具 "${name}" 连续 ${streak} 次无进展，已终止。`,
      }
    }
    if (streak >= POLL_WARN_THRESHOLD) {
      return {
        action: 'warn',
        detector: 'poll_no_progress',
        message: `轮询工具 "${name}" 连续 ${streak} 次无进展，可能在等待一个不会完成的操作。`,
      }
    }

    return { action: 'ok', detector: 'poll_no_progress', message: '' }
  }

  // ── 检测器 3：乒乓循环 ────────────────────────────────────────────────────

  private checkPingPong(): DetectorVerdict {
    const h = this.history
    if (h.length < 4) return { action: 'ok', detector: 'ping_pong', message: '' }

    // 取最后两个不同工具的调用，检查是否形成 A→B→A→B 模式
    const last = h[h.length - 1]
    const prev = h[h.length - 2]

    // 必须是两个不同的工具
    if (last.name === prev.name) return { action: 'ok', detector: 'ping_pong', message: '' }

    const nameA = prev.name
    const nameB = last.name

    // 从末尾往前检查交替模式，同时验证结果稳定性
    let alternateCount = 0
    let resultAStable = true
    let resultBStable = true
    let firstResultHashA: string | null = null
    let firstResultHashB: string | null = null

    for (let i = h.length - 1; i >= 0; i--) {
      const r = h[i]
      // 期望的交替位置
      const expectB = (h.length - 1 - i) % 2 === 0  // 最后一条是 B
      const expectedName = expectB ? nameB : nameA

      if (r.name !== expectedName) break
      alternateCount++

      // 检查结果稳定性
      if (r.name === nameA) {
        if (firstResultHashA === null) firstResultHashA = r.resultHash
        else if (r.resultHash !== firstResultHashA) resultAStable = false
      } else {
        if (firstResultHashB === null) firstResultHashB = r.resultHash
        else if (r.resultHash !== firstResultHashB) resultBStable = false
      }
    }

    // 两个条件都满足才判定终止（避免误杀）：交替次数 ≥ 20 AND 双方结果均稳定
    if (alternateCount >= PING_PONG_THRESHOLD && resultAStable && resultBStable) {
      return {
        action: 'terminate',
        detector: 'ping_pong',
        message: `检测到工具 "${nameA}" 与 "${nameB}" 交替循环 ${alternateCount} 次且结果均稳定，已终止。`,
      }
    }

    return { action: 'ok', detector: 'ping_pong', message: '' }
  }

  // ── 检测器 4：全局断路器 ──────────────────────────────────────────────────

  private checkCircuitBreaker(): DetectorVerdict {
    if (this.totalCalls > this.circuitBreakerLimit) {
      return {
        action: 'terminate',
        detector: 'circuit_breaker',
        message: `单次 runAttempt 工具调用总数达到 ${this.totalCalls}（上限 ${this.circuitBreakerLimit}），已终止。`,
      }
    }
    return { action: 'ok', detector: 'circuit_breaker', message: '' }
  }
}
