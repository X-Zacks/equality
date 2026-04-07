/**
 * diagnostics/queued-writer.ts — 异步队列文件写入器
 *
 * Phase I4 (GAP-23): 非阻塞 JSONL 追踪写入。
 * 参考 OpenClaw queued-file-writer.ts。
 */

import fs from 'node:fs'
import path from 'node:path'

export interface QueuedFileWriter {
  write(data: string): void
  close(): void
}

/**
 * 创建一个异步队列写入器。
 * - 每次 write() 立即返回，数据排队异步写入
 * - 自动创建父目录
 * - 错误只 warn 不抛出（不影响主逻辑）
 */
export function createQueuedFileWriter(filePath: string): QueuedFileWriter {
  let fd: number | null = null
  const queue: string[] = []
  let flushing = false

  function ensureFd(): number | null {
    if (fd !== null) return fd
    try {
      const dir = path.dirname(filePath)
      fs.mkdirSync(dir, { recursive: true })
      fd = fs.openSync(filePath, 'a')
      return fd
    } catch (err) {
      console.warn(`[queued-writer] 无法打开 ${filePath}: ${String(err)}`)
      return null
    }
  }

  function flush(): void {
    if (flushing || queue.length === 0) return
    flushing = true

    const currentFd = ensureFd()
    if (currentFd === null) {
      queue.length = 0
      flushing = false
      return
    }

    const batch = queue.splice(0)
    const combined = batch.join('')

    try {
      fs.writeSync(currentFd, combined)
    } catch (err) {
      console.warn(`[queued-writer] 写入失败: ${String(err)}`)
    }

    flushing = false

    // 如果 flush 期间有新数据入队，再次 flush
    if (queue.length > 0) {
      setImmediate(flush)
    }
  }

  return {
    write(data: string): void {
      queue.push(data)
      // 使用 setImmediate 避免同步阻塞
      if (!flushing) {
        setImmediate(flush)
      }
    },

    close(): void {
      // 同步刷完剩余
      if (queue.length > 0) {
        const currentFd = ensureFd()
        if (currentFd !== null) {
          try { fs.writeSync(currentFd, queue.splice(0).join('')) } catch { /* ignore */ }
        }
      }
      if (fd !== null) {
        try { fs.closeSync(fd) } catch { /* ignore */ }
        fd = null
      }
    },
  }
}

/**
 * 全局写入器缓存，同一路径复用。
 */
const globalWriters = new Map<string, QueuedFileWriter>()

export function getQueuedFileWriter(filePath: string): QueuedFileWriter {
  let writer = globalWriters.get(filePath)
  if (!writer) {
    writer = createQueuedFileWriter(filePath)
    globalWriters.set(filePath, writer)
  }
  return writer
}
