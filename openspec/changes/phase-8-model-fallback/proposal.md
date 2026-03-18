# Proposal: Model Fallback 降级链

> Phase 8 | 优先级: 🟡 P1  
> Spec: [specs/llm-provider/spec.md](../../specs/llm-provider/spec.md)「Model Fallback（降级链）」

## 意图

当前 `getDefaultProvider()` 在启动时选择第一个已配置的 Provider，之后固定使用。
如果运行时该 Provider 返回 429（限流）、5xx（服务错误）或网络超时，
runAttempt 直接失败，用户看到错误消息。即使配置了多个 Provider，也无法自动切换。

## 目标

实现运行时 Model Fallback：

1. **FallbackProvider** — 包装类，内部维护有序 Provider 列表，streamChat 失败时自动切到下一个
2. **错误分类** — 区分可降级错误（429/5xx/超时/网络）和不可降级错误（AbortError/Context Overflow）
3. **冷却机制** — 失败的 Provider 进入冷却期（30s），冷却期间跳过
4. **降级通知** — 降级时通过 onDelta 通知用户当前切换到了哪个模型

## 范围

- **包含**：FallbackProvider 类、错误分类、冷却计时器、runner 集成
- **不包含**：API Key 的 DPAPI 加密存储（Phase 16）、费率表远程更新

## 成功标准

- 主 Provider 返回 429 时，5 秒内自动切到下一个 Provider 继续回复
- 用户主动取消（AbortError）不触发降级
- 所有 Provider 均失败时，返回明确错误："所有模型均不可用"
