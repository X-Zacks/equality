# Delta Spec: 预算感知

---

## ADDED Requirements

### Requirement: 迭代预算警告

toolLoop MUST 在迭代到达阈值时向 Agent 发出预算警告。

- 70% 处发出 "approaching-limit" 警告
- 90% 处发出 "critical" 警告
- 警告文本注入最近一次 tool result 的内容末尾
- 仅在该百分比首次到达时触发一次
- maxLlmTurns 和 maxToolCalls 各自独立跟踪

#### Scenario: 70% 警告
- GIVEN maxLlmTurns = 50
- WHEN 第 35 轮 tool result 返回
- THEN tool result content 末尾附加 "\n\n⚠️ BUDGET WARNING: 70% of iteration budget used (35/50 turns). Start wrapping up."
- AND 后续轮不再重复 70% 警告

#### Scenario: 90% 警告
- GIVEN maxLlmTurns = 50
- WHEN 第 45 轮 tool result 返回
- THEN tool result content 末尾附加 "\n\n🚨 BUDGET CRITICAL: 90% of iteration budget used (45/50 turns). Summarize and finish NOW."
- AND 后续轮不再重复 90% 警告

#### Scenario: tool calls 独立警告
- GIVEN maxToolCalls = 50
- WHEN 第 35 次 tool call 返回
- THEN tool result content 末尾附加 "\n\n⚠️ BUDGET WARNING: 70% of tool call budget used (35/50 calls). Start wrapping up."

#### Scenario: 自定义 maxLlmTurns
- GIVEN 用户设置 AGENT_MAX_LLM_TURNS=20
- WHEN 第 14 轮到达
- THEN 70% 警告触发（14/20）

### Requirement: 预算警告不破坏工具输出

警告文本 MUST 以 `\n\n` 分隔追加到原始 tool result 内容之后，不替换原始内容。

#### Scenario: 工具输出完整性
- GIVEN tool result content = "File saved successfully."
- WHEN 70% 警告触发
- THEN final content = "File saved successfully.\n\n⚠️ BUDGET WARNING: ..."
