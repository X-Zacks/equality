# Phase U: LLM 请求次数追踪与配额预警

## 意图

GitHub Copilot 企业版等 LLM 服务按**请求次数**（而非 token）计费：每月 1000 次高级模型请求，超额后降级为 GPT-4o 等基础模型。当前 Equality 的 Cost Ledger 只追踪 token 和 CNY 费用，用户无法感知"本月还剩多少次高级模型请求"，容易意外耗尽配额。

## 范围

1. 在每次 LLM 调用时记录 **请求次数**，按 provider + model tier 分类统计
2. 提供可配置的**月度配额**（如 Copilot 高级模型 1000 次/月）
3. 配额使用达到阈值时**自动预警**，临近耗尽时**自动降级**到基础模型
4. 前端 `/usage` 命令和设置页展示请求次数消耗进度

## 高层方案

- 复用现有 `cost_entries` 表（每行已是一次 LLM 调用 = 一次请求），新增 `model_tier` 列
- 新增 `request_quotas` 表存储用户配额配置
- 在 `router.ts` 的路由决策中注入配额感知逻辑
- 前端设置页增加配额配置 UI + 消耗进度条

## 非目标

- 不处理 token 级配额（已有 Cost Ledger）
- 不处理多用户/多租户计费
- 不处理 API 提供商的实时余额查询（属于被动响应，已有 COOLDOWN_BILLING）
