# Delta Spec: LLM Provider — Phase 3 变更

> 基线：[openspec/specs/llm-provider/spec.md](../../../specs/llm-provider/spec.md)

---

## ADDED Requirements

### Requirement: OpenAICompatProvider 基类

系统 MUST 实现通用的 `OpenAICompatProvider` 抽象基类，所有 OpenAI 兼容 Provider 继承此基类。

基类 MUST 提供：
- `streamChat()` 统一流式对话实现（OpenAI SDK，替换 baseURL + apiKey）
- `chat()` 非流式调用
- `getCapabilities()` 抽象方法（子类必须实现）

#### Scenario: 新 Provider 接入
- GIVEN 一个 OpenAI 兼容的 API 端点
- WHEN 开发者创建新的 Provider 类继承 `OpenAICompatProvider`
- THEN 只需提供 `baseURL`、`apiKey`、`modelId` 和 `getCapabilities()`
- AND 流式对话、工具调用等能力自动可用

---

### Requirement: DeepSeek Provider

系统 MUST 实现 `DeepSeekProvider`，直连 DeepSeek API。

| 属性 | 值 |
|------|-----|
| providerId | `deepseek` |
| baseURL | `https://api.deepseek.com/v1` |
| 模型 | `deepseek-chat`（V3）、`deepseek-reasoner`（R1） |
| 认证 | API Key（`DEEPSEEK_API_KEY`） |
| 上下文窗口 | 64K tokens |
| Tool Calling | V3 支持，R1 不支持 |
| 推理块 | R1 返回 `reasoning_content`，MUST 解析为 `ChatDelta.thinking` |

#### Scenario: DeepSeek R1 推理块
- GIVEN 使用 `deepseek-reasoner` 模型
- WHEN 流式返回包含 `reasoning_content` 字段
- THEN 将其解析为 `ChatDelta.thinking` 字段
- AND 不传 `tools` 参数（R1 不支持 Function Calling）

---

### Requirement: Qwen Provider

系统 MUST 实现 `QwenProvider`，直连阿里云 DashScope API。

| 属性 | 值 |
|------|-----|
| providerId | `qwen` |
| baseURL | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 模型 | `qwen-plus`、`qwen-turbo`、`qwen-max` |
| 认证 | API Key（`QWEN_API_KEY`） |
| 上下文窗口 | 131K tokens（qwen-plus） |
| Tool Calling | 支持 |

#### Scenario: 通义千问对话
- GIVEN 已配置 `QWEN_API_KEY`
- WHEN 用户选择 qwen Provider 发送消息
- THEN 请求发送到 DashScope 兼容端点
- AND 流式返回正常解析

---

### Requirement: Provider Registry

系统 MUST 实现 `ProviderRegistry`，管理所有已注册的 Provider 实例。

- `register(provider)` — 注册 Provider
- `resolve(providerId)` — 按 ID 查找
- `resolveAuto()` — 根据已配置 API Key 自动选择可用 Provider
- `list()` — 列出所有已注册 Provider

#### Scenario: 自动路由
- GIVEN 用户配置了 DeepSeek API Key 但未配置通义千问
- WHEN 系统调用 `resolveAuto()`
- THEN 返回 DeepSeek Provider

---

### Requirement: Provider 降级链

系统 MUST 实现 Provider 降级：主 Provider 调用失败时自动切换到备用。

降级规则：
- `AbortError`（用户取消）→ 不降级，立即抛出
- `Context Overflow` → 不降级，由 Compaction 处理
- `401/403`（认证失败）→ 切换到下一个可用 Provider
- `429`（限流）→ 切换到下一个可用 Provider
- `5xx`（服务错误）→ 切换到下一个可用 Provider
- 所有 Provider 均失败 → 返回统一错误给用户

#### Scenario: 主 Provider 限流降级
- GIVEN 主 Provider 为 DeepSeek，备用为通义千问
- WHEN DeepSeek 返回 429 Too Many Requests
- THEN 自动切换到通义千问重试
- AND 记录日志："Provider deepseek rate limited, falling back to qwen"

---

### Requirement: 多 Provider 费率表

系统 MUST 维护内置费率表，单位为 CNY / 1M tokens。

| Provider:Model | Input | Output |
|----------------|-------|--------|
| copilot:* | ¥0 | ¥0 |
| deepseek:deepseek-chat | ¥0.14 | ¥0.28 |
| deepseek:deepseek-reasoner | ¥1.0 | ¥16.0 |
| qwen:qwen-plus | ¥0.8 | ¥3.2 |
| qwen:qwen-turbo | ¥0.3 | ¥0.6 |
| qwen:qwen-max | ¥2.0 | ¥6.0 |
| custom:* | ¥0 | ¥0 |

---

## MODIFIED Requirements

### Requirement: Provider 实现优先级

（修改原表格，新增 DeepSeek 和 Qwen 行）

| Provider ID | 模型 | API 端点 | 认证方式 |
|-------------|------|---------|---------|
| `copilot` | claude-sonnet-4, gpt-4o 等 | `api.githubcopilot.com` | OAuth Device Flow |
| `custom` | 用户自定义 | 用户自定义 | API Key |
| `deepseek` | deepseek-chat, deepseek-reasoner | `api.deepseek.com/v1` | API Key |
| `qwen` | qwen-plus, qwen-turbo, qwen-max | `dashscope.aliyuncs.com/compatible-mode/v1` | API Key |

（Previously: 只有 copilot 和 custom 两行）
