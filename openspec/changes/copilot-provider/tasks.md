# Tasks: Copilot Provider

## 1. OAuth Device Flow 认证模块

- [ ] 1.1 创建 `packages/core/src/providers/copilot-auth.ts`
- [ ] 1.2 实现 `startDeviceFlow()` → POST `github.com/login/device/code`，返回 `{ userCode, verificationUri, deviceCode, expiresIn, interval }`
- [ ] 1.3 实现 `pollForToken(deviceCode, interval)` → 轮询 `github.com/login/oauth/access_token`，处理 `authorization_pending` / `slow_down` / `expired_token` / `access_denied`
- [ ] 1.4 实现 `exchangeBearerToken(githubToken)` → GET `api.github.com/copilot_internal/v2/token`，返回 `{ token, expiresAt }`
- [ ] 1.5 实现 Bearer Token 内存缓存 + 自动刷新（过期前 5min 自动刷新）
- [ ] 1.6 实现 `loadGitHubToken()` 多源查找：settings.json → 环境变量 → gh CLI hosts.yml → copilot hosts.json
- [ ] 1.7 实现 `getValidBearerToken()` 统一入口：自动处理缓存/过期/兑换

## 2. Copilot Provider 实现

- [ ] 2.1 创建 `packages/core/src/providers/copilot.ts`
- [ ] 2.2 实现 `CopilotProvider extends OpenAICompatProvider` 或独立实现（基于 base.ts 的 _post 模式）
- [ ] 2.3 覆写认证头：`Authorization: Bearer <copilot_token>` + Copilot 专有 Headers
- [ ] 2.4 实现 `chat()` 方法：非流式调用 `api.githubcopilot.com/chat/completions`
- [ ] 2.5 实现 `streamChat()` 方法：流式调用（或 simulateStream）
- [ ] 2.6 实现 401 自动刷新：捕获 401 → 重新兑换 Bearer Token → 重试请求
- [ ] 2.7 实现 429 指数退避重试：尊重 `Retry-After` Header

## 3. Config / Secrets 扩展

- [ ] 3.1 `secrets.ts` KEY_NAMES 新增 `GITHUB_TOKEN` 和 `COPILOT_MODEL`
- [ ] 3.2 `providers/index.ts` 新增 `createCopilotProvider()` 工厂函数
- [ ] 3.3 `providers/index.ts` getDefaultProvider 优先级：copilot > custom > deepseek > qwen > volc
- [ ] 3.4 Cost ledger 费率表新增 copilot/* 模型（费率均为 ¥0）

## 4. Gateway 路由

- [ ] 4.1 `POST /copilot/login` → 调用 `startDeviceFlow()`，返回 userCode + verificationUri
- [ ] 4.2 `GET /copilot/login/status` → 调用 `pollForToken()`，返回登录状态（pending/ok/error）
- [ ] 4.3 `POST /copilot/logout` → 清除 GITHUB_TOKEN（内存 + 文件）
- [ ] 4.4 `GET /copilot/models` → 返回可用模型列表

## 5. Rust Proxy 扩展

- [ ] 5.1 `proxy.rs` 新增 `copilot_login` 命令 → POST Core `/copilot/login`
- [ ] 5.2 `proxy.rs` 新增 `copilot_login_status` 命令 → GET Core `/copilot/login/status`
- [ ] 5.3 `proxy.rs` 新增 `copilot_logout` 命令 → POST Core `/copilot/logout`
- [ ] 5.4 `proxy.rs` 新增 `copilot_models` 命令 → GET Core `/copilot/models`
- [ ] 5.5 `lib.rs` 注册新增命令

## 6. 前端 UI

- [ ] 6.1 `useGateway.ts` 新增 `copilotLogin()`, `copilotLoginStatus()`, `copilotLogout()`, `copilotModels()`
- [ ] 6.2 `Settings.tsx` 新增 Copilot 卡片：未登录状态 → "登录 GitHub" 按钮
- [ ] 6.3 点击登录 → 调用 copilotLogin → 显示 userCode + "等待授权" 状态
- [ ] 6.4 轮询 copilotLoginStatus → 成功后显示 "✅ 已登录" + GitHub 用户名
- [ ] 6.5 模型选择下拉框：从 copilotModels() 获取列表
- [ ] 6.6 退出登录按钮 → copilotLogout()

## 7. 验收测试

- [ ] 7.1 启动 Equality，进入设置面板，看到 Copilot 卡片（未登录状态）
- [ ] 7.2 点击"登录 GitHub"，浏览器自动打开 github.com/login/device
- [ ] 7.3 设置面板显示 8 位验证码和"等待授权"状态
- [ ] 7.4 在浏览器输入验证码，授权完成后设置面板显示"✅ 已登录"
- [ ] 7.5 发送聊天消息，收到 Claude Sonnet 4 回复（或配置的 Copilot 模型）
- [ ] 7.6 回复末尾显示 "💰 ¥0.00 | xxx tokens | claude-sonnet-4"
- [ ] 7.7 重启 Equality，无需重新登录
- [ ] 7.8 点击"退出登录"，状态恢复为未登录
