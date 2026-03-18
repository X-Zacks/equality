# Design: Tool Loop Detection

> Phase 6 | Spec: [specs/tools/spec.md](../../specs/tools/spec.md)「工具调用循环检测」章节

## 架构决策

### 1. LoopDetector 为独立类，per-runAttempt 实例化

**选择**：每次 `runAttempt()` 创建一个新的 `LoopDetector` 实例，随 runAttempt 生命周期销毁。

**理由**：
- 循环检测只在单次运行内有意义，跨会话无需持续追踪
- 无需考虑并发、持久化、清理等复杂问题
- 状态隔离，一个 runAttempt 的历史不会影响另一个

### 2. Hash 算法：SHA-256 → hex 前 8 位

**选择**：`createHash('sha256').update(input).digest('hex').slice(0, 8)`

**理由**：
- 8 hex = 32 bits = 40 亿种组合，对于单次 runAttempt 内的几十次调用绰绰有余
- Node.js 内置 `crypto` 模块，零依赖
- argsHash = `name + JSON.stringify(args, sortedKeys)` → 键排序保证序列化稳定

### 3. 检测器优先级顺序

```
circuit_breaker → poll_no_progress → generic_repeat → ping_pong
```

**理由**：
- circuit_breaker 最先检查：全局上限必须最优先
- poll_no_progress 对轮询类工具（bash/process）优先于 generic_repeat，因为阈值更低
- ping_pong 最后检查：需要积累足够历史才有意义

### 4. 终止后的 LLM 总结

**选择**：终止后注入一条 user 消息说明原因，再不带 tools 调一次 LLM 生成总结。

**理由**：
- 用户需要看到一个合理的结尾，而非突然中断
- 不传 tools 确保 LLM 不会继续调工具
- 与之前 circuit_breaker 的处理方式一致

## 数据流

```
工具执行完毕
    ↓
computeArgsHash(name, args) → argsHash (8 hex)
computeResultHash(content)  → resultHash (8 hex)
    ↓
loopDetector.check(name, argsHash, resultHash)
    ↓
    ├─ ok        → 继续
    ├─ warn      → console.warn + 继续
    └─ terminate → 补齐占位 result + 注入终止提示 + LLM 总结 + break
```

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/tools/loop-detector.ts` | 新增 | LoopDetector 类 + Hash 工具函数 |
| `packages/core/src/tools/index.ts` | 修改 | 导出 LoopDetector |
| `packages/core/src/agent/runner.ts` | 修改 | 集成 LoopDetector，移除旧 MAX_TOOL_CALLS |
