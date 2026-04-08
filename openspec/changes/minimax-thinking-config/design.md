# Design: MiniMax Thinking 配置优化

> **变更 ID**: minimax-thinking-config  
> **架构决策日期**: 2026-04-08

---

## 1. 问题分析

### 当前数据流

```
MiniMax API → content 含 <think>...</think> → streamChat → 装饰器管道 → runner → SSE → Chat.tsx
                                                    ↑
                                            supportsThinking=false → 不注入 dropThinkingBlocks
                                            → <think> 内容原样输出到聊天区
```

### 根本原因

`createMiniMaxProvider()` 中 `supportsThinking` 缺省为 `false`（`DEFAULT_CAPABILITIES`），导致 `buildDecoratorPipeline()` 不注入 `dropThinkingBlocks` 装饰器。

### MiniMax API 特性

| 参数 | 值 | 行为 |
|------|----|------|
| `reasoning_split: true` | 默认推荐 | 思考内容输出到 `reasoning_details` 字段，`content` 不含 `<think>` |
| `reasoning_split: false` | 原生格式 | 思考内容以 `<think>` 标签嵌入 `content` |
| 不传此参数 | 同 `false` | 默认以 `<think>` 标签嵌入 `content` |

## 2. 方案设计

### 方案概要

采用 **双保险** 策略：

1. **API 层**：默认传 `reasoning_split: true`，让 MiniMax API 在服务端就把 thinking 分离到 `reasoning_details`，`content` 干净无 `<think>`
2. **装饰器层**：始终声明 `supportsThinking: true`，确保即使 API 行为变化，`dropThinkingBlocks` 也能兜底清除残余 `<think>`

### 配置项开关

```
用户开启「显示思考过程」（MINIMAX_SHOW_THINKING=true）：
  → reasoning_split=false（让 <think> 留在 content 中）
  → dropThinkingBlocks 仍然注入（兜底），但在 runner 中，
    识别到 showThinking=true 时，将 thinking 内容通过 onThinkingDelta 回调发送给前端
    → 前端在 Chat.tsx 中以折叠区域展示

用户关闭「显示思考过程」（默认）：
  → reasoning_split=true（API 层就把 thinking 分离，content 干净）
  → dropThinkingBlocks 兜底（以防万一）
  → 前端看不到任何思考内容
```

## 3. 实现层变更

### 3.1 `providers/base.ts` — 支持 extraBody

```typescript
// 构造器新增 extraBody 字段
constructor(opts: {
  providerId: string
  modelId: string
  apiKey: string
  baseURL: string
  capabilities?: Partial<ProviderCapabilities>
  extraBody?: Record<string, unknown>  // 新增
})

// streamChat 请求合并 extraBody
const requestBody = {
  model,
  messages: params.messages,
  stream: true as const,
  ...(params.tools?.length ? { tools: params.tools } : {}),
  ...this.extraBody,  // 新增：透传 reasoning_split 等参数
}
```

### 3.2 `providers/index.ts` — MiniMax 工厂函数

```typescript
export function createMiniMaxProvider(model = 'MiniMax-M2.7'): LLMProvider {
  const apiKey = getSecret('MINIMAX_API_KEY')
  const showThinking = hasSecret('MINIMAX_SHOW_THINKING')
    && getSecret('MINIMAX_SHOW_THINKING') === 'true'

  return new OpenAICompatProvider({
    providerId: 'minimax',
    modelId: model,
    apiKey,
    baseURL: 'https://api.minimaxi.com/v1',
    capabilities: {
      contextWindow: 1_000_000,
      supportsToolCalling: true,
      supportsVision: false,
      supportsThinking: true,  // ← 修改：始终 true，确保装饰器兜底
    },
    extraBody: {
      reasoning_split: !showThinking,  // 默认 true（分离），开启显示时 false
    },
  })
}
```

### 3.3 `config/secrets.ts` — 新增配置键

在 `KEY_NAMES` 数组中新增：
```typescript
'MINIMAX_SHOW_THINKING',
```

在 `listSecrets()` 中，该键不需要遮掩（值为 true/false）。

### 3.4 设置页 — 高级 Tab 新增开关

在 Settings.tsx 的「高级」Tab 中添加 toggle 开关：

```
📁 工作目录          [已配置路径]
🧠 MiniMax 显示思考   [ 关闭 | 开启 ]    ← 新增
⚡ 性能设置           Bash 超时 ›
```

保存时写入 `MINIMAX_SHOW_THINKING` = `"true"` 或 `"false"`。

### 3.5 默认模型升级

MiniMax 默认模型从 `MiniMax-M2.5` 升级到 `MiniMax-M2.7`（M2.7 是最新版本，支持 Interleaved Thinking 和 Function Calling 优化）。

## 4. 数据流（修改后）

### 默认模式（不显示 thinking）

```
MiniMax API (reasoning_split=true)
  → content 干净，reasoning_details 被 OpenAI SDK 忽略
  → streamChat 输出无 <think>
  → dropThinkingBlocks 兜底（无 <think> 则透传）
  → runner → SSE delta → Chat.tsx 正常渲染
```

### 显示 thinking 模式

```
MiniMax API (reasoning_split=false)
  → content 含 <think>思考内容</think>正式回复
  → streamChat 输出含 <think>
  → dropThinkingBlocks 剥离 <think> 内容 → onDelta 只输出正式回复
  → 前端不显示 <think>（与默认行为一致）
```

> **注意**：Phase 1 简化实现中，即使 `showThinking=true`，`dropThinkingBlocks` 仍会剥离 `<think>`。用户感知到的唯一区别是 reasoning_split 是否传递。后续 Phase 2 可实现前端折叠展示。

## 5. 不影响的组件

- DeepSeek / QwQ 等其他推理模型的 `dropThinkingBlocks` 路径不变
- Copilot / Custom provider 不受影响
- 前端 SessionPanel / Settings 其他 Tab 不变
