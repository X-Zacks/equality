# Proposal: CORS 收紧 + Secrets 加密存储

## 背景

对 OpenClaw 的安全调研（`OpenClaw_安全调研报告.md`）揭示了本地 AI Agent 的几类典型攻击面。
对照 OpenClaw 源码（`example/src/gateway/origin-check.ts`、`startup-auth.ts`）与 Equality 现状，
识别出两个需要修复的问题。

## 现状问题

### 问题 1：CORS 配置过宽（中等风险）

**当前代码**（`packages/core/src/index.ts`）：
```typescript
await app.register(cors, { origin: true, ... })
```

`origin: true` 会将请求的 Origin 原样镜像回去，即**接受任意网页的跨域请求**。

虽然 Gateway 绑定在 `localhost`，但攻击场景仍然存在：
- 用户访问了一个被 XSS 污染的网页（或恶意广告）
- 该网页向 `http://localhost:18790/chat/stream` 发 POST 请求
- 携带用户 session，触发 `bash`、`read_file`、`write_file` 等工具调用
- 整个过程对用户无感知

OpenClaw 对此有专门的 `checkBrowserOrigin()` 防护，Equality 没有。

### 问题 2：API Key 明文存储（低-中风险）

**当前方案**：所有 API Key 存储在 `%APPDATA%\Equality\settings.json`，纯文本 JSON。

风险：
- 任何能读该用户目录的进程（恶意软件、同账号其他程序）都能拿走全部 Key
- `settings.json` 可能被意外上传（截图、日志、备份）

Windows 提供了 **DPAPI（Data Protection API）**，使用当前用户的系统密钥加密，
其他用户账号和进程无法解密，且不需要用户管理额外密码。

**注**：OpenClaw 也存在相同的明文存储问题（`~/.openclaw/` 下的配置文件）。

## 不受影响的 OpenClaw CVE

以下 CVE 对 Equality **不适用**，记录在案避免误判：

| CVE / 漏洞 | 不适用原因 |
|-----------|-----------|
| CVE-2026-25253（WebSocket 劫持） | Equality 无 WebSocket 服务 |
| CVE-2026-24763/25157/25475（命令注入） | 攻击路径需公网入口，Equality 无公网暴露 |
| CVE-2026-26322（SSRF 写文件） | 无多租户、无 `system.run` 沙箱逃逸路径 |
| ClawJacked（跨域劫持 + 暴力破解） | 无 WebSocket，无 Dashboard |
| 全网暴露（0.0.0.0） | `HOST = 'localhost'`，仅本机 |
| Dashboard Token 泄露到 URL | 无 Dashboard，无 URL Token |

## 范围

本变更仅处理两个最小必要修复，不引入新的依赖或架构变化：

1. **CORS Origin 白名单**：只允许 Tauri WebView 的 origin 和 null-origin（本机直接请求）
2. **Secrets DPAPI 加密**：使用 `node-dpapi` 对 `settings.json` 的值加密存储（Windows Only）

## 优先级

| 问题 | 优先级 | 理由 |
|------|-------|------|
| CORS 收紧 | **高** | 一行代码改动，风险立即消除 |
| DPAPI 加密 | 中 | 需要引入依赖，需在 SEA 构建中验证兼容性 |
