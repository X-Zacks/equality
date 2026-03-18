# Phase 10.1 — Delta Spec

> 基于 Phase 10 Smart Model Routing 的增量规格

## 新增接口

### Settings Keys

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `MODEL_ROUTING` | `"auto"` \| `"manual"` | `"auto"` | 模型选择模式 |
| `SELECTED_MODEL` | string | `""` | Manual 模式下选定的模型，格式 `provider/model` |

### ChatBody 扩展

```typescript
interface ChatBody {
  message: string
  sessionKey?: string
  model?: string  // "auto" | "copilot/gpt-5.4" | "deepseek/deepseek-chat" | ...
}
```

### GET /settings 响应扩展

```json
{
  "configured": [...],
  "activeProvider": "copilot",
  "modelRouting": "auto",
  "selectedModel": ""
}
```

## 变更项

### router.ts — MODEL_TIERS

| Tier | 旧 | 新 |
|------|-----|-----|
| light | gpt-4.1-mini → qwen-turbo → deepseek → volc | gpt-4.1-mini → o4-mini → deepseek → qwen-turbo → volc |
| standard | gpt-4.1 → deepseek → qwen-plus → volc | **gpt-5.2** → gpt-4.1 → deepseek → qwen-plus → volc |
| heavy | claude-sonnet-4 → deepseek → qwen-max → volc | **gpt-5.4** → claude-sonnet-4 → deepseek → qwen-max → volc |

### index.ts — /chat/stream

- 读取 `req.body.model`
- `"auto"` 或 `undefined` → `routeModel()`
- 其他 → `getProviderById(providerId, modelId)`

### proxy.rs — chat_stream

- 新增 `model: Option<String>` 参数
- 转发到 Core POST body

### Chat.tsx

- 新增模型选择器组件
- Auto toggle + model select dropdown
- 切换时保存到 Core `/settings/api-key`
