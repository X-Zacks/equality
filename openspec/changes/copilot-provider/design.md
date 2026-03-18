# Design: Copilot Provider

## 架构概览

```
                                    ┌─────────────────────────────────┐
                                    │     GitHub Copilot Backend      │
                                    │                                 │
  Settings UI                       │  github.com/login/device/code   │
  ┌────────────┐                    │  github.com/login/oauth/...     │
  │ "登录 GitHub"│─── Device Flow ──►│  api.github.com/copilot_internal│
  │  显示验证码  │                    │  api.githubcopilot.com/chat/... │
  └────────────┘                    └─────────────────────────────────┘
       │                                         ▲
       │ persist                                 │
       ▼                                         │
  ┌──────────────┐    ┌────────────────┐    ┌─────────────┐
  │ settings.json │───►│ copilot.ts     │───►│ Bearer Token│
  │ GITHUB_TOKEN  │    │ (Provider)     │    │ (~30min TTL)│
  └──────────────┘    └────────────────┘    └─────────────┘
                            │
                            │ streamChat() / chat()
                            ▼
                      ┌────────────┐
                      │ agent/runner│
                      └────────────┘
```

---

## 1. OAuth Device Flow 认证

### 1.1 流程

Copilot Provider 使用 GitHub 的 [OAuth Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)，这是为无浏览器应用（CLI/桌面）设计的标准 OAuth 授权方式。

```
Step 1: POST https://github.com/login/device/code
        Body: { client_id, scope: "read:user" }
        Response: { device_code, user_code, verification_uri, expires_in, interval }

Step 2: 向用户显示 user_code (如 "WDJB-MJHT")
        自动打开浏览器: https://github.com/login/device
        用户在浏览器中输入 user_code 并授权

Step 3: 轮询 POST https://github.com/login/oauth/access_token
        Body: {
          client_id,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        }
        等待用户完成授权:
          - "authorization_pending" → 按 interval 继续轮询
          - "slow_down" → interval += 5s，继续轮询
          - 成功 → { access_token, token_type: "bearer", scope }
          - "expired_token" → 超时，重新开始
          - "access_denied" → 用户取消
```

### 1.2 Client ID

使用 GitHub Copilot VS Code 扩展的 Client ID：

```
Iv1.b507a08c87ecfe98
```

> 这是 GitHub 官方 Copilot 扩展注册的 OAuth App Client ID，被 OpenCode / aide / coco 等多个开源项目使用。
> 若此 ID 被限制，备用方案是引导用户使用 `gh auth token` 获取 Token。

### 1.3 Scope

```
read:user
```

无需 `repo` 权限。仅需读取用户身份以验证 Copilot 订阅资格。

---

## 2. Token 管理

### 2.1 双层 Token 架构

| Token 类型 | 来源 | 有效期 | 存储位置 |
|-----------|------|--------|---------|
| GitHub OAuth Token | Device Flow 授权 | 永久（除非用户撤销） | `settings.json` (GITHUB_TOKEN) |
| Copilot Bearer Token | `api.github.com/copilot_internal/v2/token` 兑换 | ~30 min | 内存缓存（不持久化） |

### 2.2 Token 兑换

```
GET https://api.github.com/copilot_internal/v2/token
Headers:
  Authorization: Token <github_oauth_token>
  User-Agent: Equality/1.0

Response 200:
{
  "token": "tid=xxx;exp=1234567890;...",
  "expires_at": 1234567890       // Unix timestamp
}
```

### 2.3 自动刷新策略

```
发起 LLM 请求
    │
    ├── Bearer Token 在内存中？
    │       ├── 是 & 未过期（当前时间 < expires_at - 300s） → 直接使用
    │       ├── 是 & 即将过期（< 5min） → 先刷新再请求
    │       └── 否 → 兑换新 Token
    │
    ├── 兑换失败（401）→ GitHub Token 已失效，提示用户重新登录
    │
    └── LLM 请求返回 401 → 强制刷新 Bearer Token 并重试（最多 1 次）
```

### 2.4 备用 Token 来源

支持多种 GitHub Token 来源（优先级从高到低）：

1. **`settings.json` 中的 GITHUB_TOKEN**（Device Flow 写入）
2. **环境变量 `GITHUB_TOKEN`**（CI/CD 场景）
3. **GitHub CLI 配置文件**（`~/.config/gh/hosts.yml` 中的 `oauth_token`）
4. **Copilot 扩展凭据**（`~/.config/github-copilot/hosts.json` 或 `apps.json`）

```
Windows 路径:
  gh CLI:     %APPDATA%\GitHub CLI\hosts.yml
  Copilot:    %LOCALAPPDATA%\github-copilot\hosts.json
              %LOCALAPPDATA%\github-copilot\apps.json
```

---

## 3. Copilot Provider 实现

### 3.1 文件结构

```
packages/core/src/
├── providers/
│   ├── copilot.ts              ← Copilot Provider（新增）
│   ├── copilot-auth.ts         ← OAuth Device Flow + Token 管理（新增）
│   ├── base.ts                 ← OpenAI 兼容基类（复用）
│   ├── index.ts                ← 添加 copilot 到 provider 链
│   └── types.ts                ← 保持不变
├── config/
│   └── secrets.ts              ← 新增 GITHUB_TOKEN / COPILOT_MODEL
```

### 3.2 CopilotProvider 类

```typescript
// copilot.ts — 核心结构
export class CopilotProvider implements LLMProvider {
  readonly providerId = 'copilot'
  readonly modelId: string                    // e.g. "claude-sonnet-4"

  private auth: CopilotAuth                   // Token 管理器
  private baseURL = 'https://api.githubcopilot.com'

  // 必须的 HTTP Headers
  private extraHeaders = {
    'Editor-Version': 'Equality/1.0',
    'Editor-Plugin-Version': 'Equality/1.0',
    'Copilot-Integration-Id': 'vscode-chat',  // 必须，否则 API 拒绝
  }

  async streamChat(params: StreamChatParams): AsyncGenerator<ChatDelta>
  async chat(params: StreamChatParams): Promise<ChatResponse>
}
```

### 3.3 可用模型列表

所有模型费用为 $0（已含在 Copilot 订阅中）：

| API Model ID | 显示名 | 上下文窗口 | 特性 |
|-------------|--------|-----------|------|
| `claude-sonnet-4` | Claude Sonnet 4 | 128K | ✅ 推荐默认 |
| `claude-3.7-sonnet` | Claude 3.7 Sonnet | 200K | |
| `claude-3.5-sonnet` | Claude 3.5 Sonnet | 90K | |
| `gpt-4o` | GPT-4o | 128K | |
| `gpt-4.1` | GPT-4.1 | 128K | CanReason |
| `gpt-4o-mini` | GPT-4o Mini | 128K | |
| `o4-mini` | o4 Mini | 128K | CanReason |
| `o3-mini` | o3 Mini | 200K | CanReason |
| `gemini-2.5-pro` | Gemini 2.5 Pro | 128K | |
| `gemini-2.0-flash-001` | Gemini 2.0 Flash | 1M | |

> 注意：Claude Opus 4 目前可能仅限 Copilot Enterprise（非 Business），需运行时检测。
> 模型可用性取决于用户的 Copilot 订阅等级。

### 3.4 请求格式

标准 OpenAI Chat Completions 格式：

```
POST https://api.githubcopilot.com/chat/completions
Headers:
  Authorization: Bearer <copilot_bearer_token>
  Content-Type: application/json
  Editor-Version: Equality/1.0
  Editor-Plugin-Version: Equality/1.0
  Copilot-Integration-Id: vscode-chat
  User-Agent: Equality/1.0

Body:
{
  "model": "claude-sonnet-4",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false,
  "max_tokens": 16000
}

Response: 标准 OpenAI Chat Completion 格式
```

### 3.5 错误处理

| HTTP Status | 含义 | 处理 |
|-------------|------|------|
| 401 | Bearer Token 过期 | 自动刷新 → 重试（最多 1 次） |
| 403 | 无 Copilot 订阅 | 提示"需要 GitHub Copilot Business/Enterprise 订阅" |
| 429 | 速率限制 | 指数退避重试（2s, 4s, 8s），尊重 Retry-After |
| 500 | 服务端错误 | 重试最多 3 次 |

---

## 4. Config / Secrets 扩展

### 4.1 新增 Secret Keys

```typescript
const KEY_NAMES = [
  // ... 现有 keys ...
  'GITHUB_TOKEN',       // GitHub OAuth Token（Device Flow 获取）
  'COPILOT_MODEL',      // 用户选择的 Copilot 模型（默认 claude-sonnet-4）
] as const
```

### 4.2 Provider 优先级调整

```
COPILOT > CUSTOM > DeepSeek > Qwen > Volc
```

Copilot Provider 优先级最高：如果用户已登录 GitHub，默认使用 Copilot（零费用）。

---

## 5. Gateway 路由扩展

### 5.1 新增路由

```
POST /copilot/login          ← 启动 Device Flow
GET  /copilot/login/status   ← 轮询登录状态
POST /copilot/logout         ← 清除 GitHub Token
GET  /copilot/models         ← 返回可用模型列表
```

### 5.2 Device Flow 交互时序

```
UI                          Core                          GitHub
│                            │                              │
│ POST /copilot/login        │                              │
│──────────────────────────►│ POST /login/device/code       │
│                            │─────────────────────────────►│
│                            │◄─────────────────────────────│
│ { userCode, verifyUrl }    │ { device_code, user_code }   │
│◄──────────────────────────│                              │
│                            │                              │
│ [用户在浏览器输入验证码]      │                              │
│                            │                              │
│ GET /copilot/login/status  │ POST /login/oauth/access_token│
│──────────────────────────►│─────────────────────────────►│
│ { status: "pending" }      │ { error: "pending" }         │
│◄──────────────────────────│◄─────────────────────────────│
│   ... 继续轮询 ...          │                              │
│                            │                              │
│ GET /copilot/login/status  │ POST /login/oauth/access_token│
│──────────────────────────►│─────────────────────────────►│
│ { status:"ok", user:"xxx" }│ { access_token: "gho_xxx" }  │
│◄──────────────────────────│◄─────────────────────────────│
│                            │ 持久化 GITHUB_TOKEN            │
│                            │ 兑换 Copilot Bearer Token     │
```

---

## 6. 前端 UI

### 6.1 Settings 面板 — Copilot 卡片

```
┌─────────────────────────────────────────────┐
│ 🐙 GitHub Copilot                    [活跃] │
│                                             │
│  状态：✅ 已登录 (octocat)                    │
│  模型：claude-sonnet-4  [▼ 切换]             │
│  费用：$0（含在 Copilot 订阅中）              │
│                                             │
│  [退出登录]                                  │
├─────────────────────────────────────────────┤
│ 🐙 GitHub Copilot                           │
│                                             │
│  通过 GitHub Copilot 订阅免费使用              │
│  Claude / GPT / Gemini 等模型                │
│                                             │
│  [🔑 登录 GitHub]                            │
│                                             │
│  ┌─────────────────────────────────┐        │
│  │  验证码: WDJB-MJHT              │        │
│  │  请在浏览器中输入此验证码         │        │
│  │  ⏳ 等待授权中...               │        │
│  └─────────────────────────────────┘        │
└─────────────────────────────────────────────┘
```

### 6.2 Rust Proxy 扩展

`proxy.rs` 新增命令：

```rust
#[tauri::command]
async fn copilot_login() -> Result<CopilotLoginInfo, String>

#[tauri::command]
async fn copilot_login_status() -> Result<CopilotStatus, String>

#[tauri::command]
async fn copilot_logout() -> Result<(), String>

#[tauri::command]
async fn copilot_models() -> Result<Vec<CopilotModel>, String>
```

---

## 7. 安全考量

| 项目 | 策略 |
|------|------|
| GitHub Token 存储 | `settings.json`（Phase 2 升级 DPAPI） |
| Token 日志 | NEVER 在日志中打印完整 Token |
| Bearer Token | 仅内存，不持久化 |
| Client ID | 硬编码，不可配置（防止钓鱼） |
| HTTPS | 所有 GitHub / Copilot API 强制 HTTPS |
