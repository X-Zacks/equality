# Context Engine Specification

> 描述上下文管理的可插拔接口：在 token 预算内组装最终发给 LLM 的消息列表。  
> Context Engine 是 RAG、记忆、Compaction 的统一接入点。  
> 依赖：[session/spec.md](../session/spec.md)、[compaction/spec.md](../compaction/spec.md)

---

## Requirements

### Requirement: ContextEngine 接口

系统 MUST 定义 `ContextEngine` 可插拔接口，允许替换上下文管理策略：

```typescript
interface ContextEngine {
  readonly engineId: string;
  
  // Session 首次初始化时调用（加载历史、建立索引等）
  bootstrap(params: BootstrapParams): Promise<BootstrapResult>;
  
  // 每条消息摄入时调用（持久化、更新向量索引等）
  ingest(params: IngestParams): Promise<void>;
  
  // 核心：在 token 预算内，返回准备好给 LLM 的有序消息列表
  assemble(params: AssembleParams): Promise<AssembleResult>;
  
  // 每轮对话完成后调用（触发压缩决策、持久化等）
  afterTurn(params: AfterTurnParams): Promise<void>;
  
  // 子代理启动前准备（返回 rollback 函数，启动失败时回滚）
  prepareSubagentSpawn?(params: SpawnParams): Promise<{ rollback: () => Promise<void> }>;
  
  // 资源清理
  dispose?(): Promise<void>;
}
```

---

### Requirement: assemble() 的职责

`assemble()` MUST 在给定 token 预算内，返回一个**准备好直接传给 LLM API 的有序消息数组**。

输入参数：
```typescript
interface AssembleParams {
  sessionKey: string;
  tokenBudget: number;      // 可用 token 上限（= 模型上下文窗口 - System Prompt tokens）
  systemPromptTokens: number; // System Prompt 已占用的 tokens
}
```

输出：
```typescript
interface AssembleResult {
  messages: LLMMessage[];   // 最终消息列表
  usedTokens: number;       // 实际使用的 tokens
  wasCompacted: boolean;    // 本次是否触发了 Compaction
}
```

实现自由度：`assemble()` 的内部实现 MAY 使用任意策略（最新 N 条 / 语义检索 / 向量 RAG 混合），只要结果符合以下约束：
1. 消息顺序 MUST 从旧到新（LLM API 要求）
2. 不得出现连续两条 `user` 消息或连续两条 `assistant` 消息
3. 每个 `tool_result` MUST 有对应的 `tool_use`（成对出现）

---

### Requirement: DefaultContextEngine（Phase 1 实现）

Phase 1 MUST 提供 `DefaultContextEngine`，实现最简策略：

- `assemble()`：返回全部历史消息（按 token 预算截断最旧消息）
- `afterTurn()`：持久化 Session 到磁盘，检查是否触发 Compaction
- `ingest()`：追加消息到内存 Session 并标记为 dirty

Phase 5 引入 `RagContextEngine`：在 `assemble()` 中加入向量检索，将相关历史片段注入。

---

### Requirement: token 预算计算

`assemble()` MUST 按以下方式计算可用 token 预算：

```
tokenBudget = contextWindowTokens
            - systemPromptTokens      // System Prompt 固定开销
            - outputReserveTokens     // 为模型输出预留（默认 4096）
            - safetyMargin            // 安全余量 20%（tokens × 0.2）
```

若历史消息超出预算，MUST 优先移除最旧的消息（保留最近的上下文）。

#### Scenario: 长对话历史超出预算
- GIVEN 模型上下文窗口 64K tokens
- AND System Prompt 占 8K tokens
- AND 历史消息总计 65K tokens（已超出可用空间）
- WHEN `assemble()` 被调用
- THEN 自动移除最旧的历史消息，直到总量在预算内
- AND 若压缩条件满足（>50%），触发 Compaction
