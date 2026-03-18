# Proposal: Copilot Provider — 通过 GitHub Copilot 订阅使用 Claude / GPT

## 意图

为 Equality 新增 GitHub Copilot Provider，使拥有 GitHub Copilot Enterprise / Business 订阅的用户能够**免费**调用 Claude Opus 4、Claude Sonnet 4、GPT-4o 等高端模型。

## 背景

GitHub Copilot Enterprise / Business 订阅包含对多个顶级模型的访问权限，费用已含在订阅费中（$0/token）。
OpenCode 等开源项目已证明此方案可行：通过 OAuth Device Flow 获取 GitHub Token，再兑换为 Copilot Bearer Token，即可调用 `api.githubcopilot.com/chat/completions`（标准 OpenAI 兼容协议）。

**用户场景**：公司购买了 GitHub Copilot Enterprise，员工希望在 Equality 中使用 Claude Opus 4 来处理复杂任务，而不需要额外购买 Anthropic API Key。

## 做什么

1. **OAuth Device Flow 认证**：用户在 Equality 设置面板点击"登录 GitHub"，打开浏览器完成 OAuth 授权
2. **Token 管理**：持久化 GitHub OAuth Token，运行时兑换 Copilot Bearer Token（~30min 有效期），自动刷新
3. **Copilot Provider 实现**：基于 OpenAI 兼容协议，连接 `api.githubcopilot.com`
4. **模型选择**：支持 Claude Sonnet 4、Claude 3.7 Sonnet、GPT-4o、GPT-4.1、o4-mini、Gemini 2.5 Pro 等
5. **UI 登录流程**：Settings 面板新增 Copilot 卡片，展示 Device Code 和状态

## 不做什么

- ❌ 不自建 OAuth App（使用 VS Code Copilot 扩展的已知 Client ID）
- ❌ 不支持 GitHub Personal Access Token 直接输入（安全性较差）
- ❌ 不实现工具调用（Copilot API 的 tool_calls 支持留到 Phase 2）
- ❌ 不做模型降级链（用户手动选择模型）

## 成功标准

- [ ] 用户点击"登录 GitHub"，浏览器打开 GitHub Device 页面，输入 8 位验证码
- [ ] 授权完成后，Settings 面板显示"✅ 已登录"和 GitHub 用户名
- [ ] 用户在悬浮窗发送消息，收到 Claude Sonnet 4 / GPT-4o 的流式回复
- [ ] 回复末尾显示 "💰 ¥0.00 | 1,234 tokens | claude-sonnet-4"（零费用）
- [ ] 关闭 Equality 后重新打开，无需重新登录（GitHub Token 已持久化）
- [ ] Token 过期时自动刷新，用户无感知

## 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| GitHub 更改 Copilot API | Provider 失效 | 协议与 OpenCode/aide 等社区保持同步 |
| 企业禁止第三方 OAuth | 用户无法授权 | 支持手动粘贴 GitHub CLI Token |
| Bearer Token 刷新失败 | 对话中断 | 自动检测 401，重新兑换 |
| Client ID 被 GitHub 封禁 | 全部用户受影响 | 备用方案：支持 GitHub CLI `gh auth token` |
