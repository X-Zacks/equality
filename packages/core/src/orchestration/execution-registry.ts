/**
 * orchestration/execution-registry.ts — 统一执行条目注册
 *
 * Phase N5 (N5.3.1): 借鉴 claw-code execution_registry.py + command_graph.py
 * - 工具、命令、Skill 统一注册
 * - 按种类查询
 * - CommandGraph 式按来源分类
 * - Markdown 输出
 */

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type ExecutionKind = 'tool' | 'command' | 'skill'

export interface ExecutionEntry {
  /** 条目名称（全局唯一） */
  name: string
  /** 种类 */
  kind: ExecutionKind
  /** 来源模块路径（如 'builtins', 'plugins/slack', 'skills/supervisor-workflow'） */
  sourceHint: string
  /** 当前是否可用 */
  available: boolean
  /** 描述（可选） */
  description?: string
}

export interface ExecutionGraph {
  builtins: ExecutionEntry[]
  plugins: ExecutionEntry[]
  skills: ExecutionEntry[]
}

// ─── ExecutionRegistry 类 ─────────────────────────────────────────────────────

export class ExecutionRegistry {
  private _entries = new Map<string, ExecutionEntry>()

  /**
   * 注册一个条目。如果已存在同名条目，覆盖。
   */
  register(entry: ExecutionEntry): void {
    this._entries.set(entry.name, entry)
  }

  /**
   * 批量注册。
   */
  registerAll(entries: ExecutionEntry[]): void {
    for (const entry of entries) {
      this._entries.set(entry.name, entry)
    }
  }

  /**
   * 获取指定名称的条目。
   */
  get(name: string): ExecutionEntry | undefined {
    return this._entries.get(name)
  }

  /**
   * 检查条目是否存在且可用。
   */
  isAvailable(name: string): boolean {
    const entry = this._entries.get(name)
    return entry?.available ?? false
  }

  /**
   * 按种类查询所有条目。
   */
  getByKind(kind: ExecutionKind): ExecutionEntry[] {
    return [...this._entries.values()].filter(e => e.kind === kind)
  }

  /**
   * 按来源分类——CommandGraph 模式 [claw-code]。
   *
   * 分类规则：
   * - sourceHint 以 'builtins' 开头 → builtins
   * - sourceHint 以 'plugins' 开头 → plugins
   * - sourceHint 以 'skills' 开头 → skills
   * - 其他归入 builtins
   */
  getGraph(): ExecutionGraph {
    const builtins: ExecutionEntry[] = []
    const plugins: ExecutionEntry[] = []
    const skills: ExecutionEntry[] = []

    for (const entry of this._entries.values()) {
      const src = entry.sourceHint.toLowerCase()
      if (src.startsWith('skills')) {
        skills.push(entry)
      } else if (src.startsWith('plugins') || src.startsWith('extensions')) {
        plugins.push(entry)
      } else {
        builtins.push(entry)
      }
    }

    return { builtins, plugins, skills }
  }

  /**
   * 所有已注册条目的数量。
   */
  get size(): number {
    return this._entries.size
  }

  /**
   * 获取所有条目。
   */
  getAll(): ExecutionEntry[] {
    return [...this._entries.values()]
  }

  /**
   * 清空注册表。
   */
  clear(): void {
    this._entries.clear()
  }

  /**
   * 生成 Markdown 输出——列出所有已注册条目。
   */
  toMarkdown(): string {
    const graph = this.getGraph()
    const lines: string[] = ['# Execution Registry', '']

    const section = (title: string, entries: ExecutionEntry[]) => {
      lines.push(`## ${title} (${entries.length})`, '')
      if (entries.length === 0) {
        lines.push('(none)', '')
        return
      }
      lines.push('| Name | Kind | Available | Description |')
      lines.push('|------|------|-----------|-------------|')
      for (const e of entries) {
        const avail = e.available ? '✅' : '❌'
        const desc = e.description ?? ''
        lines.push(`| ${e.name} | ${e.kind} | ${avail} | ${desc} |`)
      }
      lines.push('')
    }

    section('Builtins', graph.builtins)
    section('Plugins', graph.plugins)
    section('Skills', graph.skills)

    return lines.join('\n')
  }
}
