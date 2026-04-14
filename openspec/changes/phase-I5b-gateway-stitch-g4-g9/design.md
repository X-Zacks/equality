# Design: Phase I.5b — G4-G9 技术方案

---

## G4: Config 验证接入启动

**变更文件**: `packages/core/src/index.ts`

**方案**: 在 `initSecrets()` 之后、`getWorkspaceDir()` 之前：
1. import `validateConfig` + `EQUALITY_CONFIG_SCHEMA`
2. 从 `listSecrets()` 构造 `Record<string, unknown>` 传入 `validateConfig()`
3. 遍历 result.errors 和 result.warnings 输出 console.warn

**边界**:
- `listSecrets()` 返回的是 masked 值，不能直接用。需直接从 cache 读取。
  → 改用 `hasSecret(k) ? getSecret(k) : undefined` 逐个读取。但 schema key 和 SecretKey 不完全一致（如 schema 用 `BASH_TIMEOUT` 而 secrets 用 `BASH_TIMEOUT_MS`），
  → 只验证 schema 中定义的 key，未定义的忽略，不影响现有行为。
- warn-only，不 throw，不改 initSecrets 签名。

---

## G5: Web 搜索走 Registry

**变更文件**: `packages/core/src/tools/builtins/web-search.ts`, `packages/core/src/index.ts`

**方案**:
1. 在 `web-search.ts` 中提取 `searchBrave` / `searchDuckDuckGo` 为两个 `WebSearchProvider` 实现
2. 导出 `braveProvider` 和 `ddgProvider`
3. 在 `index.ts` 创建 `WebSearchRegistry` 实例并注册两个 provider
4. 修改 `webSearchTool.execute` 内部：优先走 registry.search()，失败则 fallback 到原有直调逻辑

**边界**:
- `WebSearchProvider.isAvailable()` 检测 API key 是否存在（Brave）/ 总是返回 true（DDG）
- 输出格式完全不变（`formatResults` 不动）
- 缓存逻辑保留在 tool 层（不移入 provider）
- 原有 `process.env.BRAVE_SEARCH_API_KEY` 读取不变

**风险**: 这个改动侵入性较大，涉及 web-search.ts 内部重构。
→ 策略：先验证 tsc，再手动测试 web_search tool 仍然工作。

---

## G6: Bash 接入 CommandQueue

**变更文件**: `packages/core/src/tools/builtins/bash.ts`

**方案**: 在前台模式的 `new Promise<ToolResult>` 外层包裹 `commandQueue.enqueue()`：
1. 模块顶部创建全局 `CommandQueue` 单例（maxConcurrent=5）
2. 前台执行路径：`commandQueue.enqueue(command, cwd, executor)` 包裹
3. 后台模式不经过 queue（已由 processManager 管理）

**边界**:
- CommandQueue.enqueue 的 executor 函数需要返回 Promise<void>，但 bash 工具返回 ToolResult
  → 在 enqueue 的 resolve 回调中传递 result
- enqueue 排队超时（60s）→ 返回 `isError: true` 的 ToolResult
- 已有的 abort、超时、killTree 逻辑不变
- 只影响前台模式，后台模式 bypass

**风险**: 较低。CommandQueue 是包裹层，不修改 spawn 逻辑本身。

---

## G7: Links beforeLLMCall hook

**变更文件**: `packages/core/src/index.ts`

**方案**: 在 index.ts 启动序列末尾注册一个 beforeLLMCall hook：
1. import `globalHookRegistry` + `detectLinks` + `fetchAndSummarize`
2. `globalHookRegistry.register('beforeLLMCall', async (payload) => {...})`
3. hook 内部：从最后一条 user message 中 detectLinks → fetchAndSummarize → console.log 结果

**边界**:
- hook 异常已由 HookRegistry 隔离（catch + warn），不影响 LLM 调用
- 不修改 messages（hook 是通知型，不能修改上下文）
  → 实际上 beforeLLMCall payload 不包含 messages 引用，所以只能做旁路处理（日志/缓存）
  → 真正将 link summary 注入上下文需要在 context-engine 层做，本轮先做日志级集成
- SSRF 检查已内置于 fetchAndSummarize

---

## G8: Plugin Disk Loader

**变更文件**: 新建 `packages/core/src/plugins/loader.ts`

**方案**:
1. `loadFromDirectory(dir)` 读取 `${dir}/manifest.json`
2. 调用 `validateManifest()` 验证
3. 动态 `import(path.join(dir, manifest.entry))` 加载插件代码
4. 返回 `{ manifest, pluginExport }` 供 PluginHost 消费

**边界**:
- 路径验证：不允许 `..` 路径穿越
- import 失败 → throw，由调用方处理
- 不自动扫描目录，需要显式传入路径

---

## G9: Structured Logger 替换 index.ts 入口

**变更文件**: `packages/core/src/index.ts`

**方案**: 在 `initSecrets()` 之后创建 `const log = createLogger('gateway')`，
然后将启动阶段的 `console.log('[equality-core] ...')` 替换为 `log.info('...')`。

**边界**:
- 只替换 index.ts 顶层的启动日志（约 10 处）
- 不替换 `console.warn`（保留给异常场景的 fallback 输出）
- 不影响 runner.ts 等内部模块的日志
- `createLogger` 依赖 `EQUALITY_LOG_LEVEL` 环境变量，在 `initSecrets()` 后可用
