# Phase K 设计文档

## K1 — Plugin SDK (Lite)

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 插件格式 | 本地目录 + `manifest.json` | 桌面应用无需远程安装，与 MCP server 模式一致 |
| 加载方式 | 动态 `import()` ESM | Node.js 原生支持，无需 bundler |
| 插件类型 | provider / tool / hook 三类 | 覆盖最高频的扩展需求 |
| 隔离策略 | try-catch + timeout | 轻量级，不引入 vm2/worker_threads（桌面单机） |
| 注册中心 | `PluginHost` 单例 | 管理生命周期：load → activate → deactivate → unload |
| 安全扫描 | manifest 白名单 + 签名（v2） | v1 仅做 manifest 验证，v2 再加签名 |

### 新增文件

- `plugins/types.ts` — PluginManifest / PluginContext / PluginExport 类型
- `plugins/host.ts` — PluginHost 类（load/unload/list/getPlugin）
- `plugins/loader.ts` — 从磁盘读取 manifest + 动态 import 入口文件

### 依赖的已有模块

- `hooks/index.ts` — hook 类插件注册到 `globalHookRegistry`
- `tools/registry.ts` — tool 类插件注册到 `ToolRegistry`
- `providers/` — provider 类插件通过工厂函数模式注册

### 类型定义

```typescript
interface PluginManifest {
  id: string              // unique identifier, e.g. "equality-plugin-ollama"
  name: string            // display name
  version: string         // semver
  type: 'provider' | 'tool' | 'hook'
  entry: string           // relative path to ESM entry file
  permissions?: string[]  // requested permissions (v2)
  config?: Record<string, { type: string; default?: unknown; description?: string }>
}

interface PluginContext {
  logger: Logger                // scoped logger
  hooks: HookRegistry           // for hook-type plugins
  config: Record<string, unknown> // user-provided config values
}

interface PluginExport {
  activate(ctx: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}

type PluginState = 'loaded' | 'active' | 'error' | 'unloaded'
```

### 数据流

```
~/.equality/plugins/my-plugin/
  ├── manifest.json
  └── index.js

PluginHost.loadFromDirectory('~/.equality/plugins/')
  → 扫描子目录 → 读取 manifest.json → 验证 schema
  → import(entry) → pluginExport.activate(ctx)
  → 根据 type 注册到 HookRegistry / ToolRegistry / ProviderFactory
  → state: 'active'

PluginHost.unload('my-plugin')
  → pluginExport.deactivate()
  → 从 registry 移除
  → state: 'unloaded'
```

---

## K2 — Memory Embeddings + Hybrid Search

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Embedding 来源 | 本地计算（transformers.js）+ 可选 API fallback | 桌面应用离线优先 |
| 向量存储 | SQLite BLOB 列 + 暴力 cosine | 数据量小（<10K 条记忆），无需专用 vector DB |
| 混合搜索 | `score = α × bm25_norm + (1-α) × cosine_norm` | 简单有效，α 可调 |
| Chunking | 固定 token 窗口 + 句子边界对齐 | 平衡切分粒度与语义完整性 |
| 模型 | `all-MiniLM-L6-v2`（22MB） | 轻量、质量足够、MIT 许可 |

### 修改文件

- `memory/db.ts` — 增加 `embedding BLOB` 列、`searchHybrid()` 方法
- `memory/index.ts` — 导出新 API

### 新增文件

- `memory/embeddings.ts` — embedding 计算（本地模型 + API fallback）
- `memory/hybrid-search.ts` — 混合检索逻辑（BM25 + cosine + score fusion）
- `memory/chunking.ts` — 文本分块策略

### 类型定义

```typescript
interface EmbeddingProvider {
  embed(texts: string[]): Promise<Float32Array[]>
  readonly dimensions: number
  readonly modelId: string
}

interface HybridSearchOptions {
  query: string
  limit?: number      // default 10
  alpha?: number      // BM25 weight, default 0.5
  minScore?: number   // minimum combined score, default 0.1
}

interface HybridSearchResult {
  id: string
  text: string
  score: number       // combined score
  bm25Score: number
  cosineScore: number
  category?: string
}
```

### 数据流

```
memory.searchHybrid("TypeScript 类型系统")
  → FTS5 BM25 查询 → bm25Results[]
  → embed("TypeScript 类型系统") → queryVec
  → SQLite 全表扫描 embedding 列 → cosine(queryVec, rowVec)
  → score fusion: α × bm25_norm + (1-α) × cosine_norm
  → sort by score DESC → LIMIT
```

---

## K3 — Link Understanding

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| URL 提取 | 正则 + 过滤（去重、排除 markdown image） | 简单可靠，无需 NLP |
| SSRF 防护 | IP 解析后检查私有地址段 | 阻止 `10.x`/`172.16-31.x`/`192.168.x`/`127.x`/`::1`/`0.0.0.0` |
| 抓取实现 | 复用 `web_fetch` 的 cheerio 解析 | 不重复造轮子 |
| 摘要策略 | 截断到 2000 字符 + 前置注入 context | 不消耗 LLM token 做摘要，直接截断 |
| 触发方式 | beforeLLMCall hook 自动检测 | 透明注入，用户无感知 |
| 并发限制 | 最多 3 个 URL / 消息 | 防止单条消息触发大量抓取 |

### 新增文件

- `links/detect.ts` — URL 提取 + 去重 + markdown 过滤
- `links/ssrf-guard.ts` — SSRF 防护（私有 IP 检测）
- `links/understand.ts` — 链接理解管道（提取 → 防护 → 抓取 → 摘要 → 注入）

### 依赖的已有模块

- `tools/builtins/web-fetch.ts` — 复用 HTML 抓取逻辑
- `hooks/index.ts` — 通过 `beforeLLMCall` hook 自动触发
- `security/external-content.ts` — 复用安全包装

### 类型定义

```typescript
interface ExtractedLink {
  url: string
  source: 'user-message' | 'tool-result'
  index: number
}

interface LinkUnderstandingResult {
  url: string
  title?: string
  content: string          // truncated HTML-to-text
  fetchedAt: number
  charCount: number
  blocked?: boolean        // SSRF blocked
  blockReason?: string
}

interface SSRFCheckResult {
  safe: boolean
  reason?: string          // e.g. "private IPv4: 192.168.1.1"
  resolvedIP?: string
}
```

### 数据流

```
用户消息: "帮我看看 https://example.com/article 这篇文章"

beforeLLMCall hook 触发
  → detectLinks(message) → [{ url: "https://example.com/article", ... }]
  → ssrfGuard(url) → { safe: true }
  → fetchAndSummarize(url) → { content: "...(2000 chars)..." }
  → 注入到 messages 数组（作为 system 附加信息）
  → LLM 调用时已包含链接内容
```
