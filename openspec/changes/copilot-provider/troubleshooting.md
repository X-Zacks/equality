# Copilot Provider — Tool Calling 排查记录

## 问题

Copilot Provider 注册了 15 个工具（schema 格式正确），但 LLM 始终不发起 tool_calls，只用文字描述工具用法。

## 排查过程

### 1. 确认 tools schema 格式正确

```
GET /tools/schemas → 15 个工具，JSON Schema 格式完全正确
```

直接用相同的 15 个 tools schema 调联想端点，**立即返回 tool_calls**。排除 schema 问题。

### 2. 确认 tools 参数被传到 API

在 `OpenAICompatProvider.streamChat()` 中写调试文件，确认 `requestBody` 包含 `tools` 键和 15 个工具定义。排除代码传参问题。

### 3. 隔离变量：system prompt

| 条件 | tokens | tool_calls |
|------|--------|-----------|
| 直接 API（无 system prompt，1 条 user msg） | 46 | ✅ 立即调用 |
| 原 system prompt（~800 字 + TOOL_INSTRUCTIONS） | 1517 | ❌ 不调用 |
| 极简 system prompt（1 句英文） | 291 | ✅ 立即调用 |
| 精简 system prompt（3 行中文） | 961 | ❌ 不调用 |

**结论**：system prompt 过长时，模型在大量工具 schema 上下文中倾向于文字回复而非 tool call。

### 4. 隔离变量：Copilot API headers

| Headers | Provider | tool_calls |
|---------|----------|-----------|
| `User-Agent: Equality/1.0` | copilot/gpt-4o | ❌ |
| `User-Agent: GitHubCopilotChat/0.26.7` + `Openai-Intent: conversation-edits` + `X-Initiator: user` | copilot/gpt-4o | ✅ |

**结论**：Copilot API 根据 headers 决定是否开放 function calling 能力。

### 5. 隔离变量：Responses API (gpt-5.x)

- `gpt-5.4` 不支持 `/chat/completions`（返回 400）
- `gpt-5.4` 通过 `/responses` + 旧 headers → 偶尔发 function_call 但 args 为空
- `gpt-5.4` 通过 `/responses` + 正确 headers → 待验证

## 根因（三层）

### 根因 1：Copilot API Headers 错误

GitHub Copilot API 根据请求 headers 判断客户端类型，决定是否开放 function calling。

**必需 headers**（参考 OpenClaw 的 pi-ai 库）：
```
User-Agent: GitHubCopilotChat/0.26.7
Editor-Version: vscode/1.96.2
Editor-Plugin-Version: copilot-chat/0.26.7
Copilot-Integration-Id: vscode-chat
Openai-Intent: conversation-edits
X-Initiator: user | agent
```

`X-Initiator` 规则（来自 OpenClaw `github-copilot-headers.js`）：
- 最后一条 message 是 `user` → `"user"`
- 否则（如 tool result 后的后续轮次）→ `"agent"`

**修复**：`createCopilotClient()` 接受 `initiator` 参数，`streamChat()` 根据最后一条消息自动判断。

### 根因 2：System Prompt 过长抑制 Tool Calling

原 system prompt 约 800 字（含 7 条 TOOL_INSTRUCTIONS），加上 15 个工具 schema（~900 tokens），总 input tokens > 1500。联想端点的 gpt-4o 在这种情况下倾向于文字回复。

**修复**：将 system prompt 压缩到 3 行（~60 字），去掉冗长的工具使用说明。工具 schema 本身的 `description` 字段已经足够指导模型。

### 根因 3：Responses API finishReason 错误

`_streamViaResponses()` 在 `response.completed` 事件中无条件 yield `finishReason: 'stop'`，但当模型返回 function_call 时，runner 看到 `stop` 就退出了 tool loop。

**修复**：检查 `nextToolIndex > 0`，有 function_call 时 yield `'tool_calls'`。

## 关键代码变更

### `providers/copilot.ts`

1. `createCopilotClient({ initiator })` — 正确的 Copilot headers
2. `toFcId()` — 将 `call_` 前缀转为 Responses API 要求的 `fc_` 前缀
3. `_streamViaResponses()` — function_call items 多 key 注册 + `lastFc` fallback + 正确的 finishReason

### `providers/base.ts`

无结构性变更，仅调试日志（可清理）。

### `providers/index.ts`

Provider 优先级调整：`Custom > Copilot > DeepSeek > Qwen > Volc`。当用户同时配置了自定义端点和 Copilot 时，优先使用自定义端点（它 100% 支持标准 function calling）。

### `agent/system-prompt.ts`

从 ~800 字压缩到 ~60 字。核心原则：让 tools schema 自己说话，system prompt 只需要一句"直接调用工具"。

## 经验总结

1. **Copilot API ≠ OpenAI API**：Copilot 是 OpenAI 的代理，但有额外的 header 鉴权层，错误的 headers 会导致功能降级（如禁用 tool calling）
2. **模仿已知可工作的客户端**：OpenClaw 的 pi-ai 库是最好的参考，它的 headers 配置经过验证
3. **System prompt 长度影响 tool calling 概率**：过长的指令反而降低模型调用工具的意愿，精简是王道
4. **Responses API 的事件模型与 Chat Completions 不同**：finishReason 需要自己根据 output items 判断
5. **直接 API 测试是最快的隔离手段**：绕过所有中间层，用 curl/PowerShell 直接调端点
