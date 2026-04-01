# Delta Spec: Tools — Phase A 可靠性基础

> 变更: phase-A-reliability-foundations
> 基线: [openspec/specs/tools/spec.md](../../../../specs/tools/spec.md)

---

## ADDED Requirements

### Requirement: 工具 Schema 跨 Provider 兼容

系统 SHALL 在将工具 schema 发送给 LLM Provider 之前，按 Provider 类型对 schema 进行兼容性清洗。

**Provider 家族识别**：

```typescript
function resolveProviderFamily(providerId: string): 'openai' | 'gemini' | 'xai' | 'standard'
```

- `providerId` 包含 `gemini` 或 `google` → `gemini`
- `providerId` 包含 `xai` 或 `grok` → `xai`
- 其他（OpenAI, DeepSeek, Qwen, Volc 等）→ `standard`

**通用清洗规则**（所有 Provider）：

1. 打平 `anyOf`/`oneOf` 联合类型：合并所有分支的 `properties` 到一个 object schema，保留 enum 值去重
2. 注入缺失字段：无 `type` 时补 `"object"`，无 `properties` 时补 `{}`
3. 截断 `description`：超过 1024 字符时截断并附加 `...`
4. 递归深度限制：schema 嵌套超过 5 层时停止递归处理

**Gemini 专用清洗**：

5. 移除关键字：`pattern`, `examples`, `title`, `default`, `$schema`, `$ref`
6. 移除字符串约束：`maxLength`, `minLength`, `format`
7. 截断 enum：超过 50 个值时保留前 50 个

**xAI 专用清洗**：

8. 移除字符串约束：`pattern`, `maxLength`, `minLength`
9. 截断 enum：超过 100 个值时保留前 100 个

**standard 家族**（OpenAI/DeepSeek/Qwen/Volc）：

10. 仅执行通用规则，不做额外清洗

**接口定义**：

```typescript
function cleanToolSchemas(
  schemas: OpenAIToolSchema[],
  providerId: string,
): OpenAIToolSchema[]
```

- 输入为原始 schema 数组 + provider ID
- 返回深拷贝后清洗的 schema 数组（不修改原始输入）
- 对于 `standard` 家族，MAY 直接返回原始引用（跳过深拷贝以节省性能）

#### Scenario: Gemini 调用含 pattern 字段的工具
- GIVEN 工具 `grep` 的 inputSchema 包含 `{ pattern: { type: "string", pattern: "^[a-z]+$" } }`
- AND 当前 provider 为 `gemini/gemini-2.0-flash`
- WHEN schema 兼容层处理该工具
- THEN `pattern` 校验关键字 SHALL 被移除
- AND 工具 schema 的基本结构（type, description, properties）SHALL 保持不变

#### Scenario: OpenAI 调用含 pattern 字段的工具
- GIVEN 同上工具 schema
- AND 当前 provider 为 `openai/gpt-4o`
- WHEN schema 兼容层处理该工具
- THEN schema SHALL 保持原样（standard 家族不做额外清洗）

#### Scenario: 打平 anyOf 联合类型
- GIVEN 工具参数 schema 包含 `{ anyOf: [{ type: "string" }, { type: "number" }] }`
- WHEN schema 兼容层处理
- THEN anyOf SHALL 被打平为 `{ type: "string" }`（取第一个有效类型）
- AND 原始 schema SHALL 不被修改（深拷贝）

#### Scenario: 缺失 type 自动注入
- GIVEN 工具参数 schema 为 `{ properties: { path: { type: "string" } } }`（缺少顶层 `type`）
- WHEN schema 兼容层处理
- THEN `type: "object"` SHALL 被自动注入

---

## MODIFIED Requirements

### Requirement: 工具调用循环检测（Loop Detection）

（新增：滑动窗口约束 — 见 agent-runner delta spec）

工具循环检测的历史窗口大小 SHALL 为 30 条记录。此约束仅影响内部实现，不改变检测器的触发条件和阈值。
