# Delta Spec: Context Window Guard

> Phase G3 (GAP-25) — 动态 Context Window 管理  
> 修改领域：context-engine（影响 assemble() 的 token 预算计算）

---

## ADDED Requirements

### Requirement: Context Window 解析

系统 MUST 提供 `resolveContextWindow()` 函数，按以下优先链解析模型的 context window 大小：

```
configOverride > 模型查表 > Provider 报告 > 默认值 (128K)
```

```typescript
interface ContextWindowParams {
  modelId: string
  providerReported?: number    // Provider API 报告的值
  configOverride?: number      // 用户配置覆盖
}

interface ContextWindowInfo {
  tokens: number               // 最终 context window 大小
  source: 'config' | 'model_table' | 'provider' | 'default'
}

function resolveContextWindow(params: ContextWindowParams): ContextWindowInfo
```

#### Scenario: 配置覆盖优先
- GIVEN `configOverride` 设为 50000
- AND 模型查表中 gpt-4o 为 128000
- WHEN `resolveContextWindow()` 被调用
- THEN 返回 `{ tokens: 50000, source: 'config' }`

#### Scenario: 模型查表
- GIVEN 模型 ID 为 "gpt-4o"
- AND 无配置覆盖
- WHEN `resolveContextWindow()` 被调用
- THEN 返回 `{ tokens: 128000, source: 'model_table' }`

#### Scenario: 前缀匹配
- GIVEN 模型 ID 为 "gpt-4o-2024-08-06"
- AND 查表中有 "gpt-4o" 条目
- WHEN `resolveContextWindow()` 被调用
- THEN 通过前缀匹配命中 "gpt-4o"
- AND 返回 `{ tokens: 128000, source: 'model_table' }`

#### Scenario: Provider 报告兜底
- GIVEN 模型 ID 为 "custom-model-xyz"（查表中无匹配）
- AND Provider 报告 context window 为 65000
- WHEN `resolveContextWindow()` 被调用
- THEN 返回 `{ tokens: 65000, source: 'provider' }`

#### Scenario: 最终兜底
- GIVEN 模型 ID 为 "unknown-model"
- AND 无配置覆盖、无查表匹配、无 Provider 报告
- WHEN `resolveContextWindow()` 被调用
- THEN 返回 `{ tokens: 128000, source: 'default' }`

---

### Requirement: 模型 Context Window 查表

系统 MUST 维护一个已知模型的 context window 大小映射表 `MODEL_CONTEXT_WINDOWS`。

SHALL 至少包含以下模型系列：

| 模型前缀 | Context Window |
|----------|---------------|
| `gpt-4o` | 128,000 |
| `gpt-4o-mini` | 128,000 |
| `gpt-4-turbo` | 128,000 |
| `gpt-4` | 8,192 |
| `gpt-3.5-turbo` | 16,385 |
| `claude-3-5-sonnet` | 200,000 |
| `claude-3-5-haiku` | 200,000 |
| `claude-3-opus` | 200,000 |
| `claude-4-sonnet` | 200,000 |
| `claude-4-opus` | 200,000 |
| `gemini-2.0-flash` | 1,048,576 |
| `gemini-2.5-pro` | 1,048,576 |
| `deepseek-chat` | 64,000 |
| `deepseek-reasoner` | 64,000 |
| `qwen-max` | 32,768 |

查表 MUST 支持**前缀匹配**：精确匹配优先，无精确匹配时按最长前缀匹配。

---

### Requirement: Context Window Guard 评估

系统 SHOULD 提供 `evaluateContextWindowGuard()` 函数，对解析后的 context window 信息进行合理性检查：

- `source === 'default'` → 发出 `warn` 级别日志（未知模型，使用兜底值）
- `tokens < 4096` → 发出 `warn` 级别日志（context window 过小，可能配置错误）
- `tokens > 2_000_000` → 发出 `warn` 级别日志（context window 异常大）

#### Scenario: 兜底值警告
- GIVEN context window source 为 'default'
- WHEN `evaluateContextWindowGuard()` 被调用
- THEN 返回结果中 `level` 为 'warn'

#### Scenario: 正常值无警告
- GIVEN context window 为 128000，source 为 'model_table'
- WHEN `evaluateContextWindowGuard()` 被调用
- THEN 返回结果中 `level` 为 'ok'

---

## MODIFIED Requirements

### Requirement: assemble() 使用动态 Context Window

> 修改 `context-engine/spec.md` 中 assemble() 的 token 预算计算。

`DefaultContextEngine.assemble()` MUST 使用 `resolveContextWindow()` 动态计算 token 预算，替代之前的硬编码 `provider.getCapabilities().contextWindow`。

#### Scenario: 模型切换后 token 预算自动调整
- GIVEN 当前模型从 gpt-4（8K）切换到 gpt-4o（128K）
- WHEN `assemble()` 被调用
- THEN token 预算基于 128K 计算（而非硬编码值）
