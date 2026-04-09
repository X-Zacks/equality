# Delta Spec: 上下文压缩

---

## ADDED Requirements

### Requirement: 自动上下文压缩

当对话上下文超过阈值时 MUST 自动执行压缩。

- 触发条件：token 占比 ≥ 50% 模型上下文窗口 **OR** 消息数 ≥ 30
- 使用当前会话模型执行压缩（非 cheap model）
- 压缩结果替换原始消息历史，保留最近 N 条消息原文

#### Scenario: token 百分比触发
- GIVEN 模型上下文窗口 = 128K tokens
- AND 当前 token 占比 = 52%
- WHEN toolLoop 新一轮开始前检查
- THEN 触发压缩

#### Scenario: 消息数触发
- GIVEN 消息数 = 32
- AND token 占比 = 30%
- WHEN toolLoop 新一轮开始前检查
- THEN 触发压缩

#### Scenario: 均未触发
- GIVEN 消息数 = 10
- AND token 占比 = 20%
- WHEN toolLoop 新一轮开始前检查
- THEN 不触发压缩

### Requirement: 压缩算法

压缩 MUST 执行 6 步流水线：

1. **标记**: 将消息分为 old 区 (可压缩) 和 recent 区 (保留原文)
2. **提取**: 从 old 区提取 tool call/result 的 name 列表
3. **摘要**: 调用 LLM 将 old 区生成结构化摘要
4. **合成**: 将摘要组装为 system message 置于消息列表开头
5. **替换**: 用 [summary + recent 区] 替换原始消息
6. **Recount**: 验证压缩后 token ≤ 压缩前

#### Scenario: 结构化摘要格式
- GIVEN old 区包含 15 条消息
- WHEN LLM 生成摘要
- THEN 摘要包含以下段落：
  - `## 用户目标` — 一句话
  - `## 关键决策` — 要点列表
  - `## 工具调用摘要` — 工具名称及结果要点
  - `## 未完成事项` — 列表
  - `## 重要上下文` — 需要保留的变量名、路径、配置等

#### Scenario: recent 区大小
- GIVEN 压缩触发
- WHEN 划分 old/recent
- THEN recent 区保留最近 6 条消息（或直到最近一个 user message 为止，取较大值）

### Requirement: 压缩配置

以下参数 MUST 通过环境变量可配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CONTEXT_COMPRESS_THRESHOLD_PERCENT` | 0.50 | token 占比触发阈值 |
| `CONTEXT_COMPRESS_THRESHOLD_MESSAGES` | 30 | 消息数触发阈值 |
| `CONTEXT_COMPRESS_RECENT_KEEP` | 6 | recent 区最少保留消息数 |

#### Scenario: 自定义阈值
- GIVEN CONTEXT_COMPRESS_THRESHOLD_PERCENT=0.70
- AND CONTEXT_COMPRESS_THRESHOLD_MESSAGES=50
- AND 当前 token 占比 = 60%, 消息数 = 25
- WHEN 检查是否触发
- THEN 不触发（60% < 70% AND 25 < 50）

### Requirement: 压缩幂等性

每次 toolLoop 迭代最多执行一次压缩，避免循环压缩。

#### Scenario: 压缩后不再触发
- GIVEN 上一轮刚执行过压缩
- AND 当前 token 占比仍 > 50%（因为 recent 区消息本身较大）
- WHEN 检查是否触发
- THEN 不触发（本轮已压缩标记为 true）
