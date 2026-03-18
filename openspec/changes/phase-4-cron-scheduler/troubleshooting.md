# Phase 4 Cron Scheduler — 排查记录

## 问题 1：cron-parser API 变更

### 现象

```
TypeError: CronExpressionParser.parseExpression is not a function
```

### 根因

`cron-parser@5.x` 重构了 API：
- ❌ `CronExpressionParser.parseExpression(expr)` （旧版）
- ✅ `CronExpressionParser.parse(expr)` （新版）

### 修复

```typescript
import { CronExpressionParser } from 'cron-parser';
const interval = CronExpressionParser.parse(expr);
const next = interval.next().toISOString();
```

### 原则

> 安装新包后，验证 API 签名。npm README 可能过时，直接看 `node_modules/cron-parser/lib/index.d.ts`。

---

## 问题 2：Cron 工具的 action 参数被模型忽略

### 现象

模型调用 `cron_scheduler` 时只传了 `name` 和 `cron`，没有传 `action` 字段。

### 根因

工具 schema 中 `action` 被定义为可选参数（不在 `required` 数组中）。

### 修复

```typescript
required: ['action']  // action 必须是 required
```

### 原则

> **模型只传 required 参数。** 所有逻辑分支的关键字段必须 required，optional 只用于真正可省略的补充参数。

---

## 问题 3：Responses API function_call_arguments.delta 匹配失败

### 现象

Responses API 流式事件：
```
response.function_call_arguments.delta { item_id: "fc_xxx", delta: '{"ac' }
```

但 `functionCallItems` Map 中存的 key 是 `response.output_item.added` 事件中的 `item.id`，两者可能不一致。

### 排查

打印 `response.output_item.added` 事件的 item：
```json
{
  "id": "fc_684d...",
  "type": "function_call",
  "call_id": "call_iGFn...",
  "name": "cron_scheduler"
}
```

打印 `response.function_call_arguments.delta` 事件：
```json
{
  "item_id": "fc_684d...",
  "output_index": 0
}
```

大部分情况下 `item_id === item.id`，但不能保证。

### 修复

三重保险机制：
```typescript
// output_item.added 时注册多个 key
functionCallItems.set(item.id, fc);
if (item.call_id) functionCallItems.set(item.call_id, fc);
functionCallItems.set(`idx_${event.output_index}`, fc);

// delta 时多种方式查找
let fc = functionCallItems.get(event.item_id)
       || functionCallItems.get(`idx_${event.output_index}`)
       || lastFc;  // 最后兜底：取最近添加的 fc
```

`lastFc` 灵感来自 OpenClaw 的 `currentItem` 状态机模式 — 在只有一个 function_call 的场景下（99% 情况），直接用最后一个即可。

### 原则

> **流式事件的关联 ID 不可完全信任。** 用多 key 注册 + fallback 策略确保匹配。

---

## 问题 4：Responses API function_call id 格式

### 现象

```
400 Bad Request: Invalid call_id format, expected 'fc_' prefix
```

### 根因

Chat Completions API 的 tool_call id 使用 `call_` 前缀，Responses API 要求 `fc_` 前缀。在多轮对话中，上一轮的 tool_call 结果被转换为 Responses API 的 input 时，id 格式不匹配。

### 修复

```typescript
function toFcId(id: string): string {
  if (id.startsWith('fc_')) return id;
  if (id.startsWith('call_')) return 'fc_' + id.slice(5);
  return 'fc_' + id;
}

// 在 convertToResponsesInput() 中所有涉及 function_call 的 id 和 call_id 字段都通过 toFcId() 转换
```

### 原则

> **Chat Completions 和 Responses API 是两套 ID 体系。** 混用时必须做格式转换。

---

## 测试验证

### Cron 工具端到端验证

```
User: "每分钟提醒我喝水"
→ LLM: function_call { name: "cron_scheduler", args: { action: "add", name: "提醒喝水", cron: "* * * * *", notifyBody: "该喝水了！" } }
→ Tool result: { success: true, job: { id: "xxx", name: "提醒喝水", nextRunAt: "..." } }
→ LLM: "好的，已设置每分钟提醒你喝水 💧"
```

```
User: "列出所有定时任务"
→ LLM: function_call { name: "cron_scheduler", args: { action: "list" } }
→ Tool result: { jobs: [...] }
→ LLM: "你有 1 个定时任务：..."
```

### 直接 API 验证（绕过我们的代码）

```powershell
# 联想端点 — 确认 function calling 正常
Invoke-WebRequest -Uri "https://aiverse-row.ludp.lenovo.com/.../chat/completions" `
  -Method POST -Headers @{ Authorization="Bearer sk-..." } `
  -Body (@{ model="gpt-4o"; messages=@(@{role="user";content="帮我设置闹钟"}); tools=@($cronSchema) } | ConvertTo-Json -Depth 10)
# → 200 OK, choices[0].message.tool_calls = [{ function: { name: "cron_scheduler" } }]
```

## 经验总结

1. **cron-parser v5 API 不向后兼容**：`parse()` 不是 `parseExpression()`
2. **required 字段决定模型行为**：不在 required 中的参数，模型可能不传
3. **Responses API 流式事件关联 ID 需要多 key 匹配**：item.id / call_id / output_index 三种方式 + lastFc fallback
4. **两套 API 的 ID 前缀不同**：`call_` (Chat Completions) vs `fc_` (Responses API)，混用时必须转换
5. **直接 API 调用是最佳排查起点**：用 PowerShell `Invoke-WebRequest` 隔离代码层和 API 层问题
