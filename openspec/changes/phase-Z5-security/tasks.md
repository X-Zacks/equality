# Tasks: Phase Z5-security

## S1: URL 验证层

- [ ] 1.1 新建 `url-validator.ts`：协议过滤 + SSRF 防护 + 内网 IP 拦截
- [ ] 1.2 单元测试：覆盖 `javascript:`、`file:`、`localhost`、`192.168.x` 等场景

## S2: web_fetch 加固

- [ ] 2.1 `web-fetch.ts`: execute() 入口调用 validateUrl()
- [ ] 2.2 验证：`web_fetch http://localhost:3000` 应被拦截

## S3: browser 加固

- [ ] 3.1 `browser.ts`: navigate action 调用 validateUrl()
- [ ] 3.2 验证：`browser navigate javascript:alert(1)` 应被拦截

## S4: 审计日志

- [ ] 4.1 `browser.ts`: 每次 navigate/click/type 输出审计日志
