# Design: Model Fallback 降级链

> Phase 8 | Spec: [specs/llm-provider/spec.md](../../specs/llm-provider/spec.md)

## 架构决策

### 1. FallbackProvider 包装器模式

**选择**：创建 `FallbackProvider` 类，实现 `LLMProvider` 接口，内部持有有序的 Provider 列表。

**理由**：
- 对 runner 透明：runner 只看到一个 LLMProvider，不需要感知降级逻辑
- 可复用：streamChat / chat 都共享降级逻辑
- 可测试：可以注入 mock provider 列表

### 2. 错误分类：可降级 vs 不可降级

```
可降级（切换到下一个 Provider）：
  - HTTP 429（限流）
  - HTTP 5xx（服务错误）
  - 网络错误（ECONNREFUSED, ETIMEDOUT, fetch failed）
  - 请求超时（非用户取消的 AbortError）

不可降级（直接抛出）：
  - AbortError（用户取消）
  - Context Overflow（"context_length_exceeded"）
  - API Key 无效（401/403）— 该 Provider 标记为长期不可用
```

### 3. 冷却机制

**选择**：Provider 级别的冷却 Map，`providerId → cooldownUntil` (timestamp)。

- 429/5xx/网络错误 → 冷却 30 秒
- 401/403 → 冷却 300 秒（5 分钟，可能是 key 过期）
- 尝试下一个 Provider 时，跳过冷却中的

### 4. 降级时重试 streamChat 的流式中断处理

**选择**：如果 streamChat 已经 yield 了部分内容后才失败，不降级（避免重复内容）。
只有在首次 yield 之前失败才降级。

**理由**：
- 如果已经输出了半句话再切换模型，用户会看到不连贯的内容
- 首次 yield 前失败 = 还没开始输出，可以安全切换

### 5. getDefaultProvider() → createFallbackProvider()

**选择**：新增 `createFallbackProvider()` 函数，返回 FallbackProvider，内含所有已配置的 Provider。
`getDefaultProvider()` 保持原样作为兼容。

## 数据流

```
runner 调用 provider.streamChat(params)
    ↓ FallbackProvider
尝试 providers[0].streamChat()
    ├─ 成功 → yield deltas
    └─ 失败（首次 yield 前）
        ↓ 分类错误
        ├─ 不可降级 → throw
        └─ 可降级 → cooldown providers[0], 尝试 providers[1]
            ├─ 成功 → yield deltas
            └─ 失败 → 尝试 providers[2] ...
                └─ 全部失败 → throw "所有模型均不可用"
```

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/providers/fallback.ts` | 新增 | FallbackProvider 类 |
| `packages/core/src/providers/index.ts` | 修改 | 新增 createFallbackProvider() |
| `packages/core/src/agent/runner.ts` | 修改 | 使用 createFallbackProvider() |
