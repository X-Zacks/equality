# Delta-Spec: Phase 4 — 定时任务对现有 Spec 的影响

## 1. tools/spec.md 变更

### 新增工具：`cron`

```
cron — 管理定时任务（创建/查看/修改/删除/执行）

actions: add / list / update / remove / run / runs

schedule types:
  - cron: 标准 5-field cron 表达式
  - every: 固定间隔（毫秒）
  - at: 一次性 ISO 时间

payload types:
  - notify: 桌面系统通知
  - chat: 注入消息到会话
  - agent: 执行完整 agent turn
```

### ToolContext 扩展

```diff
 export interface ToolContext {
   workspaceDir: string
   abortSignal?: AbortSignal
   proxyUrl?: string
   env?: Record<string, string>
   provider?: LLMProvider
+  cronScheduler?: CronSchedulerRef
 }
```

### builtinTools 列表

```diff
 builtinTools = [
   readFileTool, writeFileTool, editFileTool,
   globTool, grepTool, listDirTool,
   bashTool, processTool,
   webFetchTool, webSearchTool,
   readImageTool, readPdfTool,
   applyPatchTool,
+  cronTool,        // Phase 4
 ]
```

工具总数：13 → **14**

---

## 2. session/spec.md 变更

### Session 被 cron 使用

- `chat` payload 和 `agent` payload 需要通过 `sessionStore.getOrCreate(key)` 注入消息
- cron 执行器可以在无用户交互的情况下向 session 写入消息
- session 的 `lastActiveAt` 会被 cron 触发更新

---

## 3. gateway/spec.md 变更（index.ts）

### 新增初始化逻辑

- 启动时创建 `CronScheduler` 实例并 `start()`
- 关闭时调用 `scheduler.stop()`

### 新增 SSE 端点

```
GET /events — Server-Sent Events 流，用于推送通知等实时事件
```

### 新增 HTTP API（可选）

```
GET    /cron/jobs      — 列出定时任务
POST   /cron/jobs      — 创建定时任务
DELETE /cron/jobs/:id   — 删除定时任务
```

### runAttempt 调用变更

所有 `runAttempt()` 调用需传入 `cronScheduler` 引用（通过 ToolContext 传递给 cron 工具）。

---

## 4. desktop/spec.md 变更

### 新增 Tauri 插件

- `tauri-plugin-notification`（Rust + JS）

### 新增权限

```json
"notification:default",
"notification:allow-notify",
"notification:allow-request-permission"
```

### 前端新增

- SSE 事件订阅（`EventSource` 连接 `/events`）
- 通知权限请求（首次使用时）
- 收到 `notification` 事件时调用 `sendNotification()`

---

## 5. 新增 Spec 域

### cron/spec.md（新文件）

Phase 4 引入全新 domain spec：`openspec/specs/cron/spec.md`

覆盖：
- CronJob / Schedule / Payload 类型定义
- CronStore 持久化协议
- CronScheduler 调度逻辑
- CronExecutor 执行器
- 通知传递架构（Core → SSE → Desktop → 系统通知）
