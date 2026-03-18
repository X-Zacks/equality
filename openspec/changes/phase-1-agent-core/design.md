# Design: Phase 1 — Agent Core Skeleton

## 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 运行时 | Node.js 22 + TypeScript | SEA 打包支持，类型安全 |
| HTTP 框架 | Fastify 4.x | 低开销，原生 TypeScript，SSE 支持好 |
| LLM SDK | openai npm 包（兼容模式）| DeepSeek/通义均支持 OpenAI 兼容 API |
| Session 持久化 | JSON 文件 + 写锁 | 简单可靠，Phase 5 升级 SQLite |
| 加密 | Windows DPAPI via `node-dpapi` | API Key 加密存储 |
| 并发控制 | 链式 Promise（无额外依赖）| 轻量，per-SessionKey 串行 |
| 包管理 | pnpm workspace | 与 desktop 包共享 monorepo |

## 目录结构

```
packages/
└── core/                         ← Agent Core 根
    ├── src/
    │   ├── index.ts              ← 入口：启动 Gateway
    │   ├── gateway/
    │   │   ├── server.ts         ← Fastify 服务器初始化和启动序列
    │   │   ├── routes.ts         ← HTTP 路由注册
    │   │   └── auth.ts           ← 本地 Token 认证
    │   ├── session/
    │   │   ├── store.ts          ← SessionStore（内存 + 磁盘）
    │   │   ├── key.ts            ← SessionKey 编解码
    │   │   ├── queue.ts          ← per-Session 并发队列
    │   │   └── persist.ts        ← JSON 文件读写（含写锁）
    │   ├── agent/
    │   │   ├── runner.ts         ← runAttempt() 主流程
    │   │   ├── stream.ts         ← Stream Decorator 管道
    │   │   └── system-prompt.ts  ← System Prompt 组装
    │   ├── providers/
    │   │   ├── types.ts          ← LLMProvider 接口定义
    │   │   ├── deepseek.ts       ← DeepSeek Provider
    │   │   ├── qwen.ts           ← 通义千问 Provider
    │   │   └── fallback.ts       ← Model Fallback 逻辑
    │   ├── cost/
    │   │   ├── ledger.ts         ← CostLedger（SQLite）
    │   │   └── pricing.ts        ← 费率表（含远程更新）
    │   └── config/
    │       ├── loader.ts         ← equality.config.yaml 解析
    │       └── secrets.ts        ← API Key DPAPI 加解密
    ├── package.json
    ├── tsconfig.json
    └── sea-config.json           ← Node.js SEA 打包配置
```

## 核心数据流

```
POST /chat/stream
    │
    ├── 认证 Token 校验
    ├── 解析 body：{ sessionKey, message }
    │
    ▼
session/queue.ts: enqueue(sessionKey, task)
    │ 等待前一个任务完成
    ▼
session/store.ts: getOrCreate(sessionKey)
    │ 从内存获取，或从磁盘加载
    ▼
agent/runner.ts: runAttempt(session, message)
    │
    ├── 构建 System Prompt（无 Skills，Phase 1 极简版）
    ├── 调用 ContextEngine.assemble()（加载历史消息）
    ├── 选择模型（Phase 1：固定用配置的 primary model）
    │
    ▼
providers/deepseek.ts: streamChat(messages)
    │
    ├── Stream Decorator 管道（wrapTrimToolCallNames / wrapCostTrace）
    │
    ▼
Fastify SSE: 边生成边推送给前端
    │
    ▼
agent/runner.ts: 完成
    │
    ├── session/persist.ts: 写入历史（加写锁）
    └── cost/ledger.ts: 写入 CostEntry
```

## Session Key 约定（Phase 1 简化版）

Phase 1 只有桌面客户端，SessionKey 固定为：
```
agent:main:desktop:default:direct:local
```

Phase 4 接入渠道后，SessionKey 按 routing/spec.md 完整规则生成。

## API Key 存储方案

```
写入时：
  Tauri 设置面板 → IPC → Rust → DPAPI.protect(apiKey) → 写入 config.enc

读取时：
  Gateway 启动 → node-dpapi.unprotect(config.enc) → 内存快照
```

`node-dpapi` 是一个调用 Windows CryptProtectData API 的原生模块。  
注意：`.node` 文件不能打包进 SEA（见 context-engine/spec.md 的架构决策），需单独存放在 `native/` 目录。

## Gateway 认证

Gateway 启动时生成随机 Token，写入 `%APPDATA%\Equality\gateway.token`。  
Tauri 读取该文件，所有 HTTP 请求带 `Authorization: Bearer <token>` 头。
