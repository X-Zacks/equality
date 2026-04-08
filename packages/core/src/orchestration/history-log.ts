/**
 * orchestration/history-log.ts — Plan 执行历史日志
 *
 * Phase N1 (N1.6.1): 借鉴 claw-code history.py
 * - 结构化事件记录
 * - Markdown 导出
 * - JSON 序列化 / 反序列化
 */

import type { AgentRole } from './plan-types.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface HistoryEvent {
  /** 时间戳（ms） */
  timestamp: number
  /** 事件标题 */
  title: string
  /** 事件详情 */
  detail: string
  /** 关联节点 ID */
  nodeId?: string
  /** 关联角色 */
  role?: AgentRole
}

export interface HistoryLogSnapshot {
  events: HistoryEvent[]
  createdAt: number
}

// ─── HistoryLog 类 ────────────────────────────────────────────────────────────

export class HistoryLog {
  private _events: HistoryEvent[] = []
  private readonly _createdAt: number

  constructor(createdAt?: number) {
    this._createdAt = createdAt ?? Date.now()
  }

  // ─── 写入 ─────────────────────────────────────────────────────────────────

  /**
   * 添加一个历史事件。
   * timestamp 自动设置为当前时间（也可通过 opts.timestamp 覆盖）。
   */
  add(
    title: string,
    detail: string,
    opts?: { nodeId?: string; role?: AgentRole; timestamp?: number },
  ): HistoryEvent {
    const event: HistoryEvent = {
      timestamp: opts?.timestamp ?? Date.now(),
      title,
      detail,
      ...(opts?.nodeId != null ? { nodeId: opts.nodeId } : {}),
      ...(opts?.role != null ? { role: opts.role } : {}),
    }
    this._events.push(event)
    return event
  }

  // ─── 查询 ─────────────────────────────────────────────────────────────────

  /** 所有事件（只读副本） */
  get events(): readonly HistoryEvent[] {
    return this._events
  }

  /** 事件数量 */
  get length(): number {
    return this._events.length
  }

  /** 创建时间 */
  get createdAt(): number {
    return this._createdAt
  }

  /** 按节点 ID 过滤事件 */
  forNode(nodeId: string): HistoryEvent[] {
    return this._events.filter(e => e.nodeId === nodeId)
  }

  /** 按角色过滤事件 */
  forRole(role: AgentRole): HistoryEvent[] {
    return this._events.filter(e => e.role === role)
  }

  /** 最近 N 条事件 */
  last(n: number): HistoryEvent[] {
    return this._events.slice(-n)
  }

  // ─── 导出 ─────────────────────────────────────────────────────────────────

  /** 导出为 Markdown 格式 */
  asMarkdown(): string {
    const lines: string[] = ['# Plan History', '']

    if (this._events.length === 0) {
      lines.push('_No events recorded._')
      return lines.join('\n')
    }

    for (const ev of this._events) {
      const ts = new Date(ev.timestamp).toISOString()
      const rolePart = ev.role ? ` [${ev.role}]` : ''
      const nodePart = ev.nodeId ? ` (${ev.nodeId})` : ''
      lines.push(`- **${ts}**${rolePart}${nodePart}: ${ev.title}`)
      if (ev.detail) {
        lines.push(`  ${ev.detail}`)
      }
    }

    return lines.join('\n')
  }

  /** 序列化为 JSON 字符串 */
  toJSON(): string {
    const snapshot: HistoryLogSnapshot = {
      events: [...this._events],
      createdAt: this._createdAt,
    }
    return JSON.stringify(snapshot)
  }

  /** 从 JSON 字符串恢复 */
  static fromJSON(json: string): HistoryLog {
    const snapshot: HistoryLogSnapshot = JSON.parse(json)
    const log = new HistoryLog(snapshot.createdAt)
    log._events = [...snapshot.events]
    return log
  }

  /** 清空所有事件 */
  clear(): void {
    this._events = []
  }
}
