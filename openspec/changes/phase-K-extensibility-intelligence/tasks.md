# Phase K: 任务清单

## K1 — Plugin SDK Lite (GAP-32)

- [ ] T1: 编写 Delta Spec — `specs/plugin-sdk/spec.md`
- [ ] T2: 新建 `plugins/types.ts` — PluginManifest / PluginContext / PluginExport / PluginState 类型
- [ ] T3: `validateManifest(obj)` — manifest 验证（必填字段 + id 格式 + type 枚举）
- [ ] T4: 新建 `plugins/loader.ts` — 从磁盘读取 manifest.json + 动态 import entry
- [ ] T5: 新建 `plugins/host.ts` — PluginHost 类（load/unload/list/getPlugin）
- [ ] T6: activate 异常隔离 + error 状态处理
- [ ] T7: PLUGIN_STATES 常量导出
- [ ] T8: 测试 — ≥ 25 个断言

## K2 — Memory Embeddings + Hybrid Search (GAP-37)

- [ ] T9: 编写 Delta Spec — `specs/memory-embeddings/spec.md`
- [ ] T10: 新建 `memory/embeddings.ts` — EmbeddingProvider 接口 + 本地实现 + API fallback
- [ ] T11: `cosineSimilarity(a, b)` — 向量余弦相似度
- [ ] T12: 新建 `memory/chunking.ts` — chunkText() 文本分块（token 窗口 + 句子边界）
- [ ] T13: 修改 `memory/db.ts` — 增加 embedding BLOB 列 + searchHybrid()
- [ ] T14: 新建 `memory/hybrid-search.ts` — BM25 + cosine score fusion 逻辑
- [ ] T15: 测试 — ≥ 30 个断言

## K3 — Link Understanding (GAP-28)

- [ ] T16: 编写 Delta Spec — `specs/link-understanding/spec.md`
- [ ] T17: 新建 `links/detect.ts` — detectLinks() URL 提取 + 去重 + markdown 排除
- [ ] T18: 新建 `links/ssrf-guard.ts` — checkSSRF() 私有 IP 检测
- [ ] T19: 新建 `links/understand.ts` — fetchAndSummarize() 抓取 + 截断
- [ ] T20: beforeLLMCall hook 注册 — 自动触发链接理解
- [ ] T21: 测试 — ≥ 25 个断言

## 统计

- 预估总断言数：~80（K1:25 + K2:30 + K3:25）
- 新文件：~9 个
- 修改文件：~2 个（memory/db.ts, memory/index.ts）
