# Proposal: Stream Decorator 洋葱模型

> Phase 9 | 优先级: 🟡 P1  
> Spec: [specs/agent-runner/spec.md](../../specs/agent-runner/spec.md)「Stream 装饰器管道（Decorator Pipeline）」

## 意图

当前 runner.ts 中 `for await (const delta of provider.streamChat(...))` 循环
直接处理原始流，没有标准化的中间层来处理各 Provider 的差异：

- DeepSeek-R1 的 `<think>...</think>` 推理块会泄露给用户
- 部分国内模型 HTML 转义工具参数（`&quot;` 等）
- 工具名可能有多余空格
- Token 计数散布在 runner 主循环中

## 目标

实现 Stream Decorator 管道——"洋葱模型"架构：

1. **统一装饰器签名** — `(source: AsyncGenerator<ChatDelta>) => AsyncGenerator<ChatDelta>`
2. **5 个装饰器** — trimToolCallNames、dropThinkingBlocks、sanitizeToolCallIds、decodeHtmlEntities、costTrace
3. **管道组合** — `applyDecorators(stream, provider)` 按 Provider 能力自动选择
4. **runner 零侵入** — runner 只调 `applyDecorators()`，不感知具体装饰器

## 范围

- **包含**：装饰器框架、5 个装饰器、runner 集成
- **不包含**：前端 thinking 块展开（可选展示属于 UI 层）

## 成功标准

- DeepSeek-R1 模型的 `<think>` 内容不出现在 `onDelta` 推送中
- 工具名 `"  read_file "` 自动清理为 `"read_file"`
- TypeScript 零新增编译错误
