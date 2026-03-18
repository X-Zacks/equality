/**
 * skills/watcher.ts — Skills 目录热加载 (chokidar)
 *
 * Phase 7: glob 过滤、ignore 列表、5s 防抖、版本号、graceful close
 * Spec: openspec/specs/skills/skills-v2-spec.md「Skills 文件监控与热更新」
 */

import { watch, type FSWatcher } from 'chokidar'
import { loadAllSkills, getSkillsDirs } from './loader.js'
import type { SkillEntry } from './types.js'

const DEFAULT_DEBOUNCE_MS = 5_000  // 5s 防抖（V1 是 30s）

/** 忽略列表 */
const IGNORED_PATTERNS = [
  /(^|[/\\])\.git([/\\]|$)/,
  /(^|[/\\])node_modules([/\\]|$)/,
  /(^|[/\\])dist([/\\]|$)/,
  /(^|[/\\])__pycache__([/\\]|$)/,
  /(^|[/\\])\.venv([/\\]|$)/,
  /(^|[/\\])build([/\\]|$)/,
  /(^|[/\\])\.cache([/\\]|$)/,
]

export interface SkillsWatcherOptions {
  workspaceDir: string
  debounceMs?: number
  onChange?: (skills: SkillEntry[], event: SkillsChangeEvent) => void
}

export interface SkillsChangeEvent {
  version: number
  reason: 'watch' | 'manual' | 'api'
  changedPath?: string
}

export class SkillsWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private skills: SkillEntry[] = []
  private options: SkillsWatcherOptions
  private version = 0
  private debounceMs: number
  private lastChangedPath: string | undefined

  constructor(options: SkillsWatcherOptions) {
    this.options = options
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  }

  /** 初始加载并启动监听 */
  async start(): Promise<SkillEntry[]> {
    this.skills = loadAllSkills(this.options.workspaceDir)
    this.version = Date.now()

    const watchPaths = getSkillsDirs(this.options.workspaceDir)
    if (watchPaths.length === 0) return this.skills

    this.watcher = watch(watchPaths, {
      ignoreInitial: true,
      depth: 2,               // SKILL.md 最多在 skillsRoot/*/SKILL.md
      ignored: IGNORED_PATTERNS,
    })

    this.watcher
      .on('add', (p) => this.scheduleReload(p))
      .on('change', (p) => this.scheduleReload(p))
      .on('unlink', (p) => this.scheduleReload(p))

    return this.skills
  }

  /** 获取当前 Skills */
  getSkills(): SkillEntry[] {
    return this.skills
  }

  /** 获取当前版本号 */
  getVersion(): number {
    return this.version
  }

  /** 停止监听并释放文件描述符 */
  async close(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      console.log('[skills/watch] Watcher closed, file descriptors released')
    }
  }

  /** 兼容旧 API */
  async stop(): Promise<void> {
    return this.close()
  }

  /** 手动触发重载 */
  reload(reason: 'manual' | 'api' = 'manual'): SkillEntry[] {
    this.skills = loadAllSkills(this.options.workspaceDir)
    this.version++
    const event: SkillsChangeEvent = { version: this.version, reason }
    this.options.onChange?.(this.skills, event)
    console.log(`[skills/watch] Reloaded: ${this.skills.length} skills (v=${this.version}, reason=${reason})`)
    return this.skills
  }

  // ── 私有 ──────────────────────────────────────────────────────────────────

  private scheduleReload(changedPath?: string) {
    // 只关心 SKILL.md 文件的变更
    if (changedPath && !changedPath.endsWith('SKILL.md') && !changedPath.endsWith('.skill.md')) {
      return
    }

    this.lastChangedPath = changedPath

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      try {
        this.skills = loadAllSkills(this.options.workspaceDir)
        this.version++
        const event: SkillsChangeEvent = {
          version: this.version,
          reason: 'watch',
          changedPath: this.lastChangedPath,
        }
        this.options.onChange?.(this.skills, event)
        console.log(`[skills/watch] Reloaded: ${this.lastChangedPath ?? 'unknown'} changed (v=${this.version})`)
      } catch (e) {
        console.error('[skills/watch] Reload error:', e)
      }
    }, this.debounceMs)
  }
}
