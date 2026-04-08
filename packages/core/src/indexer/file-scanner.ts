/**
 * indexer/file-scanner.ts — 项目文件扫描器
 *
 * Phase N3 (N3.1.1): 借鉴 claw-code PortContext + PortManifest
 * - 全量扫描
 * - 增量扫描
 * - ProjectManifest 生成
 * - 配置化 include/exclude
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, extname, basename } from 'node:path'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface FileScannerConfig {
  /** 项目根目录 */
  rootDir: string
  /** glob 包含模式 */
  include: string[]
  /** glob 排除模式 */
  exclude: string[]
  /** 最大文件大小（字节，默认 102400 = 100KB） */
  maxFileSize: number
  /** 最大文件总数（默认 10000） */
  maxTotalFiles: number
  /** 增量监听模式（暂不实现 watcher，仅用于配置标记） */
  watchMode: boolean
}

export interface ScannedFile {
  /** 相对于 rootDir 的路径 */
  relativePath: string
  /** 绝对路径 */
  absolutePath: string
  /** 文件大小（字节） */
  size: number
  /** 文件扩展名（含点） */
  extension: string
  /** 文件内容（全量扫描时读取） */
  content?: string
}

export interface ScanResult {
  /** 成功索引的文件列表 */
  indexedFiles: ScannedFile[]
  /** 跳过的文件路径 */
  skippedFiles: string[]
  /** 跳过原因 */
  skippedReasons: Map<string, string>
  /** 扫描耗时 ms */
  durationMs: number
}

export interface ProjectManifest {
  /** 项目根目录 */
  rootDir: string
  /** 已索引文件数 */
  totalFiles: number
  /** 按扩展名统计：{ '.ts': 30, '.tsx': 15, ... } */
  filesByExtension: Record<string, number>
  /** 顶层目录信息 */
  topLevelModules: Array<{ name: string; fileCount: number }>
  /** 最后扫描时间 */
  lastScanAt: number
}

export const DEFAULT_SCANNER_CONFIG: Omit<FileScannerConfig, 'rootDir'> = {
  include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.md', '**/*.json', '**/*.css', '**/*.html'],
  exclude: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.lock', '**/*.d.ts'],
  maxFileSize: 102_400,
  maxTotalFiles: 10_000,
  watchMode: false,
}

// ─── 简易 glob 匹配 ──────────────────────────────────────────────────────────

// 简易 glob 匹配（支持 ** 和 *）。
// 不依赖外部库。足以覆盖常见的 include/exclude 模式。
//
// 语义约定：
// - `**`   匹配零个或多个目录（包含根目录）
// - `*`    匹配不含路径分隔符的任意字符
// - `**/X` 匹配任意深度的 X（包括根层 X）
function matchGlob(pattern: string, filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/')

  // 将 glob 转为正则
  let regStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\{([^}]+)\}/g, (_match, group) => {
      const alternatives = group.split(',').join('|')
      return '(' + alternatives + ')'
    })

  // 处理 **/ 和 ** — 分步处理以保持正确性
  // 先保护 **
  regStr = regStr.replace(/\*\*\//g, '§§/')  // **/ → §§/
  regStr = regStr.replace(/\*\*/g, '§§')      // 剩余 ** → §§
  regStr = regStr.replace(/\*/g, '[^/]*')      // * → 非路径分隔符
  // §§/ → 零个或多个目录前缀（包括空）
  regStr = regStr.replace(/§§\//g, '(?:.*/)?')
  // 单独 §§ → 任意路径
  regStr = regStr.replace(/§§/g, '.*')

  const reg = new RegExp('^' + regStr + '$')
  return reg.test(normalizedPath)
}

function matchesAny(patterns: string[], filePath: string): boolean {
  return patterns.some(p => matchGlob(p, filePath))
}

// ─── FileScanner 类 ──────────────────────────────────────────────────────────

export class FileScanner {
  private readonly _config: FileScannerConfig
  private _lastScanResult: ScanResult | null = null
  private _manifest: ProjectManifest | null = null

  constructor(config: Partial<FileScannerConfig> & { rootDir: string }) {
    this._config = {
      ...DEFAULT_SCANNER_CONFIG,
      ...config,
    }
  }

  /** 全量扫描 */
  scanAll(): ScanResult {
    const start = Date.now()
    const indexed: ScannedFile[] = []
    const skipped: string[] = []
    const reasons = new Map<string, string>()

    this._walkDir(this._config.rootDir, '', indexed, skipped, reasons)

    const result: ScanResult = {
      indexedFiles: indexed,
      skippedFiles: skipped,
      skippedReasons: reasons,
      durationMs: Date.now() - start,
    }

    this._lastScanResult = result
    this._buildManifest(result)
    return result
  }

  /** 增量扫描（只处理指定路径） */
  scanIncremental(changedPaths: string[]): ScanResult {
    const start = Date.now()
    const indexed: ScannedFile[] = []
    const skipped: string[] = []
    const reasons = new Map<string, string>()

    for (const p of changedPaths) {
      const absPath = join(this._config.rootDir, p)
      const relPath = p.replace(/\\/g, '/')

      if (!existsSync(absPath)) {
        skipped.push(relPath)
        reasons.set(relPath, 'file_not_found')
        continue
      }

      const result = this._processFile(absPath, relPath)
      if (result.ok) {
        indexed.push(result.file!)
      } else {
        skipped.push(relPath)
        reasons.set(relPath, result.reason!)
      }
    }

    const result: ScanResult = {
      indexedFiles: indexed,
      skippedFiles: skipped,
      skippedReasons: reasons,
      durationMs: Date.now() - start,
    }

    // 合并到 manifest
    if (this._lastScanResult) {
      // 替换已有文件，添加新文件
      const existing = new Map(
        this._lastScanResult.indexedFiles.map(f => [f.relativePath, f]),
      )
      for (const f of indexed) {
        existing.set(f.relativePath, f)
      }
      this._lastScanResult.indexedFiles = [...existing.values()]
      this._buildManifest(this._lastScanResult)
    }

    return result
  }

  /** 获取项目概览 */
  getManifest(): ProjectManifest | null {
    return this._manifest
  }

  /** 获取最近一次扫描结果 */
  get lastScanResult(): ScanResult | null {
    return this._lastScanResult
  }

  /** 配置引用 */
  get config(): Readonly<FileScannerConfig> {
    return this._config
  }

  // ─── 内部辅助 ─────────────────────────────────────────────────────────────

  private _walkDir(
    absDir: string,
    relDir: string,
    indexed: ScannedFile[],
    skipped: string[],
    reasons: Map<string, string>,
  ): void {
    if (indexed.length >= this._config.maxTotalFiles) return

    let entries: string[]
    try {
      entries = readdirSync(absDir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (indexed.length >= this._config.maxTotalFiles) break

      const absPath = join(absDir, entry)
      const relPath = relDir ? `${relDir}/${entry}` : entry

      // 检查排除
      if (matchesAny(this._config.exclude, relPath)) {
        skipped.push(relPath)
        reasons.set(relPath, 'excluded_by_pattern')
        continue
      }

      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(absPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        // 对目录也检查排除（如 node_modules/）
        if (matchesAny(this._config.exclude, `${relPath}/`)) {
          skipped.push(relPath)
          reasons.set(relPath, 'excluded_by_pattern')
          continue
        }
        this._walkDir(absPath, relPath, indexed, skipped, reasons)
      } else if (stat.isFile()) {
        const result = this._processFile(absPath, relPath, stat.size)
        if (result.ok) {
          indexed.push(result.file!)
        } else {
          skipped.push(relPath)
          reasons.set(relPath, result.reason!)
        }
      }
    }
  }

  private _processFile(
    absPath: string,
    relPath: string,
    fileSize?: number,
  ): { ok: boolean; file?: ScannedFile; reason?: string } {
    const ext = extname(absPath)
    const size = fileSize ?? (existsSync(absPath) ? statSync(absPath).size : 0)

    // 检查 include
    if (!matchesAny(this._config.include, relPath)) {
      return { ok: false, reason: 'not_included' }
    }

    // 检查文件大小
    if (size > this._config.maxFileSize) {
      return { ok: false, reason: 'file_too_large' }
    }

    // 读取内容
    let content: string
    try {
      content = readFileSync(absPath, 'utf-8')
    } catch {
      return { ok: false, reason: 'read_error' }
    }

    return {
      ok: true,
      file: {
        relativePath: relPath.replace(/\\/g, '/'),
        absolutePath: absPath,
        size,
        extension: ext,
        content,
      },
    }
  }

  private _buildManifest(scanResult: ScanResult): void {
    const byExt: Record<string, number> = {}
    const byTopDir: Record<string, number> = {}

    for (const file of scanResult.indexedFiles) {
      // 按扩展名
      const ext = file.extension || '(no ext)'
      byExt[ext] = (byExt[ext] ?? 0) + 1

      // 按顶层目录
      const parts = file.relativePath.split('/')
      const topDir = parts.length > 1 ? parts[0] : '(root)'
      byTopDir[topDir] = (byTopDir[topDir] ?? 0) + 1
    }

    this._manifest = {
      rootDir: this._config.rootDir,
      totalFiles: scanResult.indexedFiles.length,
      filesByExtension: byExt,
      topLevelModules: Object.entries(byTopDir)
        .map(([name, fileCount]) => ({ name, fileCount }))
        .sort((a, b) => b.fileCount - a.fileCount),
      lastScanAt: Date.now(),
    }
  }
}
