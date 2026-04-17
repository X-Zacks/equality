# Phase U: 请求配额 — 实施任务

## 后端

- [ ] U1: `cost_entries` 表增加 `model_tier` 列 + 历史数据回填迁移
- [ ] U2: 新建 `request_quotas` 表
- [ ] U3: 新建 `packages/core/src/cost/request-quota.ts`
  - [ ] U3.1: `getQuotaConfig()` / `setQuotaConfig()` — CRUD 配额配置
  - [ ] U3.2: `getMonthlyUsage()` — 按 provider+tier 查询本月 COUNT(*)
  - [ ] U3.3: `checkQuota()` — 返回 QuotaStatus (ok/warn/critical/exhausted)
  - [ ] U3.4: `formatQuotaWarning()` — 生成预警文本
- [ ] U4: `ledger.ts` — `record()` 增加 `modelTier` 参数，写入 `model_tier`
- [ ] U5: `router.ts` — `routeModel()` 中注入配额检查 + 自动降级逻辑
- [ ] U6: `runner.ts` — LLM 调用完成后调用 `checkQuota()`，追加 `quotaWarning`
- [ ] U7: Gateway API
  - [ ] U7.1: `GET /quota` — 返回所有 provider 的配额状态
  - [ ] U7.2: `PUT /quota` — 设置配额配置
  - [ ] U7.3: `done` SSE 事件增加 `quotaWarning` 字段

## 前端

- [ ] U8: 设置页 → 模型 Tab — 每个 provider 增加"月度配额"输入框 + 进度条
- [ ] U9: Chat 对话 — `done` 事件解析 `quotaWarning`，渲染黄/红色提示条
- [ ] U10: `/usage` 命令输出增加请求配额部分

## 测试

- [ ] U11: 单元测试 `phase-U.test.ts`
  - [ ] U11.1: model_tier 正确填充 (premium/standard/basic)
  - [ ] U11.2: getMonthlyUsage 正确统计本月请求数
  - [ ] U11.3: checkQuota 各阈值 (ok/warn/critical/exhausted) 判定
  - [ ] U11.4: formatQuotaWarning 文本正确
  - [ ] U11.5: 未配置配额时返回无限制
  - [ ] U11.6: 自动降级逻辑验证

## 完成标准

- `pnpm build` 零错误
- Phase U 测试全部通过
- 前端设置页可配置配额并显示进度
- 对话中配额预警正常显示
