/**
 * tools/mcp/client.ts — MCP 客户端（stdio 传输）
 *
 * Phase D.2: 通过子进程 stdin/stdout 与 MCP 服务器通信。
 * JSON-RPC 帧格式: Content-Length: N\r\n\r\n{json}
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type {
  McpServerConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeResult,
  McpToolDescription,
  McpToolCallResult,
} from './types.js'

/** 默认工具调用超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 30_000
/** 最大重连次数 */
const MAX_RECONNECT = 3
/** 重连基础延迟（毫秒） */
const RECONNECT_BASE_MS = 1000

export class McpClient {
  private config: McpServerConfig
  private process: ChildProcess | null = null
  private requestId = 0
  private pending = new Map<number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private buffer = ''
  private _connected = false
  private _reconnectCount = 0
  private _lastError?: string
  private _onDisconnect?: () => void

  constructor(config: McpServerConfig) {
    this.config = config
  }

  get connected(): boolean { return this._connected }
  get reconnectCount(): number { return this._reconnectCount }
  get lastError(): string | undefined { return this._lastError }

  /**
   * 设置断开回调（McpClientManager 用于触发重连）
   */
  onDisconnect(cb: () => void): void {
    this._onDisconnect = cb
  }

  /**
   * 连接到 MCP 服务器（spawn 子进程 + initialize 握手）
   */
  async connect(): Promise<McpInitializeResult> {
    const { command, args = [], env } = this.config
    const mergedEnv = { ...process.env, ...env }

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: mergedEnv,
      windowsHide: true,
    })

    // stdout 数据 → JSON-RPC 帧解析
    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8')
      this.drainBuffer()
    })

    // stderr 日志（不阻塞，仅打印）
    this.process.stderr!.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf-8').trim()
      if (msg) console.warn(`[mcp:${this.config.name}] stderr: ${msg}`)
    })

    // 进程退出
    this.process.on('exit', (code) => {
      console.warn(`[mcp:${this.config.name}] 进程退出 code=${code}`)
      this._connected = false
      // reject 所有 pending 请求
      for (const [, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error(`MCP server "${this.config.name}" exited (code=${code})`))
      }
      this.pending.clear()
      this._onDisconnect?.()
    })

    this.process.on('error', (err) => {
      this._lastError = err.message
      console.error(`[mcp:${this.config.name}] spawn 错误:`, err.message)
    })

    // 等待进程启动（给一个 tick 让 error 事件有机会触发）
    await new Promise(r => setTimeout(r, 100))
    if (!this.process.pid) {
      throw new Error(`无法启动 MCP 服务器 "${this.config.name}": ${this._lastError ?? 'spawn failed'}`)
    }

    // initialize 握手
    const initResult = await this.sendRequest<McpInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'equality', version: '0.2.1' },
    })

    // 发送 initialized 通知
    this.sendNotification('notifications/initialized', {})

    this._connected = true
    console.log(`[mcp:${this.config.name}] 已连接, server=${initResult.serverInfo?.name ?? '?'} v${initResult.serverInfo?.version ?? '?'}`)
    return initResult
  }

  /**
   * 列出服务器可用工具
   */
  async listTools(): Promise<McpToolDescription[]> {
    const result = await this.sendRequest<{ tools: McpToolDescription[] }>('tools/list', {})
    return result.tools ?? []
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    return this.sendRequest<McpToolCallResult>('tools/call', { name, arguments: args })
  }

  /**
   * 断开连接（graceful shutdown）
   */
  async disconnect(): Promise<void> {
    if (!this.process || !this._connected) return

    try {
      await this.sendRequest('shutdown', {}, 5000)
    } catch {
      // shutdown 超时不阻塞
    }

    this.sendNotification('exit', {})

    // 给进程 1s 自行退出
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.process?.kill()
        resolve()
      }, 1000)
      this.process!.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })

    this._connected = false
    this.process = null
  }

  /**
   * 重连逻辑（最多 MAX_RECONNECT 次，指数退避）
   */
  async reconnect(): Promise<boolean> {
    if (this._reconnectCount >= MAX_RECONNECT) {
      console.warn(`[mcp:${this.config.name}] 已达最大重连次数 (${MAX_RECONNECT})，放弃重连`)
      return false
    }

    this._reconnectCount++
    const delay = RECONNECT_BASE_MS * Math.pow(2, this._reconnectCount - 1)
    console.log(`[mcp:${this.config.name}] 重连 #${this._reconnectCount}，${delay}ms 后重试...`)
    await new Promise(r => setTimeout(r, delay))

    try {
      this.process = null
      this.buffer = ''
      await this.connect()
      return true
    } catch (err) {
      this._lastError = (err as Error).message
      console.error(`[mcp:${this.config.name}] 重连 #${this._reconnectCount} 失败:`, this._lastError)
      return false
    }
  }

  // ── 内部方法 ────────────────────────────────────────────────────────────────

  private sendRequest<T>(method: string, params: Record<string, unknown>, timeout?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error(`MCP server "${this.config.name}" not connected`))
        return
      }

      const id = ++this.requestId
      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
      const body = JSON.stringify(request)
      const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`

      const timeoutMs = timeout ?? this.config.timeout ?? DEFAULT_TIMEOUT_MS
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (resp: JsonRpcResponse) => {
          if (resp.error) {
            reject(new Error(`MCP error ${resp.error.code}: ${resp.error.message}`))
          } else {
            resolve(resp.result as T)
          }
        },
        reject,
        timer,
      })

      this.process.stdin.write(frame)
    })
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) return
    const notification = { jsonrpc: '2.0', method, params }
    const body = JSON.stringify(notification)
    const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
    this.process.stdin.write(frame)
  }

  /**
   * 从 buffer 中解析完整的 JSON-RPC 帧（Content-Length 协议）
   */
  private drainBuffer(): void {
    while (true) {
      // 查找 header/body 分隔符
      const sepIdx = this.buffer.indexOf('\r\n\r\n')
      if (sepIdx < 0) return

      // 解析 Content-Length
      const header = this.buffer.slice(0, sepIdx)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // 无效 header，跳过
        this.buffer = this.buffer.slice(sepIdx + 4)
        continue
      }

      const contentLength = parseInt(match[1], 10)
      const bodyStart = sepIdx + 4
      const bodyEnd = bodyStart + contentLength

      // body 不完整，等待更多数据
      if (this.buffer.length < bodyEnd) return

      const body = this.buffer.slice(bodyStart, bodyEnd)
      this.buffer = this.buffer.slice(bodyEnd)

      // 解析 JSON-RPC 响应
      try {
        const msg = JSON.parse(body) as JsonRpcResponse
        if ('id' in msg && typeof msg.id === 'number') {
          const pending = this.pending.get(msg.id)
          if (pending) {
            clearTimeout(pending.timer)
            this.pending.delete(msg.id)
            pending.resolve(msg)
          }
        }
        // notification（无 id）暂不处理
      } catch (err) {
        console.warn(`[mcp:${this.config.name}] JSON-RPC 解析错误:`, (err as Error).message)
      }
    }
  }
}
