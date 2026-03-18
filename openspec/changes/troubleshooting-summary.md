# 跨 Phase 排查经验汇总

> 本文档汇总了所有 Phase 的排查经验，用于后续生成 skills。

## 一、按根因分类

### A. API 兼容性

| 问题 | Phase | 修复 |
|------|-------|------|
| Copilot API 需要特定 headers 才开放 tool calling | Copilot Provider | 模仿 OpenClaw 的 `GitHubCopilotChat` headers |
| Responses API 的 id 前缀是 `fc_`，Chat Completions 是 `call_` | Phase 4 | `toFcId()` 转换函数 |
| Responses API 的 `response.completed` 不含 finishReason | Phase 1 | 根据 output items 自行判断 |
| cron-parser v5 重构了 API（`parse()` 非 `parseExpression()`） | Phase 4 | 直接读 .d.ts 文件确认 |

### B. Prompt Engineering

| 问题 | Phase | 修复 |
|------|-------|------|
| System prompt 过长（~800 字）抑制 tool calling | Phase 1 | 压缩到 ~60 字 |
| 工具关键字段不在 required 中，模型不传 | Phase 4 | `action` 设为 required |

### C. 流式事件处理

| 问题 | Phase | 修复 |
|------|-------|------|
| `function_call_arguments.delta` 的 `item_id` 匹配不上 | Phase 4 | 多 key 注册 + lastFc fallback |
| finishReason 始终为 `stop` 导致 tool loop 退出 | Phase 1 | 检查 `nextToolIndex > 0` |

### D. 架构选择

| 问题 | Phase | 修复 |
|------|-------|------|
| Provider 优先级 Copilot > Custom，但 Copilot 不可靠 | Phase 1 | Custom > Copilot |

---

## 二、通用排查方法论

### 方法 1：直接 API 调用隔离

**何时用**：怀疑是代码层 vs API 层问题。

```powershell
# 直接调端点，绕过所有中间层
Invoke-WebRequest -Uri $endpoint -Method POST `
  -Headers @{ Authorization="Bearer $key"; "Content-Type"="application/json" } `
  -Body ($body | ConvertTo-Json -Depth 10)
```

**决策树**：
- 直接调 API 能 tool_call → 问题在我们的代码
- 直接调 API 也不能 tool_call → 问题在 API 或 schema

### 方法 2：逐变量隔离

**何时用**：多个变量可能影响结果。

1. 列出所有可能的变量（headers、prompt、tools、model）
2. 固定其他变量，只改一个
3. 二分法：先测极端值（0 vs 全部），再缩小范围

### 方法 3：参考已知可工作的实现

**何时用**：API 文档不充分或行为不明确。

- OpenClaw 的 pi-ai 库：Copilot headers 配置
- OpenClaw 的 `currentItem` 状态机：流式事件处理模式
- OpenAI SDK 源码：Responses API 事件类型

### 方法 4：调试端点

**何时用**：需要运行时观察。

```
GET /tools/schemas  → 查看实际注册的工具 schema
GET /health         → 查看当前使用的 provider/model
```

在请求处理中写调试文件：
```typescript
writeFileSync('debug-request.json', JSON.stringify(body, null, 2));
```

---

## 三、Skills 模板

以下可直接用于生成 AI coding skills：

### Skill: Copilot API Function Calling
```
When implementing function calling with GitHub Copilot API:
- MUST set headers: User-Agent=GitHubCopilotChat/0.26.7, Editor-Version=vscode/1.96.2, 
  Openai-Intent=conversation-edits, X-Initiator=user|agent
- Without these headers, Copilot silently disables tool calling
- Reference: OpenClaw pi-ai library github-copilot-headers.js
```

### Skill: System Prompt for Tool-Calling Agents
```
When writing system prompts for agents with tools:
- Keep system prompt under 200 chars
- Do NOT repeat tool descriptions in system prompt (the schema descriptions are sufficient)
- One sentence "直接调用工具" is enough
- Long instructions cause model to explain tools instead of calling them
```

### Skill: OpenAI Responses API Streaming
```
When handling Responses API streaming events:
- response.completed does NOT contain finishReason; check nextToolIndex > 0
- function_call_arguments.delta.item_id may not match output_item.added.item.id
- Register function_call items by multiple keys: item.id, call_id, output_index
- Always keep a lastFc fallback for single-tool scenarios
- Convert call_ prefix to fc_ prefix when bridging Chat Completions ↔ Responses API
```

### Skill: Tool Schema Design
```
When designing tool schemas for LLM function calling:
- ALL control-flow parameters (like "action") MUST be in required[]
- Optional params should only be truly optional supplementary data
- Models tend to only send required parameters
- Use enum for action fields to constrain model choices
```

### Skill: Provider Priority Strategy
```
When implementing multi-provider LLM systems:
- Put the most standard/reliable provider first in fallback chain
- Custom OpenAI-compatible endpoints > proprietary proxies
- Test tool calling per-provider; some proxies silently disable it
```
