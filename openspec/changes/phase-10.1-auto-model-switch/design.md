# Phase 10.1 — 设计文档

## 架构

```
前端 Chat.tsx
  ├─ Auto 开关 (toggle)
  └─ 模型下拉 (select, disabled when Auto=ON)
        │
        ▼ sendMessage(message, model?)
  Tauri proxy.rs
        │ POST /chat/stream { message, sessionKey, model? }
        ▼
  Core index.ts
        │ model = "auto" → routeModel() (Phase 10)
        │ model = "copilot/gpt-5.4" → getProviderById() (Manual)
        ▼
  runner.ts → streamChat()
```

## 1. MODEL_TIERS 升级

```typescript
const MODEL_TIERS: Record<Tier, ModelPreference[]> = {
  light: [
    { provider: 'copilot', model: 'gpt-4.1-mini' },  // 快速、便宜
    { provider: 'copilot', model: 'o4-mini' },        // 备选 mini
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-turbo' },
    { provider: 'volc' },
  ],
  standard: [
    { provider: 'copilot', model: 'gpt-5.2' },       // 主力
    { provider: 'copilot', model: 'gpt-4.1' },        // 备选
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-plus' },
    { provider: 'volc' },
  ],
  heavy: [
    { provider: 'copilot', model: 'gpt-5.4' },        // 最强
    { provider: 'copilot', model: 'claude-sonnet-4' }, // 备选最强
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'qwen', model: 'qwen-max' },
    { provider: 'volc' },
  ],
}
```

## 2. 模型选择逻辑

```
if model === undefined || model === "auto":
    → routeModel(message)    // 复杂度自动路由
else:
    → getProviderById(provider, model)  // 用户指定
```

## 3. 设置持久化

新增两个 key 到 settings.json:
- `MODEL_ROUTING`: `"auto"` | `"manual"`（默认 `"auto"`）
- `SELECTED_MODEL`: `"copilot/gpt-5.4"` 格式（默认空）

## 4. 前端组件

聊天输入区上方增加模型选择器：
```
┌──────────────────────────────────┐
│  🤖 Auto ◉  │  gpt-5.2 (auto)  │   ← Auto ON 时显示 "(auto)"
│  🤖 Auto ○  │  [gpt-5.4    ▾]  │   ← Auto OFF 时可选
└──────────────────────────────────┘
```

## 5. 可选模型列表

前端从 `/providers` 拿完整列表，合并为扁平数组：
```
copilot/gpt-4.1-mini
copilot/gpt-4.1
copilot/gpt-4o
copilot/gpt-5.1
copilot/gpt-5.2
copilot/gpt-5.4
copilot/o3-mini
copilot/o4-mini
copilot/claude-sonnet-4
copilot/claude-3.5-sonnet
copilot/gemini-2.0-flash-001
deepseek/deepseek-chat
deepseek/deepseek-reasoner
qwen/qwen-turbo
qwen/qwen-plus
qwen/qwen-max
volc/doubao-seed-1-6-250615
```
