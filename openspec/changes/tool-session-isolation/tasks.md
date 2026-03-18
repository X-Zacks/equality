# Tasks: Tool Session Isolation

## 1. 基础设施

- [x] 1.1 `ToolContext` 接口添加 `sessionKey?: string` 字段
  - 文件: `packages/core/src/tools/types.ts`
- [x] 1.2 `runner.ts` 构造 toolCtx 时传入 `params.sessionKey`
  - 文件: `packages/core/src/agent/runner.ts`

## 2. Browser 会话隔离 (P0)

- [x] 2.1 将全局 `_context` 单例改为 `Map<sessionKey, BrowserContext>`
  - 文件: `packages/core/src/tools/builtins/browser.ts`
- [x] 2.2 `ensureBrowser()` → 拆分为 `ensureBrowserProcess()` + `ensureContext(sessionKey)`
- [x] 2.3 所有 execute case 从 `_ctx.sessionKey` 获取 session key
- [x] 2.4 `stop` 操作改为 `closeSessionBrowser(sk)`，只关当前 session
- [x] 2.5 保留 `closeBrowser()` 全局关闭（进程退出时调用）
- [x] 2.6 `status` 返回包含 `activeSessions` 列表
- [x] 2.7 Session 删除时清理对应的 BrowserContext
  - 借鉴 OpenClaw `ensureSessionRuntimeCleanup()` → `closeTrackedBrowserTabsForSessions()`
  - 文件: `packages/core/src/index.ts`（DELETE /sessions/:key 路由中调用 `closeSessionBrowser`）

## 3. ProcessManager 会话归属 (P1)

- [x] 3.1 `BackgroundProcess` 接口添加 `sessionKey: string` 字段
  - 文件: `packages/core/src/tools/builtins/process-manager.ts`
- [x] 3.2 `processManager.spawn()` 接受并记录 `sessionKey`
- [x] 3.3 bash 工具 `background=true` 时传入 `ctx.sessionKey`
  - 文件: `packages/core/src/tools/builtins/bash.ts`
- [x] 3.4 `process list` 默认按 `sessionKey` 过滤（加 `all=true` 参数看全部）
  - 文件: `packages/core/src/tools/builtins/process-tool.ts`
- [x] 3.5 `process kill` 校验归属（不同 session 需 `force=true`）

## 4. Cron 归属标记 (P2)

- [x] 4.1 `CronJob` 接口添加 `createdBySession?: string` 字段
  - 文件: `packages/core/src/cron/types.ts`
- [x] 4.2 `cron add` 时记录 `ctx.sessionKey` 到任务
  - 文件: `packages/core/src/tools/builtins/cron.ts`
- [x] 4.3 `cron list` 展示时显示任务的来源 session

## 5. 附带修复：历史会话费用信息持久化

> 在排查过程中发现的关联问题：costLine 未持久化到 session，
> 切换历史会话时费用信息丢失。

- [x] 5.1 `Session` 类型添加 `costLines: Record<number, string>` 字段
  - 文件: `packages/core/src/session/types.ts`
- [x] 5.2 `persist.ts` / `store.ts` 读写 costLines
  - 文件: `packages/core/src/session/persist.ts`, `store.ts`
- [x] 5.3 `AfterTurnParams` 添加 `costLine?: string`
  - 文件: `packages/core/src/context/types.ts`
- [x] 5.4 `default-engine.ts` afterTurn 存 costLine 到 `session.costLines[idx]`
- [x] 5.5 `runner.ts` 调整执行顺序：先算 costLine 再调 afterTurn
- [x] 5.6 `index.ts` `/sessions/:key` API 返回时合并 costLine 到 content

## 6. 修复：停止按钮无法中止任务执行

> 排查发现：前端停止按钮只取消了 event listener，HTTP SSE 连接和 Core 的
> AbortController 都没有触发。借鉴 OpenClaw `chat-abort.ts` + `chat.abort` RPC 实现主动中止。
>
> **根因**：`abort()` 只做了取消 event listener + `setStreaming(false)`，
> Rust 的 reqwest SSE 请求仍在后台跑，Core 的 AbortController 永远不触发。
> OpenClaw 用一个独立的 `chat.abort` RPC 主动通知后端中止。

- [x] 6.1 Core: 添加 `activeAborts: Map<sessionKey, AbortController>` 注册表
  - 文件: `packages/core/src/index.ts`
- [x] 6.2 Core: `/chat/stream` 开始时注册到 `activeAborts`，结束时清理
- [x] 6.3 Core: 新请求到来时自动中止同 session 的前一个请求（`prevAbort.abort()`）
- [x] 6.4 Core: 添加 `POST /chat/abort` 端点
- [x] 6.5 Rust: 添加 `abort_chat` tauri command
  - 文件: `packages/desktop/src-tauri/src/proxy.rs`, `lib.rs`
- [x] 6.6 前端: `abort()` 回调中调用 `invoke('abort_chat', { sessionKey })`
  - 文件: `packages/desktop/src/useGateway.ts`
- [x] 6.7 前端: 追踪 `activeSessionRef` 确保 abort 知道当前 session
