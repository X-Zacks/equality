# Delta Spec: Link Understanding

> Phase K3 — GAP-28

## ADDED Requirements

### Requirement: URL 自动提取

系统 MUST 从用户消息中自动提取 URL。

- 支持 `http://` 和 `https://` 协议
- MUST 去重（同一消息中相同 URL 只保留一个）
- MUST 排除 markdown 图片语法中的 URL（`![alt](url)` 的 url 不提取）
- 每条消息最多提取 3 个 URL（防止滥用）

#### Scenario: 提取用户消息中的链接
- GIVEN 用户消息 "帮我看看 https://example.com/article 和 https://docs.rs/tokio"
- WHEN `detectLinks(message)` 被调用
- THEN MUST 返回 2 个 `ExtractedLink` 对象
- AND 每个包含 `url` 和 `source: 'user-message'`

#### Scenario: 排除 markdown 图片
- GIVEN 用户消息 "看这张图 ![screenshot](https://img.com/1.png)"
- WHEN `detectLinks(message)` 被调用
- THEN `https://img.com/1.png` MUST NOT 被提取

#### Scenario: URL 去重
- GIVEN 用户消息包含同一 URL 两次
- WHEN `detectLinks(message)` 被调用
- THEN 该 URL MUST 只出现一次

#### Scenario: 超过 3 个 URL
- GIVEN 用户消息包含 5 个不同 URL
- WHEN `detectLinks(message)` 被调用
- THEN MUST 只返回前 3 个

### Requirement: SSRF 防护

系统 MUST 在抓取 URL 前检查目标地址，阻止内网访问。

被阻止的地址段：
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `127.0.0.0/8`（含 `localhost`）
- `::1`、`0.0.0.0`
- `169.254.0.0/16`（链路本地）

#### Scenario: 安全的公网 URL
- GIVEN URL `https://example.com`（解析到公网 IP）
- WHEN `checkSSRF(url)` 被调用
- THEN MUST 返回 `{ safe: true }`

#### Scenario: 内网 IP 被阻止
- GIVEN URL `http://192.168.1.1/admin`
- WHEN `checkSSRF(url)` 被调用
- THEN MUST 返回 `{ safe: false, reason: 'private IPv4: 192.168.1.1' }`

#### Scenario: localhost 被阻止
- GIVEN URL `http://localhost:3000/api`
- WHEN `checkSSRF(url)` 被调用
- THEN MUST 返回 `{ safe: false, reason: 'loopback address' }`

### Requirement: 链接内容抓取与摘要

系统 MUST 抓取安全 URL 的网页内容并截断为摘要。

- 复用 `web_fetch` 的 cheerio HTML 解析逻辑
- 内容截断到 2000 字符
- 抓取超时 MUST 为 10 秒
- 抓取失败 MUST NOT 阻止 LLM 调用（静默降级）

#### Scenario: 成功抓取
- GIVEN 安全的公网 URL
- WHEN `fetchAndSummarize(url)` 被调用
- THEN MUST 返回 `LinkUnderstandingResult` 包含 `title`、`content`（≤2000字符）、`fetchedAt`

#### Scenario: 抓取超时
- GIVEN URL 响应超过 10 秒
- WHEN `fetchAndSummarize(url)` 被调用
- THEN MUST 返回 `null`（静默降级）
- AND MUST NOT 抛出异常

### Requirement: 自动注入 Context

- 链接理解 MUST 通过 `beforeLLMCall` hook 自动触发
- 抓取到的内容 MUST 作为附加信息注入 messages
- 注入格式：`[Link: {url}]\n{content}`

#### Scenario: hook 自动触发
- GIVEN 用户消息包含 URL
- WHEN `beforeLLMCall` hook 触发
- THEN URL 自动被提取和抓取
- AND 内容被注入到 LLM 的 messages 中

#### Scenario: SSRF 被阻止的 URL 不注入
- GIVEN 用户消息包含内网 URL
- WHEN hook 触发
- THEN 该 URL MUST 被跳过
- AND warn 日志 MUST 记录阻止原因
