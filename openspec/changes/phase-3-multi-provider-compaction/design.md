# Design: Phase 3 — 多 Provider + Compaction + Settings 面板

## 技术栈增量

| 组件 | 选型 | 理由 |
|------|------|------|
| LLM SDK | `openai`（已有） | DeepSeek / 通义千问均为 OpenAI 兼容，只换 baseURL |
| Token 估算 | 自研轻量估算器 | 避免引入 tiktoken 等重依赖，精度够用 |
| React 组件 | 原生 React（已有） | Settings 面板不需要额外 UI 框架 |

## 目录结构（新增部分）

```
packages/
└── core/
    └── src/
        ├── providers/
        │   ├── types.ts             ← 扩展：ProviderCapabilities
        │   ├── base.ts              ← 新增：OpenAICompatProvider 基类
        │   ├── registry.ts          ← 新增：ProviderRegistry（注册 + 路由）
        │   ├── copilot.ts           ← 重构：继承 base.ts
        │   ├── copilot-auth.ts      ← 不变
        │   ├── custom.ts            ← 重构：继承 base.ts
        │   ├── deepseek.ts          ← 新增
        │   └── qwen.ts             ← 新增
        ├── context/
        │   ├── compaction.ts        ← 新增：Compaction 引擎
        │   └── token-estimator.ts   ← 新增：轻量 token 估算
        └── cost/
            └── rates.ts             ← 新增：多 Provider 费率表
└── desktop/
    └── src/
        ├── Settings.tsx             ← 重构：多 Tab 面板
        ├── Settings.css             ← 重构
        ├── Markdown.tsx             ← 增强：代码块复制按钮
        └── Chat.tsx                 ← 增强：消息复制/重新生成
```

---

## A. 多 Provider 详细设计

### A1. OpenAICompatProvider 基类

```typescript
abstract class OpenAICompatProvider implements LLMProvider {
  protected client: OpenAI
  abstract readonly providerId: string
  abstract readonly modelId: string

  constructor(config: { baseURL: string; apiKey: string; model: string }) {
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    })
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<ChatDelta> {
    const stream = await this.client.chat.completions.create({
      model: this.modelId,
      messages: params.messages,
      tools: params.tools,
      stream: true,
    })
    // 统一的 stream → ChatDelta 转换逻辑
    for await (const chunk of stream) { ... }
  }

  abstract getCapabilities(): ProviderCapabilities
}
```

所有 Provider（含现有 copilot/custom）继承此基类，只需实现：
- `providerId` / `modelId` 属性
- `getCapabilities()` 返回模型能力
- 可选重写 `streamChat()` 处理特殊行为（如 R1 推理块）

### A2. ProviderRegistry

```typescript
class ProviderRegistry {
  private providers = new Map<string, LLMProvider>()

  register(provider: LLMProvider): void
  resolve(providerId: string): LLMProvider | undefined
  resolveAuto(): LLMProvider  // 根据已配置 Key 自动选择
  list(): string[]
}
```

自动路由优先级：
1. 用户在 Settings 中手动选择的 Provider
2. Copilot（如果已登录）
3. DeepSeek（如果有 API Key）
4. 通义千问（如果有 API Key）
5. Custom（如果已配置）

### A3. DeepSeek Provider

```typescript
class DeepSeekProvider extends OpenAICompatProvider {
  readonly providerId = 'deepseek'

  constructor(apiKey: string, model: string = 'deepseek-chat') {
    super({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey,
      model,
    })
  }

  getCapabilities(): ProviderCapabilities {
    return {
      contextWindow: this.modelId === 'deepseek-reasoner' ? 64_000 : 64_000,
      supportsToolCalling: this.modelId !== 'deepseek-reasoner', // R1 不支持 tool calling
      supportsVision: false,
      supportsThinking: this.modelId === 'deepseek-reasoner',
    }
  }
}
```

**R1 推理块处理**：DeepSeek R1 返回的 `reasoning_content` 字段需要特殊解析，在 `streamChat()` 中提取为 `ChatDelta.thinking` 字段（前端可选展示）。

### A4. Qwen Provider

```typescript
class QwenProvider extends OpenAICompatProvider {
  readonly providerId = 'qwen'

  constructor(apiKey: string, model: string = 'qwen-plus') {
    super({
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey,
      model,
    })
  }

  getCapabilities(): ProviderCapabilities {
    return {
      contextWindow: 131_072, // qwen-plus 128K
      supportsToolCalling: true,
      supportsVision: this.modelId === 'qwen-vl-max',
      supportsThinking: this.modelId.includes('qwq'),
    }
  }
}
```

### A5. 费率表

```typescript
// cost/rates.ts
const RATES: Record<string, { input: number; output: number }> = {
  // CNY per 1M tokens
  'copilot:gpt-4o':         { input: 0, output: 0 },       // Copilot 免费
  'copilot:claude-sonnet':  { input: 0, output: 0 },
  'deepseek:deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek:deepseek-reasoner': { input: 1.0, output: 16.0 },
  'qwen:qwen-plus':         { input: 0.8, output: 3.2 },
  'qwen:qwen-turbo':        { input: 0.3, output: 0.6 },
  'qwen:qwen-max':          { input: 2.0, output: 6.0 },
  'custom:*':               { input: 0, output: 0 },       // 用户自定义不计费
}
```

---

## B. Compaction 详细设计

### B1. 触发条件

```
每轮 runAttempt 结束后检查：

estimatedTokens(messages) / contextWindow > 0.5
    → 触发 Compaction
```

### B2. 压缩算法

```
输入：messages[] (完整对话历史)
输出：compactedMessages[] (压缩后的消息列表)

步骤：
1. 保留区域划分
   - 保护区：system prompt + 最近 4 轮对话（不可压缩）
   - 压缩区：保护区之前的所有历史消息

2. 修复孤立 tool_result
   - 如果某条 tool_result 的对应 assistant.tool_calls 被划入压缩区
   - 则 tool_result 也必须一同被压缩

3. 生成摘要
   - 将压缩区消息序列化为文本
   - 调用 LLM（用最便宜的模型）生成摘要
   - 摘要 Prompt：
     "请将以下对话历史压缩为简洁摘要，保留：
      - 进行中的任务状态
      - 批量操作进度
      - 所有标识符（文件路径、UUID、变量名等原样保留）
      - 关键决策和结论"

4. 替换
   - 用 { role: 'assistant', content: '[对话历史摘要]\n' + summary }
     替换压缩区的所有消息

5. 返回：保护区 + 摘要消息
```

### B3. Token 估算器

```typescript
// context/token-estimator.ts
function estimateTokens(text: string): number {
  let tokens = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f]/.test(char)) {
      tokens += 1.5  // CJK 字符 ≈ 1.5 token
    } else {
      tokens += 0.25 // ASCII ≈ 0.25 token (4 chars/token)
    }
  }
  return Math.ceil(tokens)
}

function estimateMessagesTokens(messages: Message[]): number {
  let total = 0
  for (const msg of messages) {
    total += 4  // message overhead
    total += estimateTokens(JSON.stringify(msg.content ?? ''))
    if ('tool_calls' in msg) total += estimateTokens(JSON.stringify(msg.tool_calls))
  }
  return total
}
```

### B4. 超时与兜底

```
Compaction 调用
    │
    ├── 成功（<60s）→ 使用压缩后的消息列表
    ├── 超时（≥60s）→ 跳过，用完整历史继续
    └── 异常         → 回退到 trimMessages() 暴力截断
```

---

## C. Settings 面板设计

### C1. 布局结构

```
┌──────────────────────────────────────┐
│  Settings                            │
├──────────────────────────────────────┤
│  [模型] [工具] [Skills] [代理] [关于]│  ← Tab 导航
├──────────────────────────────────────┤
│                                      │
│  （各 Tab 的内容区域）                │
│                                      │
└──────────────────────────────────────┘
```

### C2. 模型 Tab

```
Provider 选择
  ○ GitHub Copilot    [已登录 ✓]
  ○ DeepSeek          [API Key: sk-***] [测试连接]
  ○ 通义千问           [未配置]        [输入 API Key]
  ○ 自定义 OpenAI 兼容  [已配置 ✓]

模型选择
  [下拉框: deepseek-chat ▼]

当前状态
  Provider: deepseek | 模型: deepseek-chat | 上下文窗口: 64K
```

### C3. 工具 Tab

```
内置工具
  ✅ bash          超时: [30] 秒
  ✅ read_file
  ✅ write_file
  ✅ glob
  ✅ web_fetch

全局设置
  工具调用上限: [30] 次/轮
```

### C4. Core API 扩展

新增端点：
- `GET /providers` — 列出所有可用 Provider 及其配置状态
- `POST /providers/test` — 测试 Provider 连接（发送简单 prompt 检查可用性）
- `GET /settings/provider` — 获取当前活跃 Provider 配置
- `POST /settings/provider` — 切换活跃 Provider

---

## D. 对话体验设计

### D1. 代码块复制按钮

```
┌─────────────────────────────┐
│ typescript          [📋复制] │  ← 语言标签 + 复制按钮
├─────────────────────────────┤
│ const x = 42                │
│ console.log(x)              │
└─────────────────────────────┘
```

复制后按钮变为 `✓ 已复制`，2 秒后恢复。

### D2. 消息操作

hover 时在消息右上角显示操作按钮：
- 📋 复制（复制 Markdown 原文）
- 🔄 重新生成（仅 assistant 消息，删除当前回复重新请求）

### D3. 会话标题自动生成

```
第一轮对话完成后：
1. 取 user 第一条消息 + assistant 第一条回复
2. 调用 LLM：「用 ≤10 个中文字概括这段对话的主题，只返回标题」
3. 更新 Session 的 title 字段
4. SessionPanel 实时更新显示
```

---

## 实施顺序

```
Week 1: A1-A3（Provider 基类 + DeepSeek + Qwen）
Week 1: A4-A5（路由 + 费率）
Week 2: B1-B4（Compaction 全流程）
Week 2: C1-C4（Settings 面板）
Week 3: D1-D3（对话体验优化）
Week 3: 验收测试
```
