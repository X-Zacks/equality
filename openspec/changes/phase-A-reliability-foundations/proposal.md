# Proposal: Phase A — 可靠性基础

> 优先级: 🔴 P0
> 对标: OpenClaw `run.ts` failover 循环, `tool-loop-detection.ts` 四重检测器, `pi-tools.schema.ts` 跨 provider 兼容
> 依赖: engineering-parity-gap-analysis.md (GAP-1, GAP-3, GAP-4)

---

## 意图

Equality 当前 Agent Runner 存在三个可靠性短板：

1. **工具执行失败后无自动恢复**：bash 返回编译/测试错误时，模型需自行判断是否重试。OpenClaw 和 Cursor 在此场景下有自动错误注入 + 重试机制，让 Agent 能一轮解决"写代码→编译报错→修复"的闭环。

2. **循环检测缺少滑动窗口和结果哈希追踪**：现有 LoopDetector 四个检测器已实现，但全部基于无界 history 数组，无滑动窗口裁剪；`known_poll_no_progress` 检测器与 `generic_repeat` 逻辑相同只是阈值不同，缺少 OpenClaw 的"结果哈希事后补填"和"滑动窗口"机制。

3. **工具 Schema 直传 Provider 无兼容处理**：Gemini 不支持 `pattern`/`examples`；xAI 不支持 `maxLength`/`minLength`；部分模型不接受 `anyOf`/`oneOf`。当前直传原始 schema 导致工具调用在非 OpenAI provider 上失败。

## 目标

在不改变外部 API 的前提下，增强 Runner 的内在可靠性：

1. **编译错误自动重试**：bash 返回编译/测试错误时，自动提取错误信息注入对话，让 LLM 修复后重试（单次限 1 轮）
2. **循环检测增强**：增加滑动窗口裁剪、结果哈希事后补填、检测器独立化
3. **Schema 兼容层**：在发送给 provider 前按 provider 类型清洗工具 schema

## 范围

- **包含**：
  - runner.ts 编译错误检测与自动重试
  - loop-detector.ts 滑动窗口 + 事后补填
  - 新增 tools/schema-compat.ts
  - runner.ts 集成 schema 兼容
  - 单元测试

- **不包含**：
  - Provider Failover（rate_limit → 换 profile → fallback model）→ Phase E
  - Context overflow → compact → 重试 → Phase D
  - 用户可配置的 loop 检测阈值 → 后续迭代

## 成功标准

1. Agent 用 bash 执行 `tsc --noEmit` 编译报错时，自动提取错误信息让 LLM 修复，无需用户手动干预
2. LoopDetector 使用 30 条滑动窗口，内存不随对话增长
3. 使用 Gemini provider 时工具 schema 自动清洗，不再因 `pattern` 字段导致调用失败
4. `npx tsc --noEmit` 编译通过
