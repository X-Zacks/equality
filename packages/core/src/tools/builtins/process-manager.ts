/**
 * tools/builtins/process-manager.ts — 后台进程状态管理
 *
 * 借鉴 OpenClaw 的 exec + process 工具设计。
 * 管理 bash 工具启动的后台进程生命周期。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'

/* ── 类型 ──────────────────────────────────────── */

export interface BackgroundProcess {
  id: string              // 8 位随机 hex
  command: string
  pid: number
  status: 'running' | 'exited'
  exitCode?: number
  stdout: string          // 累积 stdout
  stderr: string          // 累积 stderr
  startedAt: number
  endedAt?: number
  /** 归属的会话 key */
  sessionKey: string
  /** poll 增量偏移（stdout + stderr 合并后的位置） */
  pollOffset: number
  /** 内部引用 */
  _child?: ChildProcess
  _timer?: ReturnType<typeof setTimeout>
}

const DEFAULT_BG_TIMEOUT_MS = 300_000  // 5 分钟
const MAX_BG_OUTPUT_CHARS = 500_000    // 单进程最大输出收集量
const MAX_PROCESSES = 20               // 最大同时后台进程数

/* ── 单例管理器 ────────────────────────────────── */

class ProcessManager {
  private processes = new Map<string, BackgroundProcess>()

  /** 生成 8 位 hex ID */
  private genId(): string {
    return crypto.randomBytes(4).toString('hex')
  }

  /** 启动后台进程 */
  spawn(opts: {
    command: string
    shell: string
    shellArgs: string[]
    cwd: string
    env: Record<string, string>
    timeoutMs?: number
    sessionKey?: string
  }): BackgroundProcess {
    // 限制并发数
    const running = [...this.processes.values()].filter(p => p.status === 'running')
    if (running.length >= MAX_PROCESSES) {
      throw new Error(`后台进程数已达上限 (${MAX_PROCESSES})。请先用 process kill 终止不需要的进程。`)
    }

    const id = this.genId()
    const timeoutMs = opts.timeoutMs ?? DEFAULT_BG_TIMEOUT_MS

    const child = spawn(opts.shell, opts.shellArgs, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    })

    const proc: BackgroundProcess = {
      id,
      command: opts.command,
      pid: child.pid ?? -1,
      status: 'running',
      stdout: '',
      stderr: '',
      startedAt: Date.now(),
      sessionKey: opts.sessionKey ?? '',
      pollOffset: 0,
      _child: child,
    }

    // 收集输出
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      if (proc.stdout.length + text.length < MAX_BG_OUTPUT_CHARS) {
        proc.stdout += text
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      if (proc.stderr.length + text.length < MAX_BG_OUTPUT_CHARS) {
        proc.stderr += text
      }
    })

    // 退出处理
    child.on('close', (code) => {
      proc.status = 'exited'
      proc.exitCode = code ?? -1
      proc.endedAt = Date.now()
      if (proc._timer) {
        clearTimeout(proc._timer)
        proc._timer = undefined
      }
      proc._child = undefined
    })

    child.on('error', (err) => {
      proc.status = 'exited'
      proc.exitCode = -1
      proc.stderr += `\nProcess error: ${err.message}`
      proc.endedAt = Date.now()
      if (proc._timer) {
        clearTimeout(proc._timer)
        proc._timer = undefined
      }
      proc._child = undefined
    })

    // 超时自动终止
    proc._timer = setTimeout(() => {
      if (proc.status === 'running' && proc._child) {
        proc._child.kill('SIGTERM')
        setTimeout(() => {
          if (proc.status === 'running' && proc._child) {
            proc._child.kill('SIGKILL')
          }
        }, 500)
      }
    }, timeoutMs)

    this.processes.set(id, proc)
    return proc
  }

  /** 获取进程 */
  get(id: string): BackgroundProcess | undefined {
    return this.processes.get(id)
  }

  /** 列出所有进程 */
  list(): BackgroundProcess[] {
    return [...this.processes.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  /** 按 sessionKey 过滤列出进程（sessionKey 为空则返回全部） */
  listBySession(sessionKey: string): BackgroundProcess[] {
    return this.list().filter(p => p.sessionKey === sessionKey)
  }

  /**
   * 增量 poll — 返回自上次 poll 以来的新输出
   * 如果没有新输出，等待最多 timeoutMs
   */
  async poll(id: string, timeoutMs: number = 5_000): Promise<{ output: string; status: string; exitCode?: number } | null> {
    const proc = this.processes.get(id)
    if (!proc) return null

    const getIncremental = () => {
      const combined = proc.stdout + (proc.stderr ? '\n[stderr]\n' + proc.stderr : '')
      const newOutput = combined.substring(proc.pollOffset)
      proc.pollOffset = combined.length
      return newOutput
    }

    // 先检查有没有新输出
    let output = getIncremental()
    if (output.length > 0 || proc.status === 'exited') {
      return { output: output || '(无新输出)', status: proc.status, exitCode: proc.exitCode }
    }

    // 没有新输出，等一等
    return new Promise((resolve) => {
      const startWait = Date.now()
      const interval = setInterval(() => {
        output = getIncremental()
        if (output.length > 0 || proc.status === 'exited' || Date.now() - startWait > timeoutMs) {
          clearInterval(interval)
          resolve({
            output: output || '(无新输出)',
            status: proc.status,
            exitCode: proc.exitCode,
          })
        }
      }, 200)
    })
  }

  /** 查看完整日志 */
  log(id: string): string | null {
    const proc = this.processes.get(id)
    if (!proc) return null

    let result = ''
    if (proc.stdout) result += proc.stdout
    if (proc.stderr) result += '\n\n=== stderr ===\n' + proc.stderr
    return result || '(无输出)'
  }

  /** 向 stdin 写入 */
  write(id: string, input: string): boolean {
    const proc = this.processes.get(id)
    if (!proc || !proc._child || proc.status !== 'running') return false
    try {
      proc._child.stdin?.write(input)
      return true
    } catch {
      return false
    }
  }

  /** 终止进程。跨会话 kill 需传 force=true，否则返回 forbidden */
  kill(
    id: string,
    opts?: { sessionKey?: string; force?: boolean }
  ): { success: boolean; exitCode?: number; forbidden?: boolean } {
    const proc = this.processes.get(id)
    if (!proc) return { success: false }

    // 归属校验：如果传了 sessionKey 且不匹配，拒绝（除非 force）
    if (
      opts?.sessionKey &&
      proc.sessionKey &&
      proc.sessionKey !== opts.sessionKey &&
      !opts.force
    ) {
      return { success: false, forbidden: true }
    }

    if (proc.status === 'exited') {
      return { success: true, exitCode: proc.exitCode }
    }

    if (proc._child) {
      proc._child.kill('SIGTERM')
      // 500ms 后强杀
      setTimeout(() => {
        if (proc.status === 'running' && proc._child) {
          proc._child.kill('SIGKILL')
        }
      }, 500)
    }

    return { success: true }
  }

  /** 清理已退出的进程记录 */
  cleanup(): number {
    let count = 0
    for (const [id, proc] of this.processes) {
      if (proc.status === 'exited') {
        this.processes.delete(id)
        count++
      }
    }
    return count
  }
}

/** 全局单例 */
export const processManager = new ProcessManager()
