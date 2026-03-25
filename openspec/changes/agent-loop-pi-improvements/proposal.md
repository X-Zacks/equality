# Proposal: Agent Loop 能力增强（借鉴 pi-agent-core）

> 优先级：🟡 P1  
> 关联 Specs：[specs/agent-runner/spec.md](../../specs/agent-runner/spec.md)、[specs/tools/spec.md](../../specs/tools/spec.md)、[specs/context-engine/spec.md](../../specs/context-engine/spec.md)

## 意图

`@mariozechner/pi-agent-core` 是 OpenClaw 使用的 Agent 框架，其中有几项设计值得移植进 Equality。当前 Equality 的 `runner.ts` 在以下方面存在明显短板：

1. **工具顺序执行**：同一轮 LLM 响应中有多个工具调用时（如 read_file + glob + bash），逐个串行执行，总耗时 = Σ 各工具耗时。
2. **无执行前拦截**：LLM 决定调用工具后，无任何审批/拦截机会，危险命令无法提前阻断。
3. **无结果后处理**：工具执行完后直接写入 messages，无法对结果做增强或审计。
4. **上下文只能被动压缩**：仅在超限时触发 Compaction（摘要），无法主动过滤/裁剪老旧消息。
5. **无法中途调整 Agent 行为**：用户在 Agent 执行过程中只能 abort，无法注入新指令让 Agent 调整方向。

## 目标

分四个阶段，渐进式引入以下能力：

| 阶段 | 能力 | 改动范围 |
|------|------|----------|
| **A** | 工具并行执行 | `runner.ts` |
| **B** | `beforeToolCall` / `afterToolCall` Hook | `runner.ts`（params 扩展） |
| **C** | `transformContext` 主动上下文裁剪 | `context/default-engine.ts`、`context/types.ts` |
| **D** | Steering 消息（执行中注入指令） | `runner.ts`、`index.ts`、新 HTTP 端点 |

## 范围

**包含：**
- 阶段 A/B：仅修改 `packages/core/src/agent/runner.ts`
- 阶段 C：修改 `context/types.ts`（扩展 `AssembleParams`）+ `context/default-engine.ts`
- 阶段 D：`runner.ts` + `index.ts` + 新端点 `POST /chat/steer`

**不包含：**
- Follow-up 消息队列（`SessionQueue` 已满足此需求）
- 动态 OAuth Token 刷新（`copilot-auth.ts` 已有独立方案）
- 自定义 AgentMessage 类型扩展（Equality 用 OpenAI 兼容格式，无此需求）

## 成功标准

- 阶段 A：多工具调用总耗时 ≤ 最慢单个工具耗时 × 1.1
- 阶段 B：`beforeToolCall` 返回 block 时，工具不执行，LLM 收到拒绝原因并继续
- 阶段 C：Context Engine 可在 compaction 触发前主动裁剪历史 tool result
- 阶段 D：`POST /chat/steer` 发出后，Agent 在当前工具轮结束后注入该消息并调整方向

## 阶段依赖

```
A（并行） ──► B（Hook）──► C（transformContext）
                            │
                            └──► D（Steering）    ← D 依赖 A（并行执行后才有"轮次间隙"）
```

## 需要讨论后再实施的阶段

- **阶段 C**：`transformContext` 应作为 `RunAttemptParams` 的可选参数、还是内置到 `DefaultContextEngine` 的规则引擎中？详见 [design.md](./design.md)。
- **阶段 D**：Steering queue 的状态存放位置（`index.ts` Map vs `SessionData` 字段）。详见 [design.md](./design.md)。
