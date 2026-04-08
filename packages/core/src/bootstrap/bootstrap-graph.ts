/**
 * bootstrap/bootstrap-graph.ts — 启动阶段日志
 *
 * Phase N6 (N6.1.1): 借鉴 claw-code bootstrap_graph.py
 * - 7 阶段启动追踪
 * - 状态流转（pending → running → completed/failed）
 * - 降级模式（阶段失败不阻塞后续）
 * - Markdown 报告 + 结构化日志
 */

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type BootstrapStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BootstrapStage {
  /** 阶段名称 */
  name: string
  /** 执行顺序 */
  order: number
  /** 当前状态 */
  status: BootstrapStatus
  /** 耗时（ms） */
  durationMs?: number
  /** 补充说明 */
  detail?: string
  /** 错误信息（仅 failed 时） */
  error?: string
  /** 开始时间戳 */
  startedAt?: number
}

// ─── 预定义阶段 ──────────────────────────────────────────────────────────────

export const DEFAULT_BOOTSTRAP_STAGES: BootstrapStage[] = [
  { name: 'prefetch', order: 0, status: 'pending', detail: '预加载项目配置和缓存' },
  { name: 'env-guards', order: 1, status: 'pending', detail: '环境检查：Node 版本、工具链' },
  { name: 'config-load', order: 2, status: 'pending', detail: '加载 equality.config + 模型配置' },
  { name: 'tool-registry', order: 3, status: 'pending', detail: '注册内建工具 + 插件工具 + MCP' },
  { name: 'skill-loader', order: 4, status: 'pending', detail: '加载 Skill 定义' },
  { name: 'code-indexer', order: 5, status: 'pending', detail: '项目代码索引（增量）' },
  { name: 'gateway-ready', order: 6, status: 'pending', detail: 'HTTP/WS 服务就绪' },
]

// ─── BootstrapGraph 类 ───────────────────────────────────────────────────────

export class BootstrapGraph {
  private _stages: BootstrapStage[]
  private _startTime: number

  constructor(stages?: BootstrapStage[]) {
    this._stages = (stages ?? DEFAULT_BOOTSTRAP_STAGES).map(s => ({ ...s }))
    this._startTime = Date.now()
  }

  /**
   * 标记阶段开始。
   */
  start(name: string): void {
    const stage = this._findStage(name)
    if (!stage) return
    stage.status = 'running'
    stage.startedAt = Date.now()
  }

  /**
   * 标记阶段完成。
   */
  complete(name: string): void {
    const stage = this._findStage(name)
    if (!stage) return
    stage.status = 'completed'
    if (stage.startedAt) {
      stage.durationMs = Date.now() - stage.startedAt
    }
  }

  /**
   * 标记阶段失败——不阻塞后续阶段（降级模式）。
   */
  fail(name: string, error: string): void {
    const stage = this._findStage(name)
    if (!stage) return
    stage.status = 'failed'
    stage.error = error
    if (stage.startedAt) {
      stage.durationMs = Date.now() - stage.startedAt
    }
  }

  /**
   * 获取所有阶段的快照。
   */
  get stages(): readonly BootstrapStage[] {
    return this._stages
  }

  /**
   * 获取失败的阶段名称列表。
   */
  get failedStages(): string[] {
    return this._stages.filter(s => s.status === 'failed').map(s => s.name)
  }

  /**
   * 获取因阶段失败而降级的功能列表。
   */
  get degradedFeatures(): string[] {
    const features: string[] = []
    for (const stage of this._stages) {
      if (stage.status === 'failed') {
        if (stage.name === 'code-indexer') features.push('codebase_search')
        if (stage.name === 'skill-loader') features.push('skills')
        if (stage.name === 'tool-registry') features.push('plugins')
      }
    }
    return features
  }

  /**
   * 总耗时。
   */
  get totalDurationMs(): number {
    return Date.now() - this._startTime
  }

  /**
   * 是否所有阶段都已终结（completed 或 failed）。
   */
  get isFinished(): boolean {
    return this._stages.every(s => s.status === 'completed' || s.status === 'failed')
  }

  /**
   * 生成 Markdown 报告 [claw-code: as_markdown()]。
   */
  toMarkdown(): string {
    const lines: string[] = ['# Bootstrap Report', '']

    const statusEmoji: Record<BootstrapStatus, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
    }

    for (const stage of this._stages) {
      const emoji = statusEmoji[stage.status]
      const duration = stage.durationMs != null ? ` (${stage.durationMs}ms)` : ''
      const detail = stage.detail ? ` — ${stage.detail}` : ''
      const error = stage.error ? ` ⚠️ ${stage.error}` : ''
      lines.push(`${emoji} **${stage.name}**${duration}${detail}${error}`)
    }

    lines.push('')
    lines.push(`Total: ${this.totalDurationMs}ms | Failed: ${this.failedStages.length}`)

    return lines.join('\n')
  }

  /**
   * 生成结构化日志行。
   */
  toLogLines(): string[] {
    return this._stages
      .filter(s => s.status !== 'pending')
      .map(s => {
        const duration = s.durationMs != null ? ` in ${s.durationMs}ms` : ''
        const error = s.error ? `: ${s.error}` : ''
        return `[bootstrap] ${s.name} ${s.status}${duration}${error}`
      })
  }

  /**
   * 序列化为 JSON 安全对象。
   */
  toJSON(): { stages: BootstrapStage[]; totalDurationMs: number; failedStages: string[]; degradedFeatures: string[] } {
    return {
      stages: this._stages.map(s => ({ ...s })),
      totalDurationMs: this.totalDurationMs,
      failedStages: this.failedStages,
      degradedFeatures: this.degradedFeatures,
    }
  }

  // ─── 内部 ─────────────────────────────────────────────────────────────────

  private _findStage(name: string): BootstrapStage | undefined {
    return this._stages.find(s => s.name === name)
  }
}
