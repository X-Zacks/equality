# Phase 6: Tool Loop Detection — Tasks

> 状态：✅ 完成  
> Spec: [specs/tools/spec.md](../../specs/tools/spec.md)「工具调用循环检测」章节

## 实施清单

### 1. Hash 基础设施

- [x] 1.1 实现 `computeArgsHash(name, args)`：JSON stringify（键排序）→ SHA-256 → hex 前 8 位
- [x] 1.2 实现 `computeResultHash(content)`：SHA-256 → hex 前 8 位

### 2. LoopDetector 类

- [x] 2.1 实现 `LoopDetector` 类，维护 `ToolCallRecord[]` 调用历史
- [x] 2.2 实现检测器 1：`generic_repeat`（warn@10, terminate@20）
- [x] 2.3 实现检测器 2：`poll_no_progress`（warn@5, terminate@10，仅 bash/process）
- [x] 2.4 实现检测器 3：`ping_pong`（≥20 次交替 + 双方结果稳定）
- [x] 2.5 实现检测器 4：`circuit_breaker`（>30 次立即终止）
- [x] 2.6 `check()` 方法按优先级调用检测器，返回 `DetectorVerdict`

### 3. Runner 集成

- [x] 3.1 导出 `LoopDetector` + hash 函数到 `tools/index.ts`
- [x] 3.2 移除 `runner.ts` 中旧的 `MAX_TOOL_CALLS = 30` 硬编码
- [x] 3.3 每次 `runAttempt` 创建 `LoopDetector` 实例
- [x] 3.4 工具执行后调用 `loopDetector.check()`
- [x] 3.5 `warn` → `console.warn` 输出日志
- [x] 3.6 `terminate` → 补齐占位 result + 注入终止提示 + LLM 总结一轮

### 4. 验证

- [x] 4.1 TypeScript 编译零新增错误
