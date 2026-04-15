# Delta Spec: Intent Judge LLM 配置

## ADDED Requirements

### Requirement: Intent Judge 配置存储

系统 MUST 支持通过 `INTENT_JUDGE_PROVIDER` 和 `INTENT_JUDGE_MODEL` 两个 Secret Key 存储用户指定的意图判断模型。

- 值格式：`INTENT_JUDGE_PROVIDER` = provider id（如 "minimax"、"deepseek"），`INTENT_JUDGE_MODEL` = model id（如 "MiniMax-M2.7"）
- 当两个 Key 均未设置时，autoCapture 使用当前对话模型进行意图判断
- 当设置后，autoCapture 优先使用指定的 Intent Judge 模型

#### Scenario: 已配置 Intent Judge
- GIVEN `INTENT_JUDGE_PROVIDER` = "minimax" AND `INTENT_JUDGE_MODEL` = "MiniMax-M2.7"
- WHEN 用户发送 "我喜欢什么"
- THEN autoCapture 使用 MiniMax-M2.7 进行意图判断（而非主对话模型）

#### Scenario: 未配置 Intent Judge
- GIVEN `INTENT_JUDGE_PROVIDER` 和 `INTENT_JUDGE_MODEL` 均未设置
- WHEN 用户发送 "记住我叫张三"
- THEN autoCapture 使用当前对话模型进行意图判断

#### Scenario: Intent Judge 模型不可用
- GIVEN `INTENT_JUDGE_PROVIDER` = "minimax" 但 MiniMax API Key 未配置
- WHEN 用户发送记忆相关消息
- THEN 降级到当前对话模型进行意图判断
- AND Core 日志输出降级警告

---

### Requirement: Provider Drawer 意图判断开关

Desktop Settings 页 Provider Drawer MUST 增加 "🧠 意图判断" 开关。

- 开关为排他性：同一时刻只有一个 Provider 可启用 Intent Judge
- 打开某个 Provider 的 Intent Judge 开关时，自动关闭其他 Provider 的
- 开关关闭时清除 `INTENT_JUDGE_PROVIDER` 和 `INTENT_JUDGE_MODEL`
- 开关仅在 Provider 已配置（status = 'configured' 或 'active'）时可操作

#### Scenario: 启用 Intent Judge
- GIVEN 用户打开 MiniMax Provider Drawer
- AND MiniMax 已配置
- WHEN 用户打开 "意图判断" 开关
- THEN `INTENT_JUDGE_PROVIDER` 设为 "minimax"
- AND `INTENT_JUDGE_MODEL` 设为该 Provider 的当前模型
- AND 其他 Provider 的 Intent Judge 开关自动关闭

#### Scenario: 关闭 Intent Judge
- GIVEN MiniMax 的 Intent Judge 已启用
- WHEN 用户关闭该开关
- THEN `INTENT_JUDGE_PROVIDER` 和 `INTENT_JUDGE_MODEL` 被清除
- AND autoCapture 回退到使用当前对话模型

#### Scenario: Provider 未配置时
- GIVEN DeepSeek API Key 未配置
- WHEN 用户打开 DeepSeek Provider Drawer
- THEN "意图判断" 开关显示但 disabled

---

### Requirement: Settings API 暴露 Intent Judge 状态

`GET /settings` 响应 MUST 包含 `intentJudge` 字段。

```json
{
  "intentJudge": {
    "provider": "minimax",
    "model": "MiniMax-M2.7"
  }
}
```

未配置时：`"intentJudge": null`

#### Scenario: 查询 Intent Judge 状态
- GIVEN Intent Judge 配置为 minimax/MiniMax-M2.7
- WHEN 客户端请求 `GET /settings`
- THEN 响应包含 `intentJudge: { provider: "minimax", model: "MiniMax-M2.7" }`
