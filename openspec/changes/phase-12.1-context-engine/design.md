# Design: Context Engine 可插拔接口

> Phase 12.1 | Spec: [specs/context-engine/spec.md](../../specs/context-engine/spec.md)

## 架构决策

### 1. 接口精简

Spec 定义了 6 个方法。本次实现精简为 3 个核心方法，其余标为 optional：

```typescript
interface ContextEngine {
  readonly engineId: string
  assemble(params: AssembleParams): Promise<AssembleResult>
  afterTurn(params: AfterTurnParams): Promise<void>
  dispose?(): Promise<void>
}
```

`ingest` 和 `bootstrap` 暂不实现（DefaultContextEngine 直接读 session.messages）。

### 2. DefaultContextEngine

将 runner 中以下散布逻辑归集：

| 原位置 | 归集到 |
|--------|--------|
| buildSystemPrompt + memory recall | assemble() → 构造 system 消息 |
| session.messages → messages 数组 | assemble() → 拼接历史 |
| compactIfNeeded | assemble() → 内部调用 |
| trimMessages | assemble() → 内部调用 |
| persist(session) | afterTurn() |

### 3. assemble() 输出

```typescript
interface AssembleResult {
  messages: ChatCompletionMessageParam[]
  systemTokens: number
  historyTokens: number
  wasCompacted: boolean
  recalledMemories: number
}
```

### 4. runner 集成

```
// 之前（步骤 4.6 ~ 6.5，约 30 行散布逻辑）
let systemContent = buildSystemPrompt(...)
if (recalledMemories) systemContent += ...
const messages = [{ role: 'system', content: systemContent }, ...session.messages]
await compactIfNeeded(messages, provider, ...)
trimMessages(messages, MAX_CONTEXT_CHARS)

// 之后（1 行）
const { messages } = await contextEngine.assemble({ ... })
```

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/context/types.ts` | 新增 | ContextEngine 接口 |
| `packages/core/src/context/default-engine.ts` | 新增 | DefaultContextEngine 实现 |
| `packages/core/src/context/index.ts` | 新增 | 导出 |
| `packages/core/src/agent/runner.ts` | 修改 | 使用 contextEngine.assemble() |
