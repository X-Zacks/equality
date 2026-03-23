# Delta Spec: Agent Loop Config

> **Delta Type**: MODIFIED  
> **Base Spec**: `openspec/specs/agent-runner/spec.md`、`openspec/specs/tools/spec.md`

---

## MODIFIED Requirements

### Requirement: 工具调用循环断路器（工具次数上限）

**原规格**：单次 `runAttempt` 工具调用总次数 MUST NOT 超过全局断路器阈值（**硬编码 30 次**）

**修改后**：单次 `runAttempt` 工具调用总次数 MUST NOT 超过全局断路器阈值，该阈值 SHALL 从配置项 `AGENT_MAX_TOOL_CALLS` 读取，未配置时默认 **50**。

> 注：默认值从 30 调整为 50，与 LLM 轮次上限对齐，避免工具数比轮次数更早触发。

#### Scenario: 未配置时使用默认值 50

- GIVEN `settings.json` 中未设置 `AGENT_MAX_TOOL_CALLS`
- WHEN Agent 执行一次 `runAttempt`
- THEN 断路器阈值为 50

#### Scenario: 用户配置断路器上限为 200

- GIVEN 用户在设置中将 `AGENT_MAX_TOOL_CALLS` 设为 `"200"`
- WHEN Agent 执行一次 `runAttempt`
- THEN 工具调用计数达到 200 时断路器触发并终止
- AND 触发前（1-199 次）正常执行

#### Scenario: 配置值非法（非数字或 < 1）

- GIVEN 用户设置 `AGENT_MAX_TOOL_CALLS` 为 `"abc"` 或 `"0"` 或 `"-5"`
- WHEN Core 服务启动并读取配置
- THEN 回落到默认值 50，不报错崩溃

#### Scenario: 超出最大允许值

- GIVEN 用户设置 `AGENT_MAX_TOOL_CALLS` 为 `"99999"`
- WHEN Core 服务读取配置
- THEN 截断至允许上限 **500**（防止被滥用导致无限循环消耗）

---

### Requirement: LLM 轮次上限配置化

**原规格**：`runner.ts` 中 `MAX_TOOL_LOOP = 50`（硬编码）

**修改后**：LLM 轮次上限 SHALL 从配置项 `AGENT_MAX_LLM_TURNS` 读取，未配置时默认 **50**。

#### Scenario: 未配置时使用默认值 50

- GIVEN `settings.json` 中未设置 `AGENT_MAX_LLM_TURNS`
- WHEN Agent 执行一次 `runAttempt`
- THEN LLM 轮次上限为 50

#### Scenario: 用户配置 LLM 轮次为 200

- GIVEN 用户在设置中将 `AGENT_MAX_LLM_TURNS` 设为 `"200"`
- WHEN Agent 执行一次 `runAttempt`
- THEN LLM 调用达到 200 轮时停止循环
- AND 200 轮以内正常工作

#### Scenario: 配置值非法

- GIVEN 用户设置 `AGENT_MAX_LLM_TURNS` 为 `"0"` 或非数字
- WHEN Core 读取配置
- THEN 回落到默认值 50

#### Scenario: 超出最大允许值

- GIVEN 用户设置 `AGENT_MAX_LLM_TURNS` 为 `"99999"`
- WHEN Core 读取配置
- THEN 截断至允许上限 **500**

---

### Requirement: 高级设置页面显示循环上限配置

**原规格**：高级设置页面「性能设置」区域只有 bash 超时三项

**修改后**：「性能设置」区域新增「Agent 循环上限」分组，包含：
- 工具调用上限（`AGENT_MAX_TOOL_CALLS`）
- LLM 轮次上限（`AGENT_MAX_LLM_TURNS`）

两项与 bash 超时配置共享同一个保存按钮组，或单独一个「保存」按钮。

#### Scenario: 用户在设置页修改工具调用上限

- GIVEN 用户打开「高级」设置页
- WHEN 用户将「工具调用上限」输入框改为 `200` 并点击保存
- THEN `settings.json` 中写入 `"AGENT_MAX_TOOL_CALLS": "200"`
- AND 下一次 `runAttempt` 使用新值

#### Scenario: 设置页显示当前有效值

- GIVEN `settings.json` 中已保存 `AGENT_MAX_TOOL_CALLS: "200"`
- WHEN 用户打开设置页「高级」Tab
- THEN 「工具调用上限」输入框显示 `200`（或 placeholder 显示已保存值）

---

## 不变的现有规格

- 断路器触发时的行为：补齐占位 result + 注入终止提示 + LLM 总结一轮
- 四种检测器（generic_repeat / poll_no_progress / ping_pong / circuit_breaker）均保持启用
- `MAX_TOOL_LOOP` 到达时直接 break 的行为不变
