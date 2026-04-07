# Delta Spec: Web Search Abstraction

> Phase L2 — GAP-29

## ADDED Requirements

### Requirement: WebSearchProvider 接口

系统 MUST 定义统一的 Web 搜索 provider 接口。

```typescript
interface WebSearchProvider {
  readonly id: string
  readonly name: string
  isAvailable(): boolean | Promise<boolean>
  search(query: string, options?: { count?: number; language?: string }): Promise<WebSearchResult[]>
}
```

#### Scenario: Provider 实现接口
- GIVEN 一个实现了 `WebSearchProvider` 的 Brave provider
- WHEN `provider.isAvailable()` 被调用
- THEN MUST 返回 boolean（基于 API key 是否存在）

### Requirement: 搜索注册中心

系统 MUST 提供 `WebSearchRegistry` 管理所有搜索 provider。

- `register(provider)` — 注册 provider
- `unregister(id)` — 移除 provider
- `getDefaultProvider()` — 自动选择可用 provider（按注册优先级）
- `listProviders()` — 列出所有 provider 及可用状态
- `search(query, options?)` — 通过 registry 搜索（自动选 provider）

#### Scenario: 注册和列出 providers
- GIVEN 注册了 Brave 和 DDG 两个 provider
- WHEN `listProviders()` 被调用
- THEN MUST 返回 2 个 provider 信息（包含 id、name、available）

#### Scenario: 自动选择可用 provider
- GIVEN Brave API key 未设置（unavailable），DDG 可用
- WHEN `getDefaultProvider()` 被调用
- THEN MUST 返回 DDG provider

#### Scenario: 指定 provider 搜索
- GIVEN `search(query, { providerId: 'brave' })`
- WHEN Brave 可用
- THEN MUST 使用 Brave 执行搜索

#### Scenario: 所有 provider 不可用
- GIVEN 无任何可用 provider
- WHEN `search(query)` 被调用
- THEN MUST 抛出明确错误或返回空数组

### Requirement: 内置 Provider

系统 MUST 内置以下搜索 provider：
- **Brave Search** — 需要 `BRAVE_API_KEY`
- **DuckDuckGo** — 无需 API key（HTML 抓取模式）

#### Scenario: Brave provider
- GIVEN `BRAVE_API_KEY` 已设置
- WHEN `braveProvider.isAvailable()` 被调用
- THEN MUST 返回 `true`
- WHEN `braveProvider.search('test')` 被调用
- THEN MUST 返回 `WebSearchResult[]` 包含 `title`、`url`、`snippet`

## MODIFIED Requirements

### Requirement: web_search 工具改造

现有 `web_search` 工具 MUST 改为通过 `WebSearchRegistry` 调用。
（Previously: 硬编码调用 Brave + DDG 函数）
