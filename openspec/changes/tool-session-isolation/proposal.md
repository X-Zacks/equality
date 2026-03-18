# Proposal: 工具会话隔离（Tool Session Isolation）

## 意图

当用户在多个对话（session）中同时使用有状态工具（如浏览器、后台进程）时，
不同会话的操作会互相干扰。典型场景：

> 对话 A 设了一个定时任务需要操作浏览器打开百度；
> 对话 B 又设了另一个定时任务也要操作浏览器打开淘宝。
> 两个任务并发执行时，共享同一个 BrowserContext，
> B 的 navigate 直接覆盖了 A 正在操作的页面。

这是因为有状态工具使用了**模块级全局单例**，所有 session 共享同一份状态。

## 范围

### 受影响工具分析

| 工具 | 状态类型 | 冲突风险 | 优先级 |
|------|---------|---------|-------|
| **browser** | 全局 `_browser` + `_context` 单例 | 🔴 高：页面/标签页直接冲突 | P0 |
| **bash** | 无状态（每次 spawn 新进程） | 🟢 无：`cwd` 来自 ToolContext | — |
| **process** (process-manager) | 全局 `ProcessManager` 单例，共享进程池 | 🟡 中：session A 可 kill session B 的进程 | P1 |
| **cron** | 全局 `_scheduler` 单例 | 🟡 中：任何 session 都能操作所有定时任务 | P2 |
| **memory** | SQLite 全局数据库 | 🟢 低：记忆本就是跨 session 共享的（设计意图） | — |
| **read_file / write_file / edit_file** | 无状态 | 🟢 无：操作文件系统，天然隔离 | — |
| **glob / grep / list_dir** | 无状态（只读） | 🟢 无 | — |
| **web_fetch / web_search** | 无状态 | 🟢 无 | — |
| **read_image / read_pdf** | 无状态 | 🟢 无 | — |
| **apply_patch** | 无状态 | 🟢 无 | — |

### 结论

需要隔离的工具：**3 个**

1. **browser**（P0）— 页面/标签页/cookie 完全冲突
2. **process-manager**（P1）— 进程池混在一起，可以误操作他人进程
3. **cron**（P2）— 低优先级，因为定时任务本就是全局资源，但应加 session 归属标记

不需要隔离的工具：**14 个**
- 无状态工具：bash, read_file, write_file, edit_file, glob, grep, list_dir, web_fetch, web_search, read_image, read_pdf, apply_patch
- 设计上就该共享的：memory（长期记忆是用户级别的，跨 session 是特性）

## 高层方案

### 核心原则

```
共享一个进程，隔离每个会话的上下文。
```

- **Browser**：1 个 Chrome 进程 → N 个 BrowserContext（per session）
- **ProcessManager**：1 个进程池 → 按 sessionKey 标记归属，查询/操作时过滤
- **Cron**：全局任务列表 → 加 `createdBySession` 字段，展示时可按 session 过滤

### 基础设施

在 `ToolContext` 中添加 `sessionKey` 字段，runner 调用工具时传入当前 session key。
有状态工具通过 `ctx.sessionKey` 实现隔离。

## 决策

- ✅ 采用此方案
- 已完成 Browser（P0）的实现
- Process-Manager（P1）和 Cron（P2）待实施

## OpenClaw 参考

研究了 `example/src/browser/` 的源码，OpenClaw 用两层机制：
1. **Profile** — 每个 Profile 一个独立 Chrome 进程（CDP 端口隔离）
2. **Session-Tab-Registry** — `Map<sessionKey, Map<tabId, TrackedTab>>`，追踪每个 session 打开的标签

关键差异：OpenClaw 面向多渠道（飞书/Discord/Web 等），每个渠道的 agent 都有自己的 sessionKey，
浏览器通过 HTTP 控制服务器间接操作。我们是单用户桌面应用，直接用 Playwright 驱动，
所以用 BrowserContext 隔离更轻量合适。

详见 `design.md` 中的完整对比分析。
