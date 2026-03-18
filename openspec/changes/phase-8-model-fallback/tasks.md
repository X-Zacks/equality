# Phase 8: Model Fallback — Tasks

> 状态：✅ 完成  
> Spec: [specs/llm-provider/spec.md](../../specs/llm-provider/spec.md)「Model Fallback（降级链）」

## 实施清单

### 1. FallbackProvider 类（fallback.ts）

- [x] 1.1 实现错误分类函数 `classifyError(err)` → `'fallback' | 'abort' | 'fatal'`
- [x] 1.2 实现冷却管理：`cooldownMap: Map<string, number>`，30s / 300s 冷却
- [x] 1.3 实现 `streamChat()`：按序尝试 Provider，首次 yield 前失败则降级
- [x] 1.4 实现 `chat()`：按序尝试 Provider，失败则降级
- [x] 1.5 降级时 console.warn 输出日志
- [x] 1.6 所有 Provider 均失败时抛出统一错误

### 2. Provider Registry 集成（index.ts）

- [x] 2.1 新增 `createFallbackProvider()` 函数
- [x] 2.2 `getDefaultProvider()` 保持原样兼容

### 3. Runner 集成（runner.ts）

- [x] 3.1 `getDefaultProvider()` 替换为 `createFallbackProvider()`

### 4. 验证

- [x] 4.1 TypeScript 编译零新增错误
