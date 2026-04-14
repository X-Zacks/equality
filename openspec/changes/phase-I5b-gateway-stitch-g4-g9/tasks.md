# Tasks: Phase I.5b — G4-G9

> Status: ✅ complete | Completed: 15/16

---

## G4: Config 验证接入启动

- [x] **G4.T1** 在 `index.ts` import validateConfig + EQUALITY_CONFIG_SCHEMA
- [x] **G4.T2** 在 initSecrets() 之后调用 validateConfig，结果 warn-only

## G5: Web 搜索走 Registry

- [x] **G5.T1** 新建 `search/brave-provider.ts` 实现 WebSearchProvider 接口
- [x] **G5.T2** 新建 `search/ddg-provider.ts` 实现 WebSearchProvider 接口
- [x] **G5.T3** 在 `index.ts` 创建 WebSearchRegistry 并注册 Brave + DDG provider
- [x] **G5.T4** 在 `web-search.ts` 添加 setWebSearchRegistry + execute 优先走 registry

## G6: Bash 接入 CommandQueue

- [x] **G6.T1** 在 `bash.ts` 模块顶部创建 CommandQueue 单例
- [x] **G6.T2** 前台模式执行路径包裹 commandQueue.enqueue

## G7: Links beforeLLMCall hook

- [x] **G7.T1** 在 `index.ts` import detectLinks + fetchAndSummarize + globalHookRegistry
- [x] **G7.T2** 注册 beforeLLMCall hook 做 URL 提取 + 日志级理解

## G8: Plugin Disk Loader

- [x] **G8.T1** 新建 `plugins/loader.ts` 实现 loadFromDirectory()

## G9: Structured Logger 替换入口

- [x] **G9.T1** 在 `index.ts` 创建 gateway logger 实例（initSecrets 之后立即创建）
- [x] **G9.T2** 替换 index.ts 中全部 25 处 console.log/warn/error 为 log.info/warn/error

## 验证

- [x] **V1** tsc --noEmit 零错误 ✅
- [ ] **V2** 确认无新增 import 循环
