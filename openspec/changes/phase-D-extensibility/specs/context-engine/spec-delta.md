# Delta Spec: Phase D — 上下文引擎扩展

> 依赖: [../../../specs/context-engine/spec.md](../../../specs/context-engine/spec.md)
>
> 本 Delta Spec 覆盖 D3（Compaction 分段）、D4（可插拔引擎）对上下文引擎的行为变更。

---

## ADDED Requirements

### Requirement: Compaction 分段压缩（D3）

系统 SHALL 支持将长对话历史分段压缩，而非单次整体摘要。

- 当压缩区超过 `CHUNK_TOKEN_THRESHOLD`（默认 4000 tokens）时，MUST 先分块再逐块摘要再合并
- 分块策略 SHOULD 自适应：根据平均消息大小调整分块比例（0.15~0.4）
- 分块边界 MUST NOT 拆分 tool_call / tool_result 配对
- 每个分块的摘要 MUST 独立调用 LLM
- 最终合并的摘要 SHOULD 保持时间顺序

#### Scenario: 长历史分段压缩
- GIVEN 对话历史包含 60 条消息（约 12000 tokens）
- WHEN 触发 Compaction
- THEN 压缩区被分为 3 个 chunk
- AND 每个 chunk 独立生成摘要
- AND 3 个摘要合并为一条 system 消息替换压缩区

#### Scenario: tool_call/tool_result 不拆分
- GIVEN 压缩区中有一组 assistant(tool_calls) + tool(result) 消息
- WHEN 分块边界恰好在这两条消息之间
- THEN 分块器将这两条消息保持在同一个 chunk

---

### Requirement: 标识符保护（D3）

系统 SHALL 在 Compaction 过程中保护关键标识符不被 LLM 缩写或改写。

- UUID 格式（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）MUST 原样保留
- 文件路径（`/path/to/file.ts` 或 `C:\path\to\file.ts`）MUST 原样保留
- URL（`https://...`）MUST 原样保留
- Git commit hash（7+ 位十六进制）SHOULD 原样保留
- 标识符保护 MUST 通过正则预提取 + 摘要后验证实现

#### Scenario: UUID 在摘要中保留
- GIVEN 压缩区包含 `session-key: a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- WHEN Compaction 生成摘要
- THEN 摘要中仍包含完整 UUID `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

#### Scenario: 文件路径在摘要中保留
- GIVEN 压缩区包含 `修改了 packages/core/src/agent/runner.ts`
- WHEN Compaction 生成摘要
- THEN 摘要中仍包含完整路径 `packages/core/src/agent/runner.ts`

---

### Requirement: Compaction 重试与降级（D3）

系统 SHALL 在 Compaction 失败时进行重试和渐进降级。

- Compaction 调用 MUST 有超时保护（默认 60 秒）
- 失败后 MUST 重试最多 3 次，使用指数退避（1s, 2s, 4s）+ 随机抖动
- 3 次都失败时 MUST 降级到 `trimMessages()` 暴力截断
- 降级 SHOULD 记录警告日志

#### Scenario: Compaction 超时重试
- GIVEN Compaction 的 LLM 调用超过 60 秒
- WHEN 第一次超时
- THEN 系统等待 ~1 秒后重试
- AND 第二次成功后正常返回摘要

#### Scenario: 3 次失败降级
- GIVEN Compaction 连续 3 次失败
- WHEN 第 3 次失败后
- THEN 系统降级到 trimMessages() 截断
- AND 记录警告日志

---

### Requirement: 上下文引擎生命周期扩展（D4）

系统 SHALL 扩展 ContextEngine 接口，增加细粒度生命周期方法。

- `beforeTurn(params)` MUST 在 LLM 调用前被调用
- `afterToolCall(params)` MUST 在每次工具执行后被调用
- `beforeCompaction(params)` MUST 在 Compaction 执行前被调用
- 所有新方法 MUST 是可选的（不实现 = no-op），保持向后兼容
- 新方法 MUST NOT 阻塞主流程超过 100ms

#### Scenario: afterToolCall 被调用
- GIVEN 一个自定义 ContextEngine 实现了 afterToolCall
- WHEN Agent 执行了 bash 工具
- THEN afterToolCall 被调用，参数包含 toolName、args、result、mutationType

#### Scenario: 未实现可选方法不影响运行
- GIVEN DefaultContextEngine 未实现 beforeTurn
- WHEN runner 调用 beforeTurn
- THEN 调用安静地跳过（no-op）

---

## MODIFIED Requirements

### Requirement: Compaction 触发条件（修改）

**原规格**：超过上下文窗口 50% 时触发单次摘要。

**修改后**：
- 触发阈值不变（50%）
- 压缩区 < `CHUNK_TOKEN_THRESHOLD` 时使用原有单次摘要（向后兼容）
- 压缩区 ≥ `CHUNK_TOKEN_THRESHOLD` 时使用分段压缩（新逻辑）
- 摘要 prompt 中 MUST 注入标识符保护指令

#### Scenario: 小规模历史仍用单次摘要
- GIVEN 对话历史有 10 条消息（约 2000 tokens）
- WHEN 触发 Compaction
- THEN 使用原有单次摘要逻辑（不分块）

---

## REMOVED Requirements

（无）
