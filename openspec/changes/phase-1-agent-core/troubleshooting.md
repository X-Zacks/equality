# Phase 1 Agent Core — 排查记录

## 问题 1：System Prompt 过长抑制 Tool Calling

### 现象

Agent Runner 正确传递了 15 个工具定义，但 LLM 始终返回纯文字回复，不发起 function_call。

### 排查

| system prompt 长度 | 工具数量 | 模型行为 |
|---|---|---|
| 0（无 system prompt） | 15 | ✅ tool_call |
| ~60 字（极简中文） | 15 | ✅ tool_call |
| ~150 字（简短中文 + 时间/平台/cwd） | 15 | ✅ tool_call |
| ~800 字（7 条规则 + TOOL_INSTRUCTIONS） | 15 | ❌ 纯文字 |

### 根因

system prompt + 15 个 tool schema（每个约 60 tokens）→ 总 prefix 约 1500 tokens。gpt-4o 在 input 中有大量结构化定义时，长 system prompt 的指令（如"如果用户需要做某件事，调用工具"）反而让模型倾向于*解释*工具而非*调用*工具。

### 修复

```
Before (~800 chars, 7 rules + TOOL_INSTRUCTIONS block):
  你是 Equality，用中文回复...
  ## TOOL_INSTRUCTIONS
  - 当用户请求涉及文件操作时，使用 read_file / write_file / ...
  - 当用户请求涉及系统信息时，使用 system_info / ...
  - 永远不要向用户描述工具的存在...
  ... (7 more rules)

After (~60 chars):
  你是 Equality，一个桌面 AI 助理。用中文回复。
  当用户的请求可以通过工具完成时，直接调用工具，不要描述工具用法。
```

### 原则

> **工具 schema 的 `description` 字段已经是最好的工具使用指南。**
> System prompt 不需要重复工具用途，只需要一句"直接调用"就够了。

---

## 问题 2：Provider 优先级影响工具可用性

### 现象

默认 Provider 是 Copilot，但 Copilot headers 配置错误（见 copilot-provider/troubleshooting.md），导致 tool calling 完全失效。用户配置了可靠的自定义端点（联想 aiverse），但它排在 Copilot 之后。

### 修复

`providers/index.ts` 中的 `PROVIDER_ORDER`：

```
Before: copilot → custom → deepseek → qwen → volc
After:  custom → copilot → deepseek → qwen → volc
```

### 原则

> **把最可靠的 Provider 放在第一位。** 自定义端点使用标准 OpenAI API，100% 兼容 function calling。Copilot 是代理层，有额外限制。

---

## 问题 3：Runner 的 Tool Loop 在 finishReason='stop' 时退出

### 现象

即使 LLM 返回了 function_call，Runner 的 tool loop 在第一轮就退出，不执行工具。

### 排查

Runner 的 while 循环条件：
```typescript
while (finishReason === 'tool_calls') { ... }
```

但 Responses API 的 `response.completed` 事件被 yield 为 `finishReason: 'stop'`，所以循环不会进入。

### 修复

在 `copilot.ts` 的 `_streamViaResponses()` 中：

```typescript
// response.completed 事件
const finishReason = nextToolIndex > 0 ? 'tool_calls' : 'stop';
yield { type: 'finish', finishReason };
```

### 原则

> **Responses API 的 `response.completed` 不携带 finishReason，需要根据 output items 自行判断。**

---

## 经验总结

1. **System prompt 是一把双刃剑**：对于有工具的 agent，精简 > 详尽
2. **Provider fallback 顺序很重要**：把最可靠、最标准的放在前面
3. **流式输出的元数据不是标准的**：不同 API（Chat Completions vs Responses）的 finishReason 语义不同
4. **直接 API 调用是最好的调试手段**：`Invoke-WebRequest` + JSON body 可以在 1 分钟内定位问题是在代码层还是 API 层
