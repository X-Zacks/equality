# Delta Spec: Context Engine

> 所属变更：[agent-loop-pi-improvements](../../)  
> 主规格：[specs/context-engine/spec.md](../../../specs/context-engine/spec.md)

---

## ADDED Requirements

### Requirement: 主动上下文裁剪（transformContext）

`DefaultContextEngine` SHOULD 在历史消息组装完成后、Compaction 触发前，对超大工具结果进行主动裁剪。

- `role: 'tool'` 消息的内容超过裁剪阈值（`TOOL_RESULT_TRIM_CHARS`）时 MUST 替换为摘要占位
- 最近 N 轮次的工具结果 SHOULD 不被裁剪（保留完整上下文）
- 裁剪占位内容格式：`[工具结果已裁剪，原始长度 N 字符]`
- 裁剪逻辑 MUST 在 `compactIfNeeded` 之前执行（主动裁剪 > 被动压缩）

参数（与 OpenClaw 对齐，动态计算不使用固定值）：
- 单条 tool result 上限：`contextWindow × 4字/token × 50%`
- 全局 context 预算：`contextWindow × 4字/token × 75%`
- 绝对硬上限（单条）：400,000 字（`HARD_MAX_TOOL_RESULT_CHARS`）
- 无"最近 N 轮保护"：与 OpenClaw 一致，compaction 已负责摘要重要信息

#### Scenario: 单条工具结果超过单条上限
- GIVEN provider context window 为 128,000 tokens（GPT-4o）
- AND 单条上限 = 128000 × 4 × 50% = 256,000 字
- AND 历史中某条 `read_file` 结果长度 300,000 字
- WHEN `DefaultContextEngine.assemble()` 执行
- THEN 该消息的 content 被替换为 `[工具结果已截断，原始长度 300000 字符，超过单条上限 256000 字符]`
- AND 消息条目本身保留（LLM 仍能看到"这里有 read_file 工具调用"）

#### Scenario: 全局 context 超预算，从旧到新 compact
- GIVEN 总字符数超过 `contextWindow × 4 × 75%`
- WHEN `enforceToolResultBudget()` 执行全局压缩阶段
- THEN 最旧的 tool result 内容被替换为 `[工具结果已压缩以释放上下文空间]`
- AND 持续压缩直到总字符数回到预算内
- AND assistant / user 消息不被删除或修改
