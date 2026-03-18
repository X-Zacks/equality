# Delta Spec: Compaction — Phase 3 变更

> 基线：[openspec/specs/compaction/spec.md](../../../specs/compaction/spec.md)
> 
> 说明：Compaction spec 此前已定义了完整的目标行为。Phase 3 实现其中的**同步版本**（Phase 5 升级为异步）。

---

## ADDED Requirements

### Requirement: Token 估算器

系统 MUST 实现轻量级 token 估算器，不依赖外部 API。

估算规则：
- CJK 字符（U+4E00-U+9FFF）：1.5 tokens/字符
- ASCII 字符：0.25 tokens/字符（≈4 字符/token）
- Message overhead：每条消息 +4 tokens

估算器用于：
- 判断是否触发 Compaction（`estimatedTokens / contextWindow > 0.5`）
- 划分保护区 / 压缩区边界

#### Scenario: 中文对话 token 估算
- GIVEN 一条 1000 字的纯中文消息
- WHEN 调用 `estimateTokens(message)`
- THEN 返回约 1500 tokens

#### Scenario: 混合语言 token 估算
- GIVEN 一条包含 500 中文字 + 200 英文单词（约 1000 ASCII 字符）的消息
- WHEN 调用 `estimateTokens(message)`
- THEN 返回约 1000 tokens（500×1.5 + 1000×0.25）

---

### Requirement: Compaction 摘要 Prompt

系统 MUST 使用以下约束指导 LLM 生成摘要：

```
请将以下对话历史压缩为简洁摘要。

必须保留：
1. 进行中的任务及其当前状态
2. 批量操作的进度（如"已完成 5/17 项"）
3. 所有标识符原样保留（文件路径、UUID、变量名、URL 等）
4. 关键决策和结论
5. 用户的偏好和约束条件

可以省略：
- 已完成且不再相关的中间步骤
- 重复的问候和确认
- 工具调用的详细输出（保留结论即可）
```

#### Scenario: 摘要保留任务进度
- GIVEN 对话历史包含"已完成 3/10 个文件迁移"
- WHEN Compaction 生成摘要
- THEN 摘要中 MUST 包含"3/10"进度信息

---

### Requirement: Compaction 前端事件

系统 MUST 在 Compaction 执行时推送 SSE 事件：

```json
{ "type": "compaction", "summary": "对话历史已压缩（移除 12 条消息，保留摘要）" }
```

前端 SHOULD 在消息列表中显示系统提示："💭 对话历史已压缩"。

---

### Requirement: Compaction 回退机制

当 Compaction 失败（超时或异常）时，系统 MUST 回退到 `trimMessages()` 暴力截断。

回退链：
1. Compaction 摘要 → 优选
2. trimMessages 截断 → 兜底（保留 system + 最近 4 轮）
3. 两者都失败 → 抛出 ContextOverflow 错误

#### Scenario: Compaction 超时回退
- GIVEN Compaction 调用 LLM 生成摘要
- WHEN 60 秒内未完成
- THEN 跳过 Compaction，回退到 trimMessages
- AND Session 继续可用
- AND 记录警告："Compaction timeout, falling back to trimMessages"

---

## MODIFIED Requirements

### Requirement: 异步非阻塞（目标状态）

Phase 3 实现**同步 Compaction**：在 `runAttempt()` 的 LLM 调用前检查并执行。

（Previously: spec 中描述了异步非阻塞目标，但 Phase 3 先同步实现，Phase 5 升级为异步）

变更：
- Phase 3：Compaction 在 `runAttempt()` 入口处同步执行，阻塞当前请求
- Phase 5（未来）：Compaction 在 `afterTurn()` 后台异步执行
