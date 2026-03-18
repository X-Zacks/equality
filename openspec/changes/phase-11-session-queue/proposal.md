# Proposal: Session 并发队列

> Phase 11 | 优先级: 🟠 P2  
> Spec: [specs/session/spec.md](../../specs/session/spec.md)「并发控制」

## 意图

当前 `/chat/stream` 直接 `await runAttempt()`。如果同一 sessionKey 
的两个请求同时到达（如群组场景多人快速连发），两个 runAttempt 会并发
操作同一 session 的 messages 数组，导致：

- 消息交叉混入
- 持久化时 JSON 文件写入冲突
- LLM 上下文混乱（两条 user 消息紧接着出现）

## 目标

1. **SessionQueue** — per-SessionKey 的链式 Promise 队列
2. **串行保证** — 同一 sessionKey 严格 FIFO 执行
3. **并发自由** — 不同 sessionKey 之间完全并发
4. **零阻塞** — 使用 Promise 链而非互斥锁，不阻塞 Node 事件循环

## 范围

- **包含**：SessionQueue 类、gateway 集成、cancel 集成
- **不包含**：Session 过期清理优化（reap 已有）

## 成功标准

- 同一 sessionKey 第二个请求在第一个完成后才开始 runAttempt
- 不同 sessionKey 请求完全并发
- 用户取消时，队列中等待的请求被正确清理
