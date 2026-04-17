# Phase U: 请求配额 — 实施任务

## 后端

- [x] U1: `cost_entries` 表增加 `model_tier` 列 + 历史数据回填迁移
- [x] U2: 新建 `request_quotas` 表
- [x] U3: 新建 `packages/core/src/cost/request-quota.ts`
  - [x] U3.1: `getQuotaConfig()` / `setQuotaConfig()` — CRUD 配额配置
  - [x] U3.2: `getMonthlyUsage()` — 按 provider+tier 加权查询本月消耗
  - [x] U3.3: `checkQuota()` — 返回 QuotaStatus (ok/warn/critical/exhausted)
  - [x] U3.4: `formatQuotaWarning()` — 生成预警文本
  - [x] U3.5: `COPILOT_PREMIUM_MULTIPLIER` — Copilot 模型倍率表（0x~30x）
  - [x] U3.6: `getPremiumMultiplier()` — 按模型查询倍率
- [x] U4: `ledger.ts` — `record()` 增加 `modelTier` 参数，写入 `model_tier`
- [x] U5: `router.ts` — `routeModel()` 中注入配额检查 + 自动降级到 0x 免费模型
- [x] U6: `runner.ts` — LLM 调用完成后调用 `checkQuota()`，追加 `quotaWarning`
- [x] U7: Gateway API
  - [x] U7.1: `GET /quota` — 返回所有 provider 的配额状态
  - [x] U7.2: `PUT /quota` — 设置配额配置
  - [x] U7.3: `done` SSE 事件增加 `quotaWarning` 字段
- [x] U7.4: `copilot.ts` — 尝试捕获 `x-ratelimit-*` 响应头（诊断用）

## 前端

- [ ] U8: 设置页 → 模型 Tab — 每个 provider 增加"月度配额"输入框 + 进度条
- [ ] U9: Chat 对话 — `done` 事件解析 `quotaWarning`，渲染黄/红色提示条
- [x] U10: `/usage` 命令输出增加请求配额部分

## 测试

- [x] U11: 单元测试 `phase-U.test.ts` (22 assertions)
  - [x] U11.1: model_tier 正确填充 (premium/standard/basic)
  - [x] U11.1b: Copilot 模型倍率 (0x/0.33x/1x/3x/7.5x) — 9 个断言
  - [ ] U11.2: getMonthlyUsage 加权统计 (需要真实 DB，集成测试)
  - [ ] U11.3: checkQuota 各阈值 — 纯逻辑已覆盖
  - [x] U11.4: formatQuotaWarning 文本正确
  - [x] U11.5: 未配置配额时返回无限制
  - [ ] U11.6: 自动降级逻辑验证 (需要真实 router，集成测试)

## 完成标准

- [x] `pnpm build` 零错误
- [x] Phase U 测试全部通过 (13 assertions)
- [ ] 前端设置页可配置配额并显示进度 (U8/U9 待前端实施)
- 对话中配额预警正常显示
