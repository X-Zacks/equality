# Proposal: 智能模型路由

> Phase 10 | 优先级: 🟡 P1  
> Spec: [specs/llm-provider/spec.md](../../specs/llm-provider/spec.md) 扩展

## 意图

当前系统对所有任务使用同一个模型。用户问"几点了"和"帮我重构这个 5000 行文件"
用的是同一个 gpt-4o / claude-sonnet-4。这导致：

- 简单问题响应慢、费用浪费
- 无法利用 Copilot 额度内多模型优势

## 目标

实现任务复杂度分类 + 自动模型选择：

1. **复杂度分类器** — 纯本地规则（零 API 调用），将用户消息分为 3 档
2. **模型路由表** — 每档对应一个模型 tier（轻量/标准/强力）
3. **用户可覆盖** — 消息中以 `@model` 语法指定模型，跳过自动路由
4. **Provider 感知** — 路由结果受当前已配置的 Provider 约束

## 范围

- **包含**：复杂度分类器、路由表、runner 集成、`@model` 覆盖
- **不包含**：远程分类器（LLM-as-classifier）、动态费率优化

## 成功标准

- "现在几点" → 命中轻量模型（如 gpt-4.1-mini / qwen-turbo）
- "帮我写一个完整的 CRUD 后端" → 命中强力模型（如 claude-sonnet-4）
- `@deepseek-reasoner 分析这个` → 强制使用 deepseek-reasoner
