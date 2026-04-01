/**
 * tools/lsp/client.ts — LSP JSON-RPC 客户端
 *
 * Phase B: LSP 语义代码理解
 *
 * 负责：
 *   1. Content-Length 帧协议的编解码（Buffer 级别，正确处理多字节 UTF-8）
 *   2. request(method, params) → Promise<T>（含超时保护）
 *   3. notify(method, params) 单向通知
 *   4. publishDiagnostics 通知监听 → diagnostics 缓存
 *   5. dispose()：发送 shutdown + exit，清理资源
 */

import type { ChildProcess } from 'node:child_process'
import type {
  LspResponse,
  Diagnostic,
  PublishDiagnosticsParams,
} from './types.js'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const HEADER_SEPARATOR = '\r\n\r\n'
const HEADER_SEPARATOR_BUF = Buffer.from(HEADER_SEPARATOR)

// ─── Pending 请求管理 ────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeoutHandle: ReturnType<typeof setTimeout>
}

// ─── LspClient ────────────────────────────────────────────────────────────────

export class LspClient {
  private process: ChildProcess
  private pending = new Map<number, PendingRequest>()
  private idCounter = 0
  private rawBuffer = Buffer.alloc(0)
  private disposed = false

  /** 诊断缓存（服务器主动推送，按 file URI 索引） */
  public diagnostics = new Map<string, Diagnostic[]>()

  /** 服务器能力（initialize 响应中返回） */
  public serverCapabilities: Record<string, unknown> = {}

  constructor(serverProcess: ChildProcess) {
    this.process = serverProcess

    // 监听 stdout（帧数据）
    serverProcess.stdout?.on('data', (chunk: Buffer) => this.onData(chunk))

    // 监听 stderr（仅日志，不影响协议）
    serverProcess.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf-8').trim()
      if (msg) console.warn(`[lsp-server-stderr] ${msg.slice(0, 200)}`)
    })

    // 进程意外退出
    serverProcess.on('close', (code) => {
      if (!this.disposed) {
        console.warn(`[lsp-client] 服务器进程退出, code=${code}`)
        this.rejectAllPending(new Error(`LSP 服务器进程退出 (code ${code})`))
        this.disposed = true
      }
    })

    serverProcess.on('error', (err) => {
      if (!this.disposed) {
        console.warn(`[lsp-client] 服务器进程错误:`, err.message)
        this.rejectAllPending(err)
        this.disposed = true
      }
    })
  }

  /** 是否已关闭 */
  get isDisposed(): boolean {
    return this.disposed
  }

  // ── 公开 API ────────────────────────────────────────────────────────────

  /**
   * 发送 JSON-RPC 请求，等待响应
   * @throws 超时或服务器返回 error 时抛异常
   */
  async request<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (this.disposed) throw new Error('LspClient 已关闭')

    const id = ++this.idCounter
    const message = { jsonrpc: '2.0' as const, id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP 请求超时 (${timeoutMs}ms): ${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timeoutHandle,
      })
      this.send(message)
    })
  }

  /**
   * 发送 JSON-RPC 通知（无响应）
   */
  notify(method: string, params?: unknown): void {
    if (this.disposed) return
    this.send({ jsonrpc: '2.0', method, params })
  }

  /**
   * 等待指定 URI 的诊断通知到达
   * @param uri file:// URI
   * @param timeoutMs 最长等待时间
   * @returns 该文件的诊断列表
   */
  waitForDiagnostics(uri: string, timeoutMs = 3_000): Promise<Diagnostic[]> {
    // 如果已有缓存，直接返回
    const cached = this.diagnostics.get(uri)
    if (cached && cached.length > 0) {
      return Promise.resolve(cached)
    }

    return new Promise<Diagnostic[]>((resolve) => {
      const check = () => {
        const diags = this.diagnostics.get(uri)
        if (diags !== undefined) {
          clearTimeout(timer)
          clearInterval(interval)
          resolve(diags)
        }
      }
      const interval = setInterval(check, 200)
      const timer = setTimeout(() => {
        clearInterval(interval)
        resolve(this.diagnostics.get(uri) ?? [])
      }, timeoutMs)
    })
  }

  /**
   * 优雅关闭：发送 shutdown → exit
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    try {
      // shutdown 是请求，需要响应
      await this.request('shutdown', undefined, 5_000).catch(() => {})
      // exit 是通知
      this.notify('exit')
    } catch {
      // 忽略
    }

    // 清理 pending
    this.rejectAllPending(new Error('LspClient disposed'))

    // 强制 kill（以防 exit 通知未生效）
    setTimeout(() => {
      try { this.process.kill('SIGKILL') } catch { /* 可能已退出 */ }
    }, 2_000)
  }

  // ── 内部方法 ─────────────────────────────────────────────────────────────

  /**
   * 处理 stdout 的原始字节数据
   *
   * 关键：Content-Length 表示字节数，必须在 Buffer 级别解析
   */
  private onData(chunk: Buffer): void {
    this.rawBuffer = Buffer.concat([this.rawBuffer, chunk])
    this.parseFrames()
  }

  /**
   * 从 rawBuffer 中解析完整的 JSON-RPC 帧
   */
  private parseFrames(): void {
    while (true) {
      const separatorIdx = bufferIndexOf(this.rawBuffer, HEADER_SEPARATOR_BUF)
      if (separatorIdx < 0) break

      // 解析 header
      const header = this.rawBuffer.subarray(0, separatorIdx).toString('ascii')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // 无效 header，跳过
        this.rawBuffer = this.rawBuffer.subarray(separatorIdx + HEADER_SEPARATOR_BUF.length)
        continue
      }

      const bodyLen = parseInt(match[1], 10)
      const bodyStart = separatorIdx + HEADER_SEPARATOR_BUF.length
      const totalLen = bodyStart + bodyLen

      // 数据未到齐，等下一次 onData
      if (this.rawBuffer.length < totalLen) break

      // 解析 body
      const bodyBuf = this.rawBuffer.subarray(bodyStart, totalLen)
      this.rawBuffer = this.rawBuffer.subarray(totalLen)

      try {
        const message = JSON.parse(bodyBuf.toString('utf-8'))
        this.dispatchMessage(message)
      } catch (err) {
        console.warn('[lsp-client] JSON 解析失败，跳过帧:', (err as Error).message)
      }
    }
  }

  /**
   * 派发解析后的 JSON-RPC 消息
   */
  private dispatchMessage(message: any): void {
    // 响应（有 id）
    if ('id' in message && message.id != null) {
      const pending = this.pending.get(message.id)
      if (pending) {
        this.pending.delete(message.id)
        clearTimeout(pending.timeoutHandle)

        const resp = message as LspResponse
        if (resp.error) {
          pending.reject(new Error(`LSP error (${resp.error.code}): ${resp.error.message}`))
        } else {
          pending.resolve(resp.result)
        }
      }
      return
    }

    // 通知（无 id）
    if ('method' in message) {
      this.handleNotification(message.method, message.params)
    }
  }

  /**
   * 处理服务器推送的通知
   */
  private handleNotification(method: string, params: unknown): void {
    if (method === 'textDocument/publishDiagnostics') {
      const p = params as PublishDiagnosticsParams
      if (p?.uri && Array.isArray(p.diagnostics)) {
        this.diagnostics.set(p.uri, p.diagnostics)
      }
    }
    // 其他通知静默忽略（window/logMessage 等）
  }

  /**
   * 发送帧（编码 Content-Length header + JSON body）
   */
  private send(message: object): void {
    if (!this.process.stdin?.writable) return
    const body = JSON.stringify(message)
    const bodyBuf = Buffer.from(body, 'utf-8')
    const header = `Content-Length: ${bodyBuf.length}${HEADER_SEPARATOR}`
    this.process.stdin.write(header)
    this.process.stdin.write(bodyBuf)
  }

  /**
   * reject 所有 pending 请求
   */
  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutHandle)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** Buffer 中查找子序列的位置（类似 indexOf） */
function bufferIndexOf(buf: Buffer, search: Buffer): number {
  for (let i = 0; i <= buf.length - search.length; i++) {
    let found = true
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break }
    }
    if (found) return i
  }
  return -1
}
