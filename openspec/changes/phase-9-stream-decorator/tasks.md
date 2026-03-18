# Phase 9: Stream Decorator — Tasks

> 状态：🔄 进行中
> Spec: [specs/agent-runner/spec.md](../../specs/agent-runner/spec.md)「Stream 装饰器管道」

## 实施清单

### 1. stream.ts 装饰器框架

- [ ] 1.1 定义 `StreamDecorator` 类型签名
- [ ] 1.2 实现 `applyDecorators()` 管道组合函数
- [ ] 1.3 实现 `trimToolCallNames` 装饰器
- [ ] 1.4 实现 `dropThinkingBlocks` 装饰器（`<think>` 标签剥离）
- [ ] 1.5 实现 `sanitizeToolCallIds` 装饰器（Mistral 系列）
- [ ] 1.6 实现 `decodeHtmlEntities` 装饰器（国内模型）
- [ ] 1.7 实现 `costTrace` 装饰器（字符计数日志）
- [ ] 1.8 实现 `buildDecoratorPipeline(provider)` 自动选择

### 2. runner.ts 集成

- [ ] 2.1 import stream.ts
- [ ] 2.2 在 streamChat 调用处包裹 decorator pipeline

### 3. 验证

- [ ] 3.1 TypeScript 编译零新增错误
