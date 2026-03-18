# Delta Spec: Context Engine

> Phase 12.1 实现 [specs/context-engine/spec.md](../../../specs/context-engine/spec.md)

## IMPLEMENTED Requirements

### Requirement: ContextEngine 接口
精简为 3 方法：assemble / afterTurn / dispose?

### Requirement: DefaultContextEngine
归集 runner 中散布的 system prompt 构造、memory recall、compaction、trimMessages 逻辑。

### Requirement: assemble()
输出包含 messages + wasCompacted + recalledMemories 计数。
