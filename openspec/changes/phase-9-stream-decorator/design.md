# Design: Stream Decorator 洋葱模型

> Phase 9 | Spec: [specs/agent-runner/spec.md](../../specs/agent-runner/spec.md)

## 架构决策

### 1. 装饰器签名

```typescript
type StreamDecorator = (source: AsyncGenerator<ChatDelta>) => AsyncGenerator<ChatDelta>
```

**理由**：纯函数，输入一个异步迭代器，输出一个。可任意组合、可测试。

### 2. 管道组合函数

```typescript
function applyDecorators(
  stream: AsyncGenerator<ChatDelta>,
  decorators: StreamDecorator[],
): AsyncGenerator<ChatDelta>
```

内部通过 `reduce` 链式包装：`decorators.reduce((s, d) => d(s), stream)`

### 3. 5 个装饰器

| 装饰器 | 何时启用 | 行为 |
|--------|---------|------|
| `trimToolCallNames` | 始终 | 去除 `toolCalls[].name` 前后空格 |
| `dropThinkingBlocks` | `supportsThinking` | 过滤 content 中的 `<think>...</think>` |
| `sanitizeToolCallIds` | `providerId` 含 mistral | 确保 tool_call id 格式为 `call_xxxx` |
| `decodeHtmlEntities` | `providerId` in [qwen, volc] | 解码 `&quot;` `&amp;` 等为原始字符 |
| `costTrace` | 始终 | 累计文本长度，打 console.log |

### 4. 自动选择策略

`buildDecoratorPipeline(provider: LLMProvider): StreamDecorator[]`

根据 `provider.getCapabilities()` 和 `provider.providerId` 自动组合。
runner 调用时不需要知道具体启用了哪些。

### 5. runner 集成点

```
// 之前
for await (const delta of provider.streamChat(streamParams)) { ... }

// 之后
const rawStream = provider.streamChat(streamParams)
const decorated = applyDecorators(rawStream, buildDecoratorPipeline(provider))
for await (const delta of decorated) { ... }
```

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/agent/stream.ts` | 新增 | 装饰器框架 + 5 个装饰器 |
| `packages/core/src/agent/runner.ts` | 修改 | 集成 `applyDecorators` + `buildDecoratorPipeline` |
