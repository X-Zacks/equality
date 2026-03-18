# Design: 智能模型路由

> Phase 10 | Spec 扩展: [specs/llm-provider/spec.md](../../specs/llm-provider/spec.md)

## 架构决策

### 1. 复杂度分级：3 档

| Tier | 名称 | 特征 |
|------|------|------|
| `light` | 轻量 | 闲聊、打招呼、时间查询、简单翻译、单行问答 |
| `standard` | 标准 | 代码编写、文件操作、多步任务、技术问答 |
| `heavy` | 强力 | 大规模重构、长篇写作、多文件分析、推理题 |

### 2. 分类器：纯本地规则（零 API 调用）

`classifyComplexity(userMessage, toolCount, historyLength)` → `'light' | 'standard' | 'heavy'`

规则优先级（从高到低）：

1. **消息长度**：>2000 字符 → heavy
2. **关键词**：含"重构/refactor/分析所有/写一个完整的" → heavy
3. **工具暗示**：含代码块或文件路径 → standard
4. **历史深度**：对话超 20 轮 → standard（上下文管理需要更强模型）
5. **默认**：≤100 字符且无代码 → light，其他 → standard

### 3. 模型路由表

```typescript
const MODEL_TIERS: Record<Tier, ModelPreference[]> = {
  light: [
    { provider: 'copilot', model: 'gpt-4.1-mini' },
    { provider: 'qwen', model: 'qwen-turbo' },
    { provider: 'deepseek', model: 'deepseek-chat' },
  ],
  standard: [
    { provider: 'copilot', model: 'gpt-4.1' },
    { provider: 'custom', model: undefined },
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-plus' },
  ],
  heavy: [
    { provider: 'copilot', model: 'claude-sonnet-4' },
    { provider: 'custom', model: undefined },
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-max' },
  ],
}
```

选择逻辑：从对应 tier 的列表中，找第一个已配置的 Provider 返回。

### 4. @model 覆盖语法

用户消息以 `@model-name` 开头时强制路由：

- `@deepseek-reasoner 帮我分析` → deepseek / deepseek-reasoner
- `@gpt-4o 翻译这段` → copilot / gpt-4o
- `@qwen-max` → qwen / qwen-max

解析后将 `@model-name` 从用户消息中剥离。

### 5. 集成点

`runner.ts` 中：

```
// 之前
const provider = params.provider ?? getProviderWithFallback()

// 之后
const { provider, strippedMessage } = routeModel(userMessage, params.provider)
// strippedMessage 是去掉 @model 后的消息
```

`routeModel()` 内部调 `classifyComplexity()` + 查路由表 + fallback 包装。

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/providers/router.ts` | 新增 | 复杂度分类器 + 路由表 + routeModel() |
| `packages/core/src/agent/runner.ts` | 修改 | 集成 routeModel() |
