# Phase 10.1 — Auto/Manual 模型选择开关

> 提案日期：2026-03-15
> 状态：✅ 已批准

## 动机

Phase 10 实现了基于消息复杂度的智能路由，但存在两个问题：

1. **模型覆盖不全**：heavy tier 只路由到 `claude-sonnet-4`，未利用 GPT-5.4、GPT-5.2 等更强模型
2. **缺少手动控制**：用户无法在界面上关闭自动路由、直接选定一个模型使用

## 目标

- 在前端增加 Auto/Manual 模型开关
- Auto 模式：根据复杂度自动选模型，tier 覆盖所有 Copilot 可用模型（含 GPT-5.x 系列）
- Manual 模式：用户从下拉列表选模型，直接使用，不做复杂度路由
- 用户选择持久化到 settings.json

## 范围

| 层 | 变更 |
|----|------|
| Core — router.ts | 升级 MODEL_TIERS（heavy 用 gpt-5.4，standard 用 gpt-5.2，light 用 gpt-4.1-mini） |
| Core — index.ts | `/chat/stream` 和 `/settings` API 支持 `autoRoute` + `selectedModel` 参数 |
| Core — secrets.ts | 新增 `MODEL_ROUTING` 和 `SELECTED_MODEL` 两个 SecretKey |
| Desktop — Chat.tsx | 聊天输入区增加模型选择器（Auto 开关 + 下拉列表） |
| Desktop — useGateway.ts | `sendMessage` 新增 `model` 参数传递 |
| Desktop — proxy.rs | `chat_stream` 转发 `model` 字段 |

## 非目标

- 不改变 @model 覆盖语法（保留为高级用法）
- 不改变 fallback 机制
