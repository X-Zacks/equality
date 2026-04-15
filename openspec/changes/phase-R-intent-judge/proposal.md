# Proposal: Intent Judge LLM — 意图判断模型配置

## 背景

Equality 的自动记忆功能（autoCapture）需要判断用户消息是否包含应保存的信息。纯正则匹配无法区分 "我喜欢 TypeScript"（应保存）和 "我喜欢什么"（查询型，不应保存）。

Phase R1 已引入 LLM 意图判断机制：用当前对话模型并行判断用户意图。但用户可能希望：
1. 用一个轻量便宜的模型专门做意图判断（如 MiniMax-M2.7），而非用昂贵的主模型
2. 在 UI 上明确指定哪个模型作为"意图判断模型"
3. 未来扩展：其他需要 true/false 推理的场景也能复用此机制

## 目标

提供一个 **Intent Judge（意图判断）LLM 选择配置**，让用户在设置页的 Provider 管理界面中指定哪个已配置的模型用于意图判断。

## 范围

### R2: Intent Judge 配置 (P1)
- 数据模型：新增 `INTENT_JUDGE_PROVIDER` + `INTENT_JUDGE_MODEL` 两个 Secret Key
- Core API：`GET /settings` 返回当前 intent judge 配置；`POST /settings/secrets` 可设置
- Desktop UI：Provider Drawer（各 Provider 管理弹窗）中增加 "意图判断" 开关
  - 排他性：同一时刻只有一个 Provider+Model 可作为 Intent Judge
  - 开关打开时自动关闭其他 Provider 的 Intent Judge
  - 未指定时默认使用当前对话模型
- 已实现的 autoCapture LLM 意图判断自动读取此配置

### 扩展思考

#### 为什么不叫 "辅助模型" / "Secondary Model"？
意图判断是一个具体、窄范围的功能。叫 "辅助模型" 范围太模糊，容易与 Model Routing（自动选模型）混淆。保持名称精确：**Intent Judge**。

#### 哪些场景可复用？
当前仅用于 autoCapture 意图判断。未来可能扩展：
- 安全审计（判断工具调用是否安全）
- 对话摘要（判断是否需要压缩）
- 查询分类（判断用户意图类别）

但这些扩展不在本 Phase 范围内，本次只关注记忆意图判断。

## 非目标
- 不改变 Model Routing 逻辑
- 不增加新的 Provider 类型
- 不影响主对话模型的选择
