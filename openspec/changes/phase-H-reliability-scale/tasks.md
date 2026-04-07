# Phase H: 任务清单

## H1 — 子 Agent 孤儿恢复

- [x] T1: 编写 Delta Spec — `specs/orphan-recovery/spec.md`
- [x] T2: 修改 `tasks/types.ts` — `VALID_TRANSITIONS` 增加 `lost → queued`
- [x] T3: 新建 `tasks/orphan-recovery.ts` — `recoverOrphanTasks` + `buildResumeMessage`
- [x] T4: `scheduleOrphanRecovery()` — 延迟调度 + 指数退避重试
- [ ] T5: 修改 `index.ts` — 启动时调度孤儿恢复
- [x] T6: 测试 — ≥ 12 个断言 (实际 19)
  - T6.1: lost → queued 状态迁移
  - T6.2: 其他终止态仍不可迁移
  - T6.3: recoverOrphanTasks 恢复 subagent 跳过 cron
  - T6.4: 部分失败统计
  - T6.5: buildResumeMessage 格式
  - T6.6: 幂等保护

## H2 — SQLite 任务存储

- [x] T7: 编写 Delta Spec — `specs/sqlite-task-store/spec.md`
- [x] T8: 新建 `tasks/sqlite-store.ts` — SqliteTaskStore 实现
- [x] T9: 建表 + WAL + 索引
- [x] T10: save() — 事务内 clear + batch insert
- [x] T11: load() — SELECT * ORDER BY created_at
- [x] T12: upsert() — INSERT ON CONFLICT DO UPDATE
- [x] T13: 测试 — ≥ 12 个断言 (实际 23)
  - T13.1: 自动建表
  - T13.2: 数据往返一致性
  - T13.3: upsert 更新已有记录
  - T13.4: upsert 插入新记录
  - T13.5: save 全量替换
  - T13.6: 与 TaskRegistry 集成

## H3 — API Key 轮换

- [x] T14: 编写 Delta Spec — `specs/api-key-rotation/spec.md`
- [x] T15: 新建 `providers/key-rotation.ts` — executeWithKeyRotation
- [x] T16: dedupeKeys 去重 + 空值过滤
- [x] T17: collectProviderKeys — 环境变量收集
- [x] T18: isRateLimitError — 默认重试判断
- [x] T19: 测试 — ≥ 14 个断言 (实际 21)
  - T19.1: 首个 key 成功
  - T19.2: 首个 key 限流轮换到第二个
  - T19.3: 全部失败抛出最后错误
  - T19.4: 空 key 列表报错
  - T19.5: key 去重
  - T19.6: collectProviderKeys 多 key 收集
  - T19.7: 认证错误不重试
  - T19.8: isRateLimitError 检测

## H4 — Session Tool Result 持久化守卫

- [x] T20: 编写 Delta Spec — `specs/persist-guard/spec.md`
- [x] T21: 新建 `session/persist-guard.ts` — truncateForPersistence
- [x] T22: 只截断 role=tool 消息
- [x] T23: head+tail 策略 + 专用截断提示
- [x] T24: 总预算保护
- [x] T25: 修改 `session/persist.ts` — persist() 集成守卫
- [x] T26: 测试 — ≥ 12 个断言 (实际 16)
  - T26.1: 小消息不截断
  - T26.2: 超大 tool result 被截断
  - T26.3: 多条超大截断
  - T26.4: assistant 消息不受影响
  - T26.5: 总预算保护
  - T26.6: 截断标记存在

## 统计

- 实际总断言数：79（H1:19 + H2:23 + H3:21 + H4:16）
- tsc --noEmit：零错误 ✅
- 现有测试：272 个无回归 → 总计 343 个断言全部通过 ✅
