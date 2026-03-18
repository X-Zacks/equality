# Delta Spec: Gateway 安全加固

> 基于 `openspec/specs/gateway/spec.md`  
> 变更：`cors-and-secrets-hardening`

---

## ADDED Requirements

### Requirement: CORS Origin 白名单

Gateway HTTP 服务 MUST 只接受来自以下 Origin 的跨域请求：

- `tauri://localhost`（Tauri WebView，macOS/Linux）
- `https://tauri.localhost`（Tauri WebView，Windows）
- `null`（本机直接发起的请求，无 Origin 头）
- `http://localhost:*` 或 `http://127.0.0.1:*`（开发模式 Vite 热更新）

所有其他 Origin MUST 被拒绝，返回 HTTP 403。

#### Scenario: Tauri WebView 发起请求
- GIVEN 用户在 Equality 界面发送消息
- WHEN WebView 向 `http://localhost:18790/chat/stream` 发 POST 请求
- AND Origin 头为 `https://tauri.localhost`
- THEN Gateway SHALL 接受请求，正常处理

#### Scenario: 外部网页尝试请求
- GIVEN 用户浏览器打开了一个恶意网页
- WHEN 该网页向 `http://localhost:18790/chat/stream` 发跨域请求
- AND Origin 头为 `https://malicious.example.com`
- THEN Gateway SHALL 拒绝该请求，返回 403
- AND 不执行任何工具调用

#### Scenario: 开发模式（Vite dev server）
- GIVEN 开发者以 `pnpm dev` 启动
- WHEN Vite dev server（`http://localhost:1420`）发起请求
- THEN Gateway SHALL 接受该请求（开发模式白名单）

---

### Requirement: Secrets 存储安全级别标记

Gateway 的配置存储 MUST 标记当前加密级别，供 UI 展示：

- `plaintext`：明文 JSON（当前默认）
- `dpapi`：Windows DPAPI 加密（Phase 2 实现）

`/settings` 接口返回的响应 SHOULD 包含 `storageMode` 字段，
供前端在"关于"页展示"🔒 加密存储 / ⚠️ 明文存储"状态。

#### Scenario: Windows DPAPI 可用时
- GIVEN Windows 系统且 `node-dpapi` 模块可加载
- WHEN 用户保存 API Key
- THEN Gateway SHALL 使用 DPAPI 加密后写入 `settings.json`
- AND `/settings` 响应包含 `"storageMode": "dpapi"`

#### Scenario: 非 Windows 或 DPAPI 不可用时
- GIVEN macOS/Linux 系统，或 `node-dpapi` 加载失败
- WHEN 用户保存 API Key
- THEN Gateway SHALL fallback 至明文存储
- AND `/settings` 响应包含 `"storageMode": "plaintext"`
- AND 前端"关于"页显示警告 ⚠️

---

## MODIFIED Requirements

### Requirement: HTTP API 接口（修改）

> 原始需求见 `openspec/specs/gateway/spec.md` — HTTP API 接口

原文：
> 所有接口 MUST 要求本地认证 Token（启动时生成，写入 `%APPDATA%\Equality\gateway.token`）。

**现状说明**：当前实现未包含 Token 鉴权（依赖 CORS + localhost 绑定作为防线）。
本次变更收紧 CORS，可作为临时等价替代。Token 鉴权列入后续 Phase。

**修改为**：
> 所有接口 MUST 通过 CORS Origin 白名单过滤非受信来源。  
> 本机 Token 鉴权（Bearer Token）列为 Phase 2 实现。

---

## 不变部分（仅为说明）

以下 Gateway spec 要求不受本次变更影响：

- 绑定地址 `127.0.0.1:18790` —— 保持不变
- 启动序列 —— 保持不变
- 配置热更新 —— 保持不变
