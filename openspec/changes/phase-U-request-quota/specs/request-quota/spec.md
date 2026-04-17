# Phase U: 请求配额 — 行为规格

## Requirements

### Requirement: 请求次数记录

系统 **MUST** 在每次 LLM API 调用完成时记录一条请求记录，包含 provider、model、model_tier（premium/standard/basic）。

#### Scenario: 正常调用记录
- GIVEN 用户发送一条消息触发 LLM 调用
- WHEN LLM 返回响应
- THEN cost_entries 表新增一行，model_tier 字段根据 MODEL_TIERS 自动填充

#### Scenario: 子代理调用也计入
- GIVEN 主代理 spawn 了一个子代理
- WHEN 子代理执行 LLM 调用
- THEN 该调用也计入父会话所属用户的请求次数

### Requirement: 配额配置

系统 **MUST** 允许用户为每个 provider 配置月度请求配额。

#### Scenario: 配置 Copilot 配额
- GIVEN 用户进入设置页 → 模型 Tab
- WHEN 用户在 Copilot provider 下设置"高级模型配额: 1000 次/月"
- THEN 系统保存该配额，并开始追踪本月使用量

#### Scenario: 未配置配额
- GIVEN 用户未为某 provider 配置配额
- WHEN 系统检查配额
- THEN 视为无限制（不触发预警和降级）

### Requirement: 配额预警

系统 **MUST** 在配额使用率达到阈值时发出预警。

#### Scenario: 80% 预警
- GIVEN Copilot 配额 1000 次，已使用 800 次
- WHEN 第 801 次调用完成
- THEN 在回复末尾追加预警信息："⚠️ Copilot 高级模型本月已用 801/1000 次 (80%)"

#### Scenario: 95% 严重预警
- GIVEN 已使用 950 次
- WHEN 第 951 次调用完成
- THEN 追加严重预警："🔴 Copilot 高级模型仅剩 49 次，建议切换到基础模型"

### Requirement: 自动降级

系统 **SHOULD** 在配额耗尽时自动降级到基础模型。

#### Scenario: 配额耗尽自动降级
- GIVEN 配额 1000 次已全部用完
- WHEN 新的请求到达且 router 选择了 premium tier 模型
- THEN router 自动降级到 standard 或 basic tier 模型
- AND 向用户显示："ℹ️ 高级模型配额已用尽，已自动切换到 {降级模型}"

#### Scenario: 用户 @model 强制指定
- GIVEN 配额已耗尽
- WHEN 用户使用 @gpt-5 强制指定高级模型
- THEN 系统 **仍然执行**（尊重用户意愿），但显示配额超限警告

### Requirement: 统计查询

系统 **MUST** 提供请求次数统计 API。

#### Scenario: /usage 命令
- GIVEN 用户输入 /usage
- WHEN 系统处理该命令
- THEN 显示每个 provider 的本月请求次数、配额、剩余百分比

#### Scenario: 按天统计
- GIVEN 用户查看费用面板
- WHEN 展示每日统计
- THEN 每天的记录中包含 callCount 和 premiumCallCount 两个数字
