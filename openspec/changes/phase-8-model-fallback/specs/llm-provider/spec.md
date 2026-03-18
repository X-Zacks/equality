# Delta Spec: Model Fallback

> Phase 8 变更对 [specs/llm-provider/spec.md](../../../specs/llm-provider/spec.md) 的影响

## MODIFIED Requirements

### Requirement: Model Fallback（降级链）
原 spec 中已定义降级流程。本次实现补充以下细节：

- 降级仅在 streamChat 首次 yield 前触发；已输出部分内容后不降级
- 冷却时间：429/5xx/网络错误 → 30s，401/403 → 300s
- FallbackProvider 实现 LLMProvider 接口，对 runner 完全透明
- 新增 `createFallbackProvider()` 工厂函数
