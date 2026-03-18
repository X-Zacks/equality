# Delta Spec: Session 并发队列

> Phase 11 实现 [specs/session/spec.md](../../../specs/session/spec.md)「并发控制」

## IMPLEMENTED Requirement

### Requirement: 并发控制

实现细节补充：

- 使用链式 Promise 队列（非 Mutex），per-SessionKey 粒度
- `SessionQueue.enqueue(key, fn)` 保证同 key 严格 FIFO
- chain settle 后自动从 Map 中清理，避免内存泄漏
- Gateway 中所有 runAttempt 调用均包裹在 enqueue 中
