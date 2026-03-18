# Delta Spec: 智能模型路由

> Phase 10 对 [specs/llm-provider/spec.md](../../../specs/llm-provider/spec.md) 的扩展

## NEW Requirement: 智能模型路由

系统 MUST 根据用户消息的复杂度自动选择合适的模型。

- 分为 3 档：light / standard / heavy
- 分类器为纯本地规则，零 API 调用
- 每档有有序的模型偏好列表，从中选第一个已配置的 Provider
- 用户可通过 `@model-name` 语法强制指定模型
- 路由结果通过 FallbackProvider 包装，仍享有降级保护
