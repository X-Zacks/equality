# Design: Intent Judge LLM 配置

## 1. 数据模型

### Secret Keys（已实现）

```
INTENT_JUDGE_PROVIDER: string  // provider id: "minimax" | "deepseek" | "qwen" | "volc" | "copilot" | "custom"
INTENT_JUDGE_MODEL: string     // model id: "MiniMax-M2.7" | "deepseek-chat" | ...
```

已在 `secrets.ts` 的 `KEY_NAMES` 中注册。

### Settings API 扩展

`GET /settings` 响应新增 `intentJudge` 字段：

```typescript
interface SettingsResponse {
  // ... existing fields ...
  intentJudge: {
    provider: string
    model: string
  } | null
}
```

## 2. Core 端改动

### 2.1 `src/index.ts` — Settings 路由

在 `GET /settings` 的响应中读取 `INTENT_JUDGE_PROVIDER` 和 `INTENT_JUDGE_MODEL`，组装 `intentJudge` 字段。

### 2.2 autoCapture（已实现）

`src/agent/runner.ts` 中的 `autoCapture()` 已实现读取 `INTENT_JUDGE_PROVIDER` / `INTENT_JUDGE_MODEL`，
通过 `getProviderById()` 获取指定 provider 实例。加载失败时降级到当前对话 provider。

## 3. Desktop 端改动

### 3.1 `Settings.tsx` — ProviderDrawer 扩展

在每个 ProviderDrawer 底部（保存按钮上方）增加 "意图判断" 区域：

```
┌─ MiniMax 管理 ────────────────────────────────┐
│  API Key: ••••••••••                           │
│  [ 保存 ]  [ 清除 ]                           │
│                                                │
│  ─────────────────────────────────────────     │
│  🧠 意图判断                                   │
│  [✓] 使用此模型进行意图判断                     │
│  模型: MiniMax-M2.7                            │
│  ─────────────────────────────────────────     │
│                                                │
│  [ ✕ 关闭 ]                                   │
└────────────────────────────────────────────────┘
```

### 3.2 排他逻辑

```typescript
const handleIntentJudgeToggle = async (providerId: string, modelId: string, enabled: boolean) => {
  if (enabled) {
    // 设置新的 intent judge
    await saveApiKey('INTENT_JUDGE_PROVIDER', providerId)
    await saveApiKey('INTENT_JUDGE_MODEL', modelId)
  } else {
    // 清除
    await saveApiKey('INTENT_JUDGE_PROVIDER', '')
    await saveApiKey('INTENT_JUDGE_MODEL', '')
  }
  await refresh()
}
```

排他性通过读取 settings.intentJudge 实现：
- 如果 `settings.intentJudge?.provider === currentProviderId` → 开关 checked
- 否则 → 开关 unchecked
- 打开时直接覆盖写入，旧值自动失效

### 3.3 模型选择

对于有多个模型的 Provider（如 Copilot），需要选择具体模型：
- 单模型 Provider（DeepSeek、Qwen 等）：开关打开时自动使用其默认模型
- Copilot：使用当前选中的模型（`settings.selectedModel` 解析出 model id）
- Custom：使用 `CUSTOM_MODEL` 配置的模型

### 3.4 获取 Provider 默认模型的映射

```typescript
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
  volc: 'doubao-1.5-pro-256k',
  minimax: 'MiniMax-M2.7',
}
```

Copilot 和 Custom 需从 settings 中动态读取。

## 4. 文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `packages/core/src/config/secrets.ts` | ✅ 已完成 | 新增 INTENT_JUDGE_PROVIDER, INTENT_JUDGE_MODEL |
| `packages/core/src/agent/runner.ts` | ✅ 已完成 | autoCapture 读取 intent judge 配置 |
| `packages/core/src/index.ts` | 待实现 | GET /settings 增加 intentJudge 字段 |
| `packages/desktop/src/Settings.tsx` | 待实现 | ProviderDrawer 增加意图判断开关 |

## 5. 安全考虑

- Intent Judge 模型调用不传递工具 schema，仅传递轻量 prompt + 用户消息
- 不会泄露对话历史或工具调用结果
- LLM 返回的 JSON 做 try-catch 解析，格式异常时静默跳过（不保存记忆）
