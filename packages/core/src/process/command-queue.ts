/**
 * process/command-queue.ts — 命令队列
 *
 * Phase L3 (GAP-34): 限制并发子进程数。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommandQueueOptions {
  maxConcurrent?: number    // default 5
  queueTimeout?: number     // max time in queue (ms), default 60000
}

export type CommandStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timeout'

export interface QueuedCommand {
  id: string
  command: string
  cwd: string
  priority: number
  enqueueTime: number
  startTime?: number
  endTime?: number
  status: CommandStatus
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENT = 5
const DEFAULT_QUEUE_TIMEOUT = 60_000

export const COMMAND_STATUSES: readonly CommandStatus[] = ['queued', 'running', 'completed', 'failed', 'timeout']

// ─── Internal ───────────────────────────────────────────────────────────────

interface InternalCommand extends QueuedCommand {
  resolve: (cmd: QueuedCommand) => void
  reject: (err: Error) => void
  timer?: ReturnType<typeof setTimeout>
  executor?: (cmd: QueuedCommand) => Promise<void>
}

let nextId = 1

// ─── CommandQueue ───────────────────────────────────────────────────────────

export class CommandQueue {
  readonly maxConcurrent: number
  private queueTimeout: number
  private queue: InternalCommand[] = []
  private running = new Map<string, InternalCommand>()

  constructor(opts?: CommandQueueOptions) {
    this.maxConcurrent = opts?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    this.queueTimeout = opts?.queueTimeout ?? DEFAULT_QUEUE_TIMEOUT
  }

  /**
   * 入队命令。如果并发未满则立即执行，否则排队。
   *
   * @param command — 要执行的命令字符串
   * @param cwd — 工作目录
   * @param opts — 可选参数
   * @param executor — 实际执行函数（可注入，便于测试）
   */
  enqueue(
    command: string,
    cwd: string,
    opts?: { priority?: number; timeout?: number },
    executor?: (cmd: QueuedCommand) => Promise<void>,
  ): Promise<QueuedCommand> {
    return new Promise((resolve, reject) => {
      const cmd: InternalCommand = {
        id: `cmd-${nextId++}`,
        command,
        cwd,
        priority: opts?.priority ?? 0,
        enqueueTime: Date.now(),
        status: 'queued',
        resolve,
        reject,
        executor,
      }

      // 排队超时
      const timeout = opts?.timeout ?? this.queueTimeout
      cmd.timer = setTimeout(() => {
        if (cmd.status === 'queued') {
          cmd.status = 'timeout'
          this.removeFromQueue(cmd.id)
          reject(new Error(`Command "${command}" timed out in queue after ${timeout}ms`))
        }
      }, timeout)

      this.queue.push(cmd)
      this.processQueue()
    })
  }

  /**
   * 查询队列状态。
   */
  getStatus(): { running: number; queued: number; maxConcurrent: number } {
    return {
      running: this.running.size,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    }
  }

  /**
   * 终止指定命令。
   */
  kill(commandId: string): boolean {
    // 从队列中移除
    const qIdx = this.queue.findIndex(c => c.id === commandId)
    if (qIdx >= 0) {
      const cmd = this.queue.splice(qIdx, 1)[0]
      if (cmd.timer) clearTimeout(cmd.timer)
      cmd.status = 'failed'
      cmd.reject(new Error('Killed while queued'))
      return true
    }

    // 标记运行中的为 failed（实际 kill 由调用者处理）
    const running = this.running.get(commandId)
    if (running) {
      running.status = 'failed'
      return true
    }

    return false
  }

  /**
   * 清空队列并等待运行中的命令完成。
   */
  async drain(): Promise<void> {
    // 取消所有排队的
    for (const cmd of [...this.queue]) {
      if (cmd.timer) clearTimeout(cmd.timer)
      cmd.status = 'failed'
      cmd.reject(new Error('Drained'))
    }
    this.queue = []

    // 等待运行中的完成
    if (this.running.size > 0) {
      await Promise.allSettled(
        [...this.running.values()].map(cmd =>
          new Promise<void>(resolve => {
            const check = () => {
              if (!this.running.has(cmd.id)) resolve()
              else setTimeout(check, 50)
            }
            check()
          })
        ),
      )
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private processQueue(): void {
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      // 按优先级排序（lower = higher priority）
      this.queue.sort((a, b) => a.priority - b.priority)
      const cmd = this.queue.shift()!
      if (cmd.timer) clearTimeout(cmd.timer)

      cmd.status = 'running'
      cmd.startTime = Date.now()
      this.running.set(cmd.id, cmd)

      this.executeCommand(cmd)
    }
  }

  private async executeCommand(cmd: InternalCommand): Promise<void> {
    try {
      if (cmd.executor) {
        await cmd.executor(cmd)
      }
      if (cmd.status === 'running') {
        cmd.status = 'completed'
      }
      cmd.endTime = Date.now()
      cmd.resolve(cmd)
    } catch (err) {
      cmd.status = 'failed'
      cmd.endTime = Date.now()
      cmd.resolve(cmd) // 仍然 resolve 但 status=failed
    } finally {
      this.running.delete(cmd.id)
      this.processQueue()
    }
  }

  private removeFromQueue(id: string): void {
    this.queue = this.queue.filter(c => c.id !== id)
  }
}
