# Design: Session 并发队列

> Phase 11 | Spec: [specs/session/spec.md](../../specs/session/spec.md)「并发控制」

## 架构决策

### 1. 链式 Promise 队列

**选择**：per-SessionKey 的 Promise 链，不用 Mutex/Semaphore 库。

```typescript
class SessionQueue {
  private chains = new Map<string, Promise<void>>()

  async enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve()
    const next = prev.then(() => fn(), () => fn())
    this.chains.set(key, next.then(() => {}, () => {}))
    return next
  }
}
```

**理由**：
- 零依赖，~20 行代码
- 基于 Promise 微任务队列，不阻塞事件循环
- 自动 GC：当 chain resolve 后 Map 中只保留最后一个 Promise

### 2. 队列清理

链完成后检查是否还有等待项。如果 chain 已 settle 且没有新的 enqueue，
从 Map 中删除以避免内存泄漏。

### 3. Gateway 集成

```typescript
// 之前
const result = await runAttempt({ sessionKey, ... })

// 之后
const result = await sessionQueue.enqueue(sessionKey, () => runAttempt({ sessionKey, ... }))
```

### 4. 取消处理

用户取消（abort）时，当前执行的 runAttempt 通过 AbortSignal 中断。
队列中等待的下一个请求会在 chain 的 then 回调中正常执行。
不需要清空队列——后续请求仍然有效。

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/session/queue.ts` | 新增 | SessionQueue 类 |
| `packages/core/src/index.ts` | 修改 | 集成 SessionQueue |
