/**
 * tools/lsp/lifecycle.ts — 会话级 LSP 进程生命周期管理
 *
 * Phase B: LSP 语义代码理解
 *
 * 职责：
 *   - 按 workspaceDir + language 缓存 LspClient 实例（进程池）
 *   - 首次调用时自动 spawn + initialize 握手
 *   - 空闲 5 分钟后自动 shutdown + exit
 *   - 启动锁防并发重复启动
 *   - 已打开文件跟踪 + didOpen/didChange 同步
 *   - 缺失依赖检测 + notInstalledLanguages 缓存
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { LspClient } from './client.js'
import { getConfigByLanguage } from './server-configs.js'
import type { LspServerConfig } from './server-configs.js'
import type { MissingDependency } from './types.js'
import { pathToFileUri, detectLanguageId } from './types.js'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 5 * 60 * 1000  // 5 分钟
const INIT_TIMEOUT_MS = 15_000          // 初始化握手超时
const MAX_OPEN_FILES = 100              // 最多跟踪打开的文件数

// ─── 客户端能力声明 ──────────────────────────────────────────────────────────

const CLIENT_CAPABILITIES = {
  textDocument: {
    hover: { contentFormat: ['plaintext', 'markdown'] },
    definition: { linkSupport: true },
    references: {},
    publishDiagnostics: { relatedInformation: false },
    synchronization: {
      didOpen: true,
      didChange: true,
      willSave: false,
      didSave: false,
    },
  },
  workspace: {
    workspaceFolders: false,
  },
}

// ─── ServerEntry ──────────────────────────────────────────────────────────────

interface ServerEntry {
  client: LspClient
  language: string
  workspaceDir: string
  idleTimer: ReturnType<typeof setTimeout>
  /** 已打开的文件 URI → 最后版本号 */
  openedFiles: Map<string, number>
  /** 已打开文件的内容快照（用于增量检测变更） */
  fileContents: Map<string, string>
  /** openedFiles 的访问顺序（用于 LRU 淘汰） */
  openOrder: string[]
}

// ─── LspLifecycle ─────────────────────────────────────────────────────────────

export class LspLifecycle {
  private static instance: LspLifecycle | null = null

  private servers = new Map<string, ServerEntry>()
  private startingLocks = new Map<string, Promise<LspClient | MissingDependency | null>>()
  private notInstalledLanguages = new Set<string>()

  static getInstance(): LspLifecycle {
    if (!LspLifecycle.instance) {
      LspLifecycle.instance = new LspLifecycle()
    }
    return LspLifecycle.instance
  }

  /**
   * 获取或启动 LSP 服务器
   *
   * @param forceRetry 若为 true，忽略 notInstalledLanguages 缓存（安装依赖后重试）
   * @returns LspClient | MissingDependency | null
   */
  async getOrStart(
    workspaceDir: string,
    language: string,
    forceRetry = false,
  ): Promise<LspClient | MissingDependency | null> {
    const key = `${workspaceDir}:${language}`

    // 快速路径 1：已确认不可用
    if (!forceRetry && this.notInstalledLanguages.has(language)) {
      const config = getConfigByLanguage(language)
      return config ? {
        missingCommand: config.command(workspaceDir).cmd,
        installCommand: config.installCommand,
        guideUrl: config.guideUrl,
      } : null
    }

    // 清除不可用缓存（安装后重试场景）
    if (forceRetry) {
      this.notInstalledLanguages.delete(language)
    }

    // 快速路径 2：已有活跃的服务器
    const existing = this.servers.get(key)
    if (existing && !existing.client.isDisposed) {
      this.resetIdleTimer(key, existing)
      return existing.client
    }

    // 清理已废弃的 entry
    if (existing) {
      this.servers.delete(key)
    }

    // 启动锁：防止并发重复启动
    const runningStart = this.startingLocks.get(key)
    if (runningStart) return runningStart

    const startPromise = this.startServer(workspaceDir, language, key)
    this.startingLocks.set(key, startPromise)
    try {
      return await startPromise
    } finally {
      this.startingLocks.delete(key)
    }
  }

  /**
   * 确保文件已"打开"（textDocument/didOpen）或内容已同步（didChange）
   *
   * 必须在每次 LSP 请求前调用，保证服务器看到最新文件内容。
   */
  async ensureFileOpen(entry: ServerEntry, filePath: string): Promise<void> {
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      return // 文件不存在，跳过
    }

    const uri = pathToFileUri(filePath)

    if (entry.openedFiles.has(uri)) {
      // 已打开：检查内容是否变化
      const prev = entry.fileContents.get(uri)
      if (prev !== content) {
        const version = (entry.openedFiles.get(uri)! + 1)
        entry.openedFiles.set(uri, version)
        entry.fileContents.set(uri, content)
        entry.client.notify('textDocument/didChange', {
          textDocument: { uri, version },
          contentChanges: [{ text: content }], // 全量替换
        })
      }
      // 更新 LRU 顺序
      this.touchLru(entry, uri)
    } else {
      // 新打开文件
      this.evictLruIfNeeded(entry)
      const version = 1
      const languageId = detectLanguageId(filePath)
      entry.openedFiles.set(uri, version)
      entry.fileContents.set(uri, content)
      entry.openOrder.push(uri)
      entry.client.notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version, text: content },
      })
    }
  }

  /**
   * 关闭指定 workspaceDir 的所有 LSP 服务器
   */
  async closeAll(workspaceDir?: string): Promise<void> {
    const toClose: [string, ServerEntry][] = []
    for (const [key, entry] of this.servers) {
      if (!workspaceDir || entry.workspaceDir === workspaceDir) {
        toClose.push([key, entry])
      }
    }
    await Promise.all(toClose.map(async ([key, entry]) => {
      clearTimeout(entry.idleTimer)
      this.servers.delete(key)
      await entry.client.dispose()
    }))
  }

  /**
   * 获取已有的 ServerEntry（不启动）
   */
  getEntry(workspaceDir: string, language: string): ServerEntry | null {
    const key = `${workspaceDir}:${language}`
    const entry = this.servers.get(key)
    return (entry && !entry.client.isDisposed) ? entry : null
  }

  // ── 私有方法 ─────────────────────────────────────────────────────────────

  private async startServer(
    workspaceDir: string,
    language: string,
    key: string,
  ): Promise<LspClient | MissingDependency | null> {
    const config = getConfigByLanguage(language)
    if (!config) {
      console.warn(`[lsp-lifecycle] 不支持的语言: ${language}`)
      return null
    }

    // 检测工作区适用性
    if (!config.detect(workspaceDir)) {
      console.log(`[lsp-lifecycle] 工作区 ${workspaceDir} 不适用 ${language}`)
      return null
    }

    const cmdInfo = config.command(workspaceDir)
    let serverProcess: ReturnType<typeof spawn>

    try {
      serverProcess = spawn(cmdInfo.cmd, cmdInfo.args, {
        cwd: workspaceDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...cmdInfo.env },
        // Windows 下需要 shell=true：
        // 1. .cmd 文件（npm 全局包的 shim）必须通过 shell 启动
        // 2. 全局 PATH 中的命令（如 npx）在 spawn 中找不到，也需要 shell
        shell: process.platform === 'win32',
      })
    } catch (err: any) {
      return this.handleSpawnError(err, config, workspaceDir, language)
    }

    // 监听 spawn 错误（ENOENT 等异步抛出）
    const spawnError = await new Promise<Error | null>((resolve) => {
      serverProcess.on('error', (err) => resolve(err))
      // 如果 100ms 内没有 error 事件，认为 spawn 成功
      setTimeout(() => resolve(null), 100)
    })

    if (spawnError) {
      return this.handleSpawnError(spawnError, config, workspaceDir, language)
    }

    const client = new LspClient(serverProcess)

    // 初始化握手
    try {
      const initResult = await client.request<{ capabilities: Record<string, unknown> }>('initialize', {
        processId: process.pid,
        rootUri: pathToFileUri(workspaceDir),
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: config.initOptions,
      }, INIT_TIMEOUT_MS)

      client.serverCapabilities = initResult?.capabilities ?? {}
      client.notify('initialized', {})
    } catch (err) {
      console.warn(`[lsp-lifecycle] ${language} 初始化超时/失败:`, (err as Error).message)
      await client.dispose()
      return null
    }

    // 注册到进程池
    const entry: ServerEntry = {
      client,
      language,
      workspaceDir,
      idleTimer: setTimeout(() => {}, 0), // 占位
      openedFiles: new Map(),
      fileContents: new Map(),
      openOrder: [],
    }
    this.servers.set(key, entry)
    this.resetIdleTimer(key, entry)

    console.log(`[lsp-lifecycle] ✅ ${language} 服务器已启动 (workspace: ${workspaceDir})`)
    return client
  }

  private handleSpawnError(
    err: any,
    config: LspServerConfig,
    workspaceDir: string,
    language: string,
  ): MissingDependency | null {
    if (err.code === 'ENOENT' || err.message?.includes('ENOENT')) {
      this.notInstalledLanguages.add(language)
      return {
        missingCommand: config.command(workspaceDir).cmd,
        installCommand: config.installCommand,
        guideUrl: config.guideUrl,
      }
    }
    console.warn(`[lsp-lifecycle] ${language} 启动错误:`, err.message)
    return null
  }

  private resetIdleTimer(key: string, entry: ServerEntry): void {
    clearTimeout(entry.idleTimer)
    entry.idleTimer = setTimeout(async () => {
      console.log(`[lsp-lifecycle] ${entry.language} 空闲超时，关闭服务器`)
      this.servers.delete(key)
      await entry.client.dispose()
    }, IDLE_TIMEOUT_MS)
  }

  private touchLru(entry: ServerEntry, uri: string): void {
    const idx = entry.openOrder.indexOf(uri)
    if (idx >= 0) entry.openOrder.splice(idx, 1)
    entry.openOrder.push(uri)
  }

  private evictLruIfNeeded(entry: ServerEntry): void {
    while (entry.openOrder.length >= MAX_OPEN_FILES) {
      const oldest = entry.openOrder.shift()
      if (oldest) {
        entry.openedFiles.delete(oldest)
        entry.fileContents.delete(oldest)
        // 通知服务器关闭文件
        entry.client.notify('textDocument/didClose', {
          textDocument: { uri: oldest },
        })
      }
    }
  }
}
