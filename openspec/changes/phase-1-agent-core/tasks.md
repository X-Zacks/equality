# Tasks: Phase 1 — Agent Core Skeleton

## 前置条件
- Phase 0 完成，`packages/core/` 骨架已创建（stub 版本）
- pnpm monorepo 已配置

---

## 1. Session 模块

- [ ] 1.1 实现 `session/key.ts`：SessionKey 编码 / 解码函数
- [ ] 1.2 实现 `session/store.ts`：InMemorySessionStore（`getOrCreate` / `cancel` / `reap`）
  - maxSessions = 5000，idleTtlMs = 86,400,000
  - 每 5 分钟自动调用 `reap()`
- [ ] 1.3 实现 `session/persist.ts`：Session JSON 文件读写
  - 路径：`%APPDATA%\Equality\sessions\<urlencoded-key>.json`
  - 原子写（先写临时文件，再 rename）
  - per-Session Mutex 写锁（`async-mutex` 包）
- [ ] 1.4 实现 `session/queue.ts`：per-SessionKey 链式 Promise 队列
- [ ] 1.5 实现 Session 文件的孤立 user 消息检测与修复

## 2. LLM Provider 模块

- [ ] 2.1 定义 `providers/types.ts`：`LLMProvider` 接口 + `TokenUsage` + `ProviderCapabilities`
- [ ] 2.2 实现 `providers/deepseek.ts`：DeepSeek V3 / R1 Provider
  - 使用 `openai` npm 包，baseURL = `https://api.deepseek.com/v1`
  - 支持 `streamChat()` 和 `chat()`
  - 从 stream 提取 `usage`（含 `prompt_tokens` / `completion_tokens`）
- [ ] 2.3 实现 `providers/qwen.ts`：通义千问 Provider
  - baseURL = `https://dashscope.aliyuncs.com/compatible-mode/v1`
- [ ] 2.4 实现 `providers/fallback.ts`：Model Fallback 逻辑
  - 区分 AbortError（不降级）和其他错误（降级）
  - 区分 API Key 无效（不重试）和限流（等待重试）

## 3. Agent Runner 模块

- [ ] 3.1 实现 `agent/system-prompt.ts`：构建极简 System Prompt（Phase 1 无 Skills）
  - 包含：当前时间、操作系统信息、基础行为指引
- [ ] 3.2 实现 `agent/stream.ts`：Stream Decorator 管道框架
  - 实现 `wrapTrimToolCallNames`
  - 实现 `wrapDropThinkingBlocks`（检测 DeepSeek-R1 的 `<think>` 块）
  - 实现 `wrapCostTrace`（统计 token 并写入 CostLedger）
- [ ] 3.3 实现 `agent/runner.ts`：`runAttempt()` 主流程
  - 无工具调用循环（Phase 1 不支持 Tools）
  - 单次 LLM 调用 → 流式返回 → 写 Session → 写 CostEntry
  - 支持 AbortSignal

## 4. 成本模块

- [ ] 4.1 实现 `cost/pricing.ts`：费率表（内置兜底，支持从文件加载覆盖）
- [ ] 4.2 实现 `cost/ledger.ts`：CostLedger
  - 使用 `better-sqlite3` 写入 `cost-ledger.db`
  - `.node` 文件存放在 `native/` 目录（不打包进 SEA）
  - 实现 `recordEntry()` / `getTodaySummary()` 基础方法
- [ ] 4.3 在 `runAttempt()` 完成后，回复末尾追加成本摘要（可通过配置关闭）

## 5. 配置与 Secrets

- [ ] 5.1 定义 `equality.config.yaml` schema（使用 zod 验证）
  - `llm.providers`：各 Provider 的 API Key（引用名，不含实际值）
  - `routing.primary`：默认主模型
  - `routing.fallback`：备用模型列表
  - `limits.dailyBudgetCny`：每日预算
- [ ] 5.2 实现 `config/secrets.ts`：DPAPI 加解密
  - 使用 `node-dpapi` 包（原生模块，放 `native/`）
  - `encryptApiKey(key)` / `decryptApiKeys()`
- [ ] 5.3 Gateway 启动时生成随机 auth token，写入 `gateway.token`

## 6. Gateway HTTP 服务

- [ ] 6.1 实现 `gateway/auth.ts`：Bearer Token 认证中间件
- [ ] 6.2 实现 `gateway/routes.ts`：注册所有路由
  - `GET /health`
  - `POST /chat/stream`（SSE）
  - `DELETE /chat/:sessionKey`（取消运行）
  - `GET /sessions`
  - `GET /cost/today`
- [ ] 6.3 实现 `gateway/server.ts`：按启动序列初始化（见 gateway/spec.md）
- [ ] 6.4 SSE 实现：正确设置 `Content-Type: text/event-stream`，支持 heartbeat（每 15s 发送注释行）

## 7. Tauri 侧集成（desktop 包）

- [ ] 7.1 在 `useGateway.ts` 实现真实的 SSE 连接（替换 Mock）
- [ ] 7.2 流式文本：每个 delta 追加到对话气泡，滚动到底部
- [ ] 7.3 实现 `Settings.tsx` 设置面板：API Key 输入框 + 保存按钮
  - 保存时：Tauri IPC → Rust DPAPI 加密 → 写磁盘 → 调用 Gateway `/config/reload`
- [ ] 7.4 悬浮窗展示成本摘要（回复末尾的 "💰 ¥xxx" 行）
- [ ] 7.5 实现停止按钮：点击时 `DELETE /chat/:sessionKey`

## 8. 打包与验收

- [ ] 8.1 更新 SEA 构建脚本，将 `equality-core.exe` 替换为真实 Agent Core
- [ ] 8.2 构建安装包（`pnpm run build:installer`），确认包含 `native/` 目录
- [ ] 8.3 验收：在悬浮窗输入 "你好"，看到 DeepSeek V3 的流式回复
- [ ] 8.4 验收：重启应用，历史对话仍然存在
- [ ] 8.5 验收：输入错误 API Key，看到"API Key 无效"提示
- [ ] 8.6 验收：回复末尾显示 "💰 ¥0.000x | x,xxx tokens"
