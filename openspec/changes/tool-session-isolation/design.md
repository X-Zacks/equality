# Design: Tool Session Isolation

## OpenClaw 参考研究

OpenClaw 在 `example/src/` 中使用了与我们不同但互补的架构来解决同类问题。关键发现：

### OpenClaw 的浏览器隔离：Profile + Session-Tab-Registry

OpenClaw 不直接用 Playwright，而是通过 **CDP (Chrome DevTools Protocol)** 控制浏览器，
采用两层隔离机制：

**1) Profile 机制**（`browser/config.ts`, `browser/profiles.ts`）
- 每个 Profile 是一个独立的 Chrome 实例（不同 CDP 端口，18800-18899 范围）
- `BrowserServerState.profiles = Map<string, ProfileRuntimeState>`
- 支持两种 driver：`"openclaw"`（自管理浏览器）和 `"extension"`（Chrome 插件接管）
- Profile 之间是进程级隔离（不同 Chrome 实例）

**2) Session-Tab-Registry**（`browser/session-tab-registry.ts`）
- 全局 `Map<sessionKey, Map<trackedId, TrackedTab>>` 追踪每个 session 打开了哪些标签页
- `trackSessionBrowserTab({ sessionKey, targetId, baseUrl, profile })` — 打开标签时注册
- `untrackSessionBrowserTab(...)` — 关闭标签时注销
- `closeTrackedBrowserTabsForSessions({ sessionKeys })` — session 清理时批量关闭归属标签

**3) 工具创建时注入 sessionKey**（`agents/openclaw-tools.ts`）
```typescript
createBrowserTool({
  sandboxBridgeUrl: options?.sandboxBrowserBridgeUrl,
  allowHostControl: options?.allowHostBrowserControl,
  agentSessionKey: options?.agentSessionKey,  // ← 工厂函数闭包捕获
})
```
注意：OpenClaw 用工厂函数 `createBrowserTool(opts)` 返回带闭包的工具实例，
sessionKey 通过闭包而非 ToolContext 传递。

### OpenClaw 的 Cron 隔离

- `createCronTool({ agentSessionKey })` — 同样工厂函数注入
- `cron add` 时自动推断 `agentId` 和 `sessionKey` 写入 job
- 通过 Gateway RPC 操作，不直接操作全局数据

### OpenClaw vs 我们的架构差异

| 维度 | OpenClaw | Equality |
|------|----------|----------|
| 浏览器驱动 | CDP 协议 + HTTP 控制服务器 | Playwright 直接驱动 |
| 隔离粒度 | Profile（进程级）+ Tab Registry（标签级） | BrowserContext（上下文级） |
| SessionKey 传递 | 工厂函数闭包 | ToolContext.sessionKey |
| 进程模型 | 多 Chrome 进程（每 Profile 一个） | 单 Chrome 进程 + 多 Context |
| Cron 隔离 | Gateway RPC + sessionKey 归属 | 本地调度 + 全局共享 |
| Process 管理 | 外部 sandbox（Docker/Podman）| 内置 ProcessManager 单例 |

### 从 OpenClaw 借鉴的设计决策

1. **Tab Registry 模式值得采纳**：即使用 BrowserContext 隔离，也应追踪 session→tabs 关系，
   用于 session 删除时清理资源。我们目前 `closeSessionBrowser(sk)` 直接关 context，
   已经隐含了这个效果，但缺少精细的标签级追踪。

2. **工厂函数 vs ToolContext**：OpenClaw 用闭包注入 sessionKey，我们用 ToolContext 字段。
   两种方案各有优劣：闭包更解耦但每次需要 new 工具实例；ToolContext 更简单但需改接口。
   **决策：保持 ToolContext 方案**（我们的工具是单例注册，不像 OpenClaw 每次请求创建）。

3. **Session 清理时关闭浏览器标签**：OpenClaw 的 `ensureSessionRuntimeCleanup()` 会调用
   `closeTrackedBrowserTabsForSessions()`。我们也应该在 session 删除时清理对应的 browser context。

---

## 技术方案

### 1. ToolContext 扩展

```typescript
// tools/types.ts
export interface ToolContext {
  workspaceDir: string
  sessionKey?: string     // ← 新增
  abortSignal?: AbortSignal
  proxyUrl?: string
  env?: Record<string, string>
  provider?: LLMProvider
}
```

runner.ts 构造 toolCtx 时注入 `sessionKey`：
```typescript
const toolCtx: ToolContext = {
  workspaceDir: params.workspaceDir ?? process.cwd(),
  sessionKey: params.sessionKey,  // ← 新增
  abortSignal: abort.signal,
  proxyUrl: getProxyUrl() ?? undefined,
  provider,
}
```

### 2. Browser 隔离架构

```
┌─────────────────────────────────────────────────┐
│              Chrome 进程（单例）                   │
│                                                   │
│  ┌─────────────────┐  ┌─────────────────┐        │
│  │ BrowserContext A  │  │ BrowserContext B  │       │
│  │ (session: abc)    │  │ (session: xyz)    │      │
│  │ ┌──────┐┌──────┐ │  │ ┌──────┐         │       │
│  │ │Tab 0 ││Tab 1 │ │  │ │Tab 0 │         │       │
│  │ │百度   ││邮件   │ │  │ │淘宝   │         │       │
│  │ └──────┘└──────┘ │  │ └──────┘         │       │
│  └─────────────────┘  └─────────────────┘        │
└─────────────────────────────────────────────────┘
```

**关键数据结构：**

```typescript
// 共享 Browser 进程（全局唯一）
let _browser: Browser | null = null

// per-session 的 BrowserContext
const _contexts = new Map<string, BrowserContext>()
```

**生命周期：**
- `start`：`ensureContext(sessionKey)` → 确保 Chrome 进程 + 创建/复用该 session 的 context
- `stop`：`closeSessionBrowser(sessionKey)` → 关闭该 session 的 context；若无活跃 context 则关 Chrome
- Chrome `disconnected` 事件 → 清空 `_contexts` map

**BrowserContext 的隔离效果（Playwright 原生保证）：**
- 每个 context 有独立的 cookie 存储
- 每个 context 有独立的 localStorage/sessionStorage
- 每个 context 的标签页（Page[]）完全隔离
- 共享同一个 Chrome 渲染引擎进程（省内存）

### 3. ProcessManager 隔离方案（P1）

```typescript
// 现有 BackgroundProcess 接口扩展
export interface BackgroundProcess {
  id: string
  command: string
  // ... existing fields ...
  sessionKey: string  // ← 新增：创建该进程的 session
}
```

**改动点：**
- `processManager.spawn()` 接受 `sessionKey` 参数
- `processManager.list()` 接受可选 `sessionKey` 过滤
- `processManager.kill()` 校验 sessionKey 归属
- bash 工具 `background=true` 时从 ToolContext 传入 sessionKey

### 4. Cron 归属标记（P2）

```typescript
// 现有 CronJob 接口扩展
export interface CronJob {
  // ... existing fields ...
  createdBySession?: string  // ← 新增
}
```

改动最小：只在 `cron add` 时记录来源 session，`cron list` 时展示。
不做强隔离（定时任务是全局资源，任何 session 都能管理）。

## 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Browser 隔离粒度 | BrowserContext（非 Browser 进程） | 1 个 Chrome 进程省资源；Playwright Context 天然隔离 cookie/storage/pages |
| ProcessManager 隔离策略 | 软隔离（归属标记 + 默认过滤） | 硬隔离会让调试困难；用户可能确实需要跨 session 操作进程 |
| Cron 隔离策略 | 只标记不隔离 | 定时任务是全局生效的，用户期望在任何对话中都能查看/管理 |
| Memory 隔离 | 不隔离 | 长期记忆本就是用户级别资源，跨 session 共享是核心特性 |
| sessionKey 回退值 | "default" | 兼容无 session 场景（测试/直接调用） |

## 数据流

```
用户在对话 A 输入 "打开百度"
  → index.ts: sessionKey = "session-abc"
  → runner.ts: toolCtx = { sessionKey: "session-abc", ... }
  → browser.execute(input, toolCtx)
  → sk = toolCtx.sessionKey ?? "default"  // "session-abc"
  → ensureContext("session-abc")
    → ensureBrowserProcess()  // 共享 Chrome
    → _contexts.get("session-abc") ?? browser.newContext()
  → getActivePage(context, ...)  // 只操作该 session 的页面
```

## 向后兼容

- `sessionKey` 是可选字段，未传时 fallback 为 `"default"`
- 旧的 session JSON 文件不含 costLines 字段，load 时 `?? {}` 兼容
- 已有的后台进程（无 sessionKey 标记）在 P1 实施后视为 `"default"` session
