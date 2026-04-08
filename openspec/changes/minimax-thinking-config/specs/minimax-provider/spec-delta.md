# Delta Spec: MiniMax Provider 配置

## ADDED Requirements

### Requirement: MiniMax reasoning_split 参数支持

MiniMax provider 在调用 OpenAI 兼容 API 时 MUST 传递 `extra_body.reasoning_split` 参数。

#### Scenario: reasoning_split 为 true（默认）
- GIVEN MiniMax provider 被初始化
- AND 用户未开启「显示思考过程」（默认状态）
- WHEN 发送 chat completion 请求
- THEN 请求体包含 `extra_body: { reasoning_split: true }`
- AND 模型返回的 `reasoning_details` 字段被忽略，不发送到前端
- AND `content` 字段不含 `<think>` 标签

#### Scenario: reasoning_split 为 false（用户开启显示）
- GIVEN 用户在设置中开启「显示思考过程」
- WHEN 发送 chat completion 请求
- THEN 请求体包含 `extra_body: { reasoning_split: false }`
- AND `content` 中的 `<think>...</think>` 由 `dropThinkingBlocks` 装饰器处理
- AND 思考内容通过 SSE `thinking` 事件发送到前端

### Requirement: MiniMax supportsThinking 能力声明

MiniMax provider MUST 声明 `supportsThinking: true`，使流式装饰器管道自动注入 `dropThinkingBlocks`。

#### Scenario: 装饰器管道包含 dropThinkingBlocks
- GIVEN MiniMax provider capabilities 中 `supportsThinking = true`
- WHEN `buildDecoratorPipeline()` 执行
- THEN 返回的装饰器列表包含 `dropThinkingBlocks`

### Requirement: OpenAICompatProvider extraBody 支持

`OpenAICompatProvider` MUST 支持可选的 `extraBody` 配置，在每次 API 请求中透传到请求体。

#### Scenario: extraBody 合并到请求体
- GIVEN provider 配置了 `extraBody: { reasoning_split: true }`
- WHEN 构建 chat completion 请求
- THEN 最终请求体中包含 `reasoning_split: true` 字段

## ADDED Requirements (Settings)

### Requirement: MINIMAX_SHOW_THINKING 配置项

系统 MUST 支持 `MINIMAX_SHOW_THINKING` 配置键（Secret），值为 `"true"` 或 `"false"`（默认 `"false"`）。

#### Scenario: 默认不显示思考
- GIVEN 未配置 `MINIMAX_SHOW_THINKING`
- WHEN 读取配置
- THEN 返回 `false`

#### Scenario: 用户开启显示
- GIVEN `MINIMAX_SHOW_THINKING` 设为 `"true"`
- WHEN MiniMax provider 初始化
- THEN `reasoning_split` 设为 `false`
- AND `supportsThinking` 仍为 `true`（始终需要 dropThinkingBlocks 兜底）

## ADDED Requirements (Frontend)

### Requirement: 设置页 MiniMax 思考开关

设置页「高级」Tab MUST 包含一个开关项：「MiniMax 显示思考过程」。

#### Scenario: 切换开关
- GIVEN 用户在高级 Tab 看到「MiniMax 显示思考过程」开关
- WHEN 用户切换为开启
- THEN 保存 `MINIMAX_SHOW_THINKING=true` 到 secrets
- AND 下次对话请求使用 `reasoning_split=false`

### Requirement: 思考内容折叠展示

当「显示思考过程」开启时，聊天区 SHOULD 以折叠区域（`<details>`）展示模型的思考内容。

#### Scenario: 思考内容折叠展示
- GIVEN 用户开启了「显示思考过程」
- AND 模型返回了 `<think>` 内容
- WHEN 聊天区渲染该消息
- THEN `<think>` 内容显示在可折叠的「💭 思考过程」区域中
- AND 默认为折叠状态
