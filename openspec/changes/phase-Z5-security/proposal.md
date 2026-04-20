# Proposal: Phase Z5-security — 浏览器与 Web 工具安全加固

## 背景

当前 Equality 的 browser 和 web_search/web_fetch 工具缺乏足够的安全防护：

- **browser 工具**：无任何 URL 过滤，LLM 可访问任意网站（包括恶意网站）、执行 `javascript:` 协议、访问 `file://` 本地文件。以用户系统 Chrome `--no-sandbox` 模式启动，完全无隔离。
- **web_fetch**：仅校验 `http://https://` 前缀，无 SSRF 防护（可访问 `localhost`、`127.0.0.1`、内网 `10.x`/`192.168.x`）。
- **web_search**：通过 Brave Search API 或 DuckDuckGo，结果本身较安全，但搜索结果中的 URL 可能被 browser/web_fetch 后续访问。

### 风险场景

1. LLM 被诱导访问包含 XSS/恶意脚本的网站 → browser 工具以用户权限执行
2. web_fetch 被用于 SSRF 攻击内网服务
3. browser 工具被利用通过 `javascript:` 或 `file://` 协议读取本地文件

## 目标

- S1: URL 安全过滤 — 所有 web 类工具共享统一的 URL 验证层
- S2: SSRF 防护 — 禁止访问 localhost / 内网 IP / 非标准端口
- S3: 危险协议拦截 — 禁止 `javascript:`、`data:`、`file:`、`ftp:` 等
- S4: 操作审计日志 — browser 工具的所有导航操作记录到日志

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| URL 验证工具函数 | `packages/core/src/tools/url-validator.ts`（新建） | 小 |
| web_fetch 加固 | `packages/core/src/tools/web-fetch.ts` | 小 |
| browser 加固 | `packages/core/src/tools/browser.ts` | 中 |
| 审计日志 | `packages/core/src/tools/browser.ts` | 小 |
