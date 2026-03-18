# Compaction Specification

> 描述对话历史压缩机制：当上下文接近模型窗口上限时，自动摘要历史以释放空间。  
> 依赖：[session/spec.md](../session/spec.md)、[llm-provider/spec.md](../llm-provider/spec.md)

---

## Requirements

### Requirement: 触发条件

系统 MUST 在以下条件满足时触发 Compaction：

- 对话历史占用的 tokens 超过当前模型上下文窗口的 **50%**
- 计算公式：`usedTokens / contextWindowTokens > 0.5`

> 触发阈值为 50%，预留另外 50% 给 System Prompt + 工具结果 + 生成输出。

---

### Requirement: 压缩算法

Compaction MUST 按以下步骤执行：

```
1. pruneHistoryForContextShare()
   └── 按 token 份额分块，标记可移除的最旧历史块
   └── 修复孤立 tool_result（其对应 tool_use 已被标记移除时，一同移除）

2. 生成摘要（summarizeInStages）：
   a. 单次可处理 → 调用 LLM 生成完整摘要
   b. 超大历史   → 分 N 块并行摘要 → 合并摘要

3. 用摘要替换已移除的历史块，插入为新的 `assistant` 消息

4. 更新 Session，继续接受新消息
```

摘要 MUST 保留以下信息（由 MERGE_SUMMARIES_INSTRUCTIONS 约束 LLM）：
- 进行中的任务状态
- 批量操作进度（如 "已完成 5/17 项"）
- 上一轮请求和当前动作
- 所有不透明标识符（UUID / hash / token 等，原样保留）

---

### Requirement: 工具结果安全处理

工具结果的 `details` 字段（可能含用户文件内容等不可信数据）MUST NOT 进入摘要 LLM 调用，仅摘要 `text` 字段。

> 原因：防止提示词注入攻击（工具结果中可能含有"忽略以上指令..."的恶意内容）。

---

### Requirement: 超时保护

Compaction 摘要调用 MUST 有超时保护：

- 单次摘要超时：60 秒
- 超时时：跳过本次压缩，继续使用完整历史（历史继续增长，下次触发再试）
- 超时 MUST NOT 导致 Session 进入损坏状态

若压缩期间对话历史处于"部分压缩"的中间状态，MUST 使用**压缩前快照**恢复（不使用中间状态）。

#### Scenario: Compaction 摘要超时
- GIVEN Compaction 被触发，调用 LLM 生成摘要
- WHEN 60 秒内未完成
- THEN 跳过本次压缩
- AND Session 仍可继续接受新消息（使用完整历史）
- AND 记录警告日志："Compaction timeout, skipped"

---

### Requirement: 异步非阻塞（目标状态）

> **架构决策**：Phase 3 先实现同步 Compaction（阻塞当前 runAttempt），Phase 5 升级为异步。

目标状态（Phase 5）：
- Compaction 在 `afterTurn()` 后台异步执行，不阻塞下一条消息的处理
- 若新消息到达时 Compaction 仍在进行，新消息 SHALL 排队等待（per-Session 队列已保证串行）
- 不再出现"用户感知到明显卡顿"的情况

---

### Requirement: 图像处理

Compaction SHOULD 在清理旧历史时保留最近 **N=3 轮**的图像数据，而非一律清除。

> 背景：OpenClaw 在 Compaction 后会清理所有旧历史中的图像（`pruneProcessedHistoryImages`），导致多轮图像讨论能力受限。equality 改为保留最近 3 轮。
