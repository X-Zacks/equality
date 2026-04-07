# Phase L: 任务清单

## L1 — Config Schema Validation (GAP-33)

- [x] T1: 编写 Delta Spec — `specs/config-validation/spec.md`
- [x] T2: 新建 `config/schema.ts` — ConfigFieldType / ConfigFieldSchema / ConfigSchema 类型 + EQUALITY_CONFIG_SCHEMA 定义
- [x] T3: 新建 `config/validate.ts` — validateConfig() 类型检查 + 必填检查 + 默认值填充
- [x] T4: 新建 `config/migrate.ts` — ConfigMigration 类型 + migrateConfig() 按版本顺序迁移
- [ ] T5: 修改 `config/secrets.ts` — 启动时调用 validateConfig()（v2）
- [x] T6: 测试 — 26 个断言 ✅

## L2 — Web Search Abstraction (GAP-29)

- [x] T7: 编写 Delta Spec — `specs/web-search-abstraction/spec.md`
- [x] T8: 新建 `search/types.ts` — WebSearchProvider / WebSearchResult 接口
- [x] T9: 新建 `search/registry.ts` — WebSearchRegistry 类（register/unregister/getDefault/search）
- [ ] T10: 新建 `search/providers/brave.ts` — 从 web-search.ts 提取 Brave 实现（v2）
- [ ] T11: 新建 `search/providers/duckduckgo.ts` — 从 web-search.ts 提取 DDG 实现（v2）
- [ ] T12: 修改 `tools/builtins/web-search.ts` — 改为通过 Registry 调用（v2）
- [x] T13: 测试 — 13 个断言 ✅

## L3 — Process Supervision (GAP-34)

- [x] T14: 编写 Delta Spec — `specs/process-supervision/spec.md`
- [x] T15: 新建 `process/command-queue.ts` — CommandQueue 类（enqueue/getStatus/drain/kill）
- [x] T16: 新建 `process/kill-tree.ts` — killProcessTree() 跨平台实现
- [ ] T17: 修改 `tools/bash-sandbox.ts` — 通过 CommandQueue 限制并发（v2）
- [x] T18: 测试 — 12 个断言 ✅

## 统计

- 实际总断言数：69（L1:26 + L2:13 + L3:12 + isProcessAlive:2）
- 新文件：7 个
- 修改文件：0 个（v2 任务推迟）
