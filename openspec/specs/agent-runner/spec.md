# Agent Runner Specification

> 描述单次 Agent 运行（一次用户消息 → 一次完整 AI 响应）的完整生命周期。  
> 依赖：[session/spec.md](../session/spec.md)、[context-engine/spec.md](../context-engine/spec.md)、[tools/spec.md](../tools/spec.md)

---

## Requirements

### Requirement: 运行入口

系统 SHALL 提供 `runAttempt(params)` 函数作为单次 Agent 运行的统一入口。

输入参数：
```typescript
interface RunAttemptParams {
  sessionKey: string;       // 路由到哪个 Session
  userMessage: string;      // 用户输入
  attachments?: Attachment[]; // 文件/图片附件
  model?: ModelSpec;        // 覆盖默认模型（可选）
  abortSignal?: AbortSignal; // 外部取消信号
}
```

输出：
```typescript
interface RunAttemptResult {
  text: string;             // 最终完整回复文本
  usage: TokenUsage;        // token 消耗
  toolCallCount: number;    // 本次运行中工具调用总数
  durationMs: number;       // 总耗时
  modelUsed: string;        // 实际使用的模型（可能因 fallback 不同）
}
```

#### Scenario: 正常单轮对话
- GIVEN 一条用户消息 "今天天气怎么样"
- WHEN `runAttempt()` 被调用
- THEN 系统调用 LLM Provider
- AND 流式返回文本给调用方
- AND 完成后返回 `RunAttemptResult`，包含 token 消耗

---

### Requirement: 流式输出

系统 MUST 支持流式（Streaming）输出，边生成边推送给渠道。

- 增量文本（delta）推送间隔 SHOULD NOT 低于 150ms（防止下游被淹没）
- 内部指令标签（`<eq:...>`）MUST 在推送前被剥离，不暴露给用户
- 工具调用开始前，MUST 先 flush 已缓冲的文本增量

#### Scenario: 长回复流式推送
- GIVEN LLM 正在生成一段 2000 字的回复
- WHEN 前 500 字已生成
- THEN 这 500 字 SHALL 已被推送给渠道，无需等待全部生成完毕

---

### Requirement: 工具调用循环

Agent 在单次 `runAttempt` 内 MAY 发起多轮工具调用。执行规则：

- 工具调用 MUST 经过 Loop Detection（见 [tools/spec.md](../tools/spec.md)）
- 单次运行内工具调用总次数 MUST NOT 超过全局断路器阈值（默认 30 次）
- 工具执行完成后，结果 MUST 回填到对话历史，作为下一轮 LLM 输入

#### Scenario: 工具调用结果作为上下文
- GIVEN Agent 调用了 `bash` 工具执行命令
- WHEN 命令执行完毕返回输出
- THEN 工具结果 SHALL 作为 `tool_result` 消息追加到对话历史
- AND LLM 的下一次调用 SHALL 包含该工具结果

---

### Requirement: Stream 装饰器管道（Decorator Pipeline）

`runAttempt` MUST 对 LLM 的原始 stream 应用装饰器管道，处理各 Provider 的差异。

每个装饰器 SHALL 是纯函数 wrapper，通过链式组合，互不侵入：

| 装饰器 | 触发条件 | 处理内容 |
|--------|---------|---------|
| `wrapTrimToolCallNames` | 始终 | 去除工具名中多余空格 |
| `wrapDropThinkingBlocks` | 推理模型（DeepSeek-R1 等）| 剥离 `<think>` 推理块 |
| `wrapSanitizeToolCallIds` | Mistral 系列 | 规范化工具调用 ID 格式 |
| `wrapDecodeHtmlEntities` | 部分国内模型 | 解码 HTML 实体编码的工具参数 |
| `wrapCostTrace` | 始终 | 记录 token 消耗到 CostLedger |

#### Scenario: DeepSeek-R1 推理块剥离
- GIVEN 使用 DeepSeek-R1 模型
- AND 模型回复包含 `<think>...</think>` 推理过程
- WHEN 文本推送给用户
- THEN `<think>` 块内容 SHALL 被剥离，用户看不到内部推理过程

---

### Requirement: 中止控制

系统 MUST 支持通过 `AbortSignal` 取消正在进行的 Agent 运行。

- 用户主动取消 MUST 立即中止 LLM 调用和工具执行
- 用户主动取消 MUST NOT 触发 Model Fallback（区别于超时）
- 中止后，当前已生成的部分文本 SHALL 被丢弃（不写入 Session 历史）

#### Scenario: 用户在 Tauri GUI 按下停止按钮
- GIVEN Agent 正在运行，已生成 200 字
- WHEN 用户点击"停止"按钮，前端触发 AbortSignal
- THEN LLM 调用立即中止
- AND 这 200 字不写入 Session 历史（保持历史一致性）
- AND Session 恢复到可接受新消息的状态

---

### Requirement: 错误分级与用户侧降级

`runAttempt` MUST 将内部错误转换为用户可感知的错误级别：

| 错误类型 | 用户侧行为 |
|---------|---------|
| API Key 无效（401 invalid_key）| 向渠道发送"配置错误"提示，不重试 |
| 余额不足（402 / insufficient_quota）| 向渠道发送"余额不足"提示，不重试 |
| 限流（429）| 等待后切换备用模型重试（Model Fallback）|
| 服务端错误（5xx）| 切换备用模型重试 |
| 用户取消（AbortError）| 静默，不向渠道发送任何消息 |

对于运行时间超过 30 秒的任务，系统 SHOULD 每 30 秒向渠道发送心跳提示（"⏳ 任务进行中..."），防止用户误以为 Bot 挂起。
