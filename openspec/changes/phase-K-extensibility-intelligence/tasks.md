# Phase K: 任务清单

## K1 — Plugin SDK Lite (GAP-32)

- [x] T1: 编写 Delta Spec — `specs/plugin-sdk/spec.md`
- [x] T2: 新建 `plugins/types.ts` — PluginManifest / PluginContext / PluginExport / PluginState 类型
- [x] T3: `validateManifest(obj)` — manifest 验证（必填字段 + id 格式 + type 枚举）
- [ ] T4: 新建 `plugins/loader.ts` — 从磁盘读取 manifest.json + 动态 import entry（v2）
- [x] T5: 新建 `plugins/host.ts` — PluginHost 类（load/unload/list/getPlugin）
- [x] T6: activate 异常隔离 + error 状态处理
- [x] T7: PLUGIN_STATES 常量导出
- [x] T8: 测试 — 26 个断言 ✅

## K2 — Memory Embeddings + Hybrid Search (GAP-37)

- [x] T9: 编写 Delta Spec — `specs/memory-embeddings/spec.md`
- [x] T10: 新建 `memory/embeddings.ts` — EmbeddingProvider 接口 + 本地实现
- [x] T11: `cosineSimilarity(a, b)` — 向量余弦相似度
- [x] T12: 新建 `memory/chunking.ts` — chunkText() 文本分块（token 窗口 + 句子边界）
- [ ] T13: 修改 `memory/db.ts` — 增加 embedding BLOB 列 + searchHybrid()（v2）
- [x] T14: 新建 `memory/hybrid-search.ts` — BM25 + cosine score fusion 逻辑
- [x] T15: 测试 — 25 个断言 ✅

## K3 — Link Understanding (GAP-28)

- [x] T16: 编写 Delta Spec — `specs/link-understanding/spec.md`
- [x] T17: 新建 `links/detect.ts` — detectLinks() URL 提取 + 去重 + markdown 排除
- [x] T18: 新建 `links/ssrf-guard.ts` — checkSSRF() 私有 IP 检测
- [x] T19: 新建 `links/understand.ts` — fetchAndSummarize() 抓取 + 截断
- [ ] T20: beforeLLMCall hook 注册 — 自动触发链接理解（v2）
- [x] T21: 测试 — 31 个断言 ✅

## 统计

- 实际总断言数：82（K1:26 + K2:25 + K3:31）
- 新文件：7 个（types, host, embeddings, chunking, hybrid-search, detect, ssrf-guard, understand）
- 修改文件：0 个（v2 任务推迟）
