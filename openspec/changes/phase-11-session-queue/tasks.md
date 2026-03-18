# Phase 11: Session 并发队列 — Tasks

> 状态：🔄 进行中
> 状态：✅ 完成

## 实施清单

### 1. queue.ts SessionQueue 类

- [x] 1.1 实现 `enqueue<T>(key, fn)` — 链式 Promise 队列
- [x] 1.2 自动清理：chain settle 后从 Map 中删除
- [x] 1.3 `pendingCount(key)` 查询接口
- [x] 1.4 `size` 属性：当前活跃的 session 数

### 2. Gateway 集成（index.ts）

- [x] 2.1 创建全局 sessionQueue 实例
- [x] 2.2 `/chat/stream` 中 runAttempt 包裹在 enqueue 中
- [x] 2.3 `runAgentTurn` 也包裹在 enqueue 中

### 3. 验证

- [x] 3.1 TypeScript 编译零新增错误
