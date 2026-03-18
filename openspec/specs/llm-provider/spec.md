# LLM Provider Specification

> 描述 LLM Provider 抽象层：统一接口连接不同的国内模型 API。  
> 所有模型调用 MUST 经过此层，不得在业务代码中直接调用模型 SDK。

---

## Requirements

### Requirement: Provider 接口

系统 MUST 定义统一的 `LLMProvider` 接口：

```typescript
interface LLMProvider {
  readonly providerId: string;    // "deepseek" | "qwen" | "zhipu" | "moonshot" ...
  readonly modelId: string;       // "deepseek-v3" | "qwen3-coder-plus" ...
  
  // 流式对话调用（主要接口）
  streamChat(params: StreamChatParams): AsyncIterable<ChatDelta>;
  
  // 非流式（用于分类器等轻量调用）
  chat(params: ChatParams): Promise<ChatResponse>;
  
  // token 估算（无需 API 调用）
  estimateTokens(text: string): number;
  
  // Provider 能力声明
  getCapabilities(): ProviderCapabilities;
}

interface ProviderCapabilities {
  contextWindow: number;          // 上下文窗口大小（tokens）
  supportsVision: boolean;        // 是否支持图像输入
  supportsToolCalling: boolean;   // 是否支持 Function Calling
  supportsCacheControl: boolean;  // 是否支持 Prompt Cache
  supportsThinking: boolean;      // 是否有推理块（DeepSeek-R1 / QwQ 等）
}
```

---

### Requirement: Provider 实现优先级

系统 MUST 实现以下 Provider（按优先级排列）：

| Provider ID | 模型 | API 端点 | 协议 | 认证方式 |
|-------------|------|---------|------|---------|
| `copilot` | claude-sonnet-4, gpt-4o 等 | `https://api.githubcopilot.com` | OpenAI 兼容 | OAuth Device Flow → Bearer Token |
| `custom` | 用户自定义 | 用户自定义 | OpenAI 兼容 | API Key |
| `deepseek` | deepseek-v3, deepseek-r1 | `https://api.deepseek.com/v1` | OpenAI 兼容 | API Key |
| `qwen` | qwen3-coder-plus, qwen3-plus | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容 | API Key |
| `volc` | doubao-seed-1-8 等 | `https://ark.cn-beijing.volces.com/api/v3` | OpenAI 兼容 | API Key |

所有 Provider MUST 使用 OpenAI 兼容模式（仅替换 `baseURL` 和认证头）。

Copilot Provider 的详细设计参见 `openspec/changes/copilot-provider/design.md`。

---

### Requirement: Model Fallback（降级链）

系统 MUST 实现模型降级链，处理主模型不可用的情况：

```
主模型调用失败
    │
    ├── AbortError（用户取消）→ 立即抛出，不降级
    ├── Context Overflow   → 抛出，由 Compaction 机制处理，不降级
    │
    ▼
检查备用模型列表（config.routing.tiers[tier].fallback）
    │
    ├── API Key 冷却中 → 按探测节流（30s 最小间隔）探测
    ├── 限流（429）   → 等待 + 探测
    ├── 服务错误（5xx）→ 切换
    │
    ▼
所有备用模型均失败 → 返回统一错误消息给用户
```

**用户主动取消和超时必须区分**：超时允许降级，用户取消不降级。

---

### Requirement: API Key 管理

API Key MUST 使用 Windows DPAPI 加密存储（`%APPDATA%\Equality\config.enc`）。

- 读取：Gateway 启动时解密为内存中的运行时快照
- 写入：用户通过设置面板保存时，加密后写入磁盘
- 运行时：NEVER 将 API Key 写入日志文件

#### Scenario: API Key 解密失败（如 Windows 用户账户变更）
- GIVEN 用户更换了 Windows 账户（DPAPI 密钥绑定账户）
- WHEN Gateway 启动时尝试解密 API Key
- THEN 解密失败，Gateway 退出
- AND 在 Tauri 界面显示引导页，要求用户重新输入 API Key

---

### Requirement: Token Usage 追踪

每次 `streamChat()` 或 `chat()` 完成后，MUST 返回准确的 token 消耗信息：

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;    // Prompt Cache 命中（支持的模型）
  cacheWriteTokens: number;
  thinkingTokens?: number;    // 推理块 tokens（R1 / QwQ 等）
}
```

多轮工具调用的 `cacheReadTokens` MUST 取最后一轮的值（不累加），避免虚高。`outputTokens` MUST 累加所有轮次。

---

### Requirement: 费率配置

系统 MUST 维护一个费率表，支持远程更新：

- 优先级（高→低）：本地覆盖文件 > 远程拉取（CDN）> 内置兜底
- 远程更新频率：每 24 小时检查一次
- 离线时：使用上次成功拉取的缓存

费率单位：元（CNY）/ 1M tokens。

示例费率表（内置兜底）：

| Provider/Model | Input | Output | CacheRead |
|----------------|-------|--------|-----------|
| deepseek/deepseek-v3 | ¥0.14 | ¥0.28 | ¥0.014 |
| deepseek/deepseek-r1 | ¥1.0 | ¥16.0 | - |
| qwen/qwen3-coder-plus | ¥3.5 | ¥14.0 | ¥0.35 |
| qwen/qwen3-plus | ¥0.8 | ¥3.2 | - |
| moonshot/kimi-k2.5 | ¥8.0 | ¥32.0 | - |
