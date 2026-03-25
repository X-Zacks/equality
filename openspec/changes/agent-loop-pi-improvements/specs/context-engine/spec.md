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

> ⚠️ 裁剪阈值和保留轮次 N 的具体数值，需在实施前与开发者讨论确认后写入本 spec。

#### Scenario: 超大工具结果被裁剪
- GIVEN 历史消息中有一条 `read_file` 的工具结果，长度 50000 字符
- AND 该结果距当前轮次超过 N 轮
- WHEN `DefaultContextEngine.assemble()` 执行
- THEN 该工具结果的内容被替换为 `[工具结果已裁剪，原始长度 50000 字符]`
- AND 替换后的消息列表传递给后续 compaction 判断

#### Scenario: 最近轮次的工具结果不裁剪
- GIVEN 历史消息中最近一轮有 `bash` 工具结果，长度 30000 字符
- WHEN `DefaultContextEngine.assemble()` 执行
- THEN 该工具结果 SHALL NOT 被裁剪（保留完整内容）
