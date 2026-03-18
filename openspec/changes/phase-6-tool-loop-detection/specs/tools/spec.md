# Delta Spec: Tool Loop Detection

> Phase 6 变更对 [specs/tools/spec.md](../../../specs/tools/spec.md) 的影响

## MODIFIED Requirements

### Requirement: 工具调用循环检测（Loop Detection）

> 原 spec 中已定义 4 个检测器及其阈值、Hash 算法。本次实现完全覆盖。

**实现状态变更：**

- 检测器 1（generic_repeat）：原标注 Phase 2 → **已实现** ✅
- 检测器 2（known_poll_no_progress）：原标注 Phase 3 → **已实现** ✅
- 检测器 3（ping_pong）：原标注 Phase 3 → **已实现** ✅
- 检测器 4（global_circuit_breaker）：原标注 Phase 2 → **已实现**（从硬编码常量升级为 LoopDetector 类）✅

**新增实现细节（spec 未覆盖的部分）：**

- poll_no_progress 检测器对 `bash` 和 `process` 两个工具名生效
- poll_no_progress 阈值：warn@5, terminate@10（比 generic_repeat 更激进）
- 检测器优先级：circuit_breaker → poll_no_progress → generic_repeat → ping_pong
- 终止时注入 user 消息告知 LLM 循环原因，再无 tools 调一次 LLM 生成总结
