/**
 * SessionQueue — per-SessionKey 链式 Promise 队列
 *
 * Phase 11: 保证同一 SessionKey 的请求严格串行执行，
 * 不同 SessionKey 完全并发。
 *
 * 原理：每个 key 维护一条 Promise 链，新任务 .then() 到链尾。
 * 不使用 Mutex/Semaphore，零依赖，不阻塞事件循环。
 */

export class SessionQueue {
  /** key → 当前链尾的 Promise（resolve 后表示链中所有任务完成） */
  private chains = new Map<string, Promise<void>>()

  /** key → 当前队列中等待/执行中的任务数 */
  private counts = new Map<string, number>()

  /**
   * 将任务 fn 排入 key 的队列。
   * 同一 key 的任务严格 FIFO；不同 key 之间完全并发。
   */
  async enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // 增加计数
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)

    // 拿到当前链尾（没有则已 resolve）
    const prev = this.chains.get(key) ?? Promise.resolve()

    // 构造新的 Promise：前一个完成（无论成败）后执行 fn
    let resolve!: (value: T) => void
    let reject!: (err: unknown) => void
    const result = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    // 链式：等前一个 settle 后再执行
    const next = prev
      .catch(() => {}) // 前一个失败不影响后续
      .then(async () => {
        try {
          const value = await fn()
          resolve(value)
        } catch (err) {
          reject(err)
        }
      })

    // 更新链尾（忽略 next 的 resolve 值）
    this.chains.set(key, next.then(() => {}, () => {}))

    // fn 完成后清理计数
    result
      .catch(() => {})
      .finally(() => {
        const c = (this.counts.get(key) ?? 1) - 1
        if (c <= 0) {
          this.counts.delete(key)
          this.chains.delete(key)
        } else {
          this.counts.set(key, c)
        }
      })

    return result
  }

  /** 查询某 key 当前队列中的任务数（包含正在执行的） */
  pendingCount(key: string): number {
    return this.counts.get(key) ?? 0
  }

  /** 当前有活跃队列的 session 数 */
  get size(): number {
    return this.chains.size
  }
}
