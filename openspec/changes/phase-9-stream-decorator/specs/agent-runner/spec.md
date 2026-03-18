# Delta Spec: Stream Decorator Pipeline

> Phase 9 变更对 [specs/agent-runner/spec.md](../../../specs/agent-runner/spec.md) 的影响

## IMPLEMENTED Requirements

### Requirement: Stream 装饰器管道（Decorator Pipeline）

原 spec 中定义了 5 个装饰器。本次实现确认：

- 装饰器签名：`(source: AsyncGenerator<ChatDelta>) => AsyncGenerator<ChatDelta>`
- 管道组合：`applyDecorators(stream, decorators)` 通过 reduce 链式包装
- 自动选择：`buildDecoratorPipeline(provider)` 根据 capabilities/providerId 选择
- runner 只需两行代码集成，无需感知装饰器细节
- `dropThinkingBlocks` 处理跨 chunk 的 `<think>` 标签（流式场景标签可能被分割）
