# Phase 4.5 — 浏览器控制（Browser Tool）

> **状态**: Draft → Ready  
> **优先级**: 🔴 P0  
> **依赖**: Phase 2（Tools 基础设施）  
> **方案**: **直接复用 OpenClaw 的 browser 子系统**（不自研）

---

## 1. 问题陈述

用户用 Equality 生成了 Web 应用，但 **AI 无法自动打开浏览器验证和测试**。

| 场景 | 用户说法 | 期望行为 |
|------|---------|---------|
| 自动化测试 | "帮我测试刚生成的网页" | 打开浏览器 → 导航 → 截图 → 交互验证 |
| 页面调试 | "这个页面样式不对" | 截图 + snapshot → 分析问题 |
| 信息采集 | "帮我从这个网站抓取商品列表" | 导航 → snapshot → 提取数据 |
| E2E 测试 | "帮我跑一下 E2E 测试" | navigate → 填表 → 点击 → 验证结果 |

---

## 2. 为什么复用 OpenClaw 而不自研？

OpenClaw 的 browser 子系统有 **132+ 个文件**，打磨成熟度极高：

- ✅ Playwright + CDP 双模驱动
- ✅ ARIA `ai` snapshot — LLM 理解页面的最佳文本格式
- ✅ Chrome extension relay — 接管用户已打开的 Chrome 标签
- ✅ multi-profile（openclaw 隔离 + chrome 共存）
- ✅ act 指令系统（click/type/fill/drag/select/wait/evaluate...）
- ✅ navigation guard、console log、screenshot、PDF...

**浏览器控制不是 Equality 的差异化点**。自研只会重复造轮子。Equality 的差异化在于：

| 差异化方向 | Equality 做的 | OpenClaw 没做 / 做不到 |
|-----------|-------------|---------------------|
| Windows 桌面部署 | Tauri 原生窗口、系统托盘、全局快捷键 | CLI only |
| 费用控制 | cost ledger、SQLite 记录、预算限额 | 无 |
| 模型动态选取 | 多 Provider 降级链、智能路由 | 单 Provider |
| 流量管控 | 企业代理、PRC API 可用性适配 | 无 |
| 定时任务 | 桌面通知提醒、cron 调度 | 仅 IM 渠道 |
| Copilot 白嫖 | GitHub Copilot Device Flow | 不支持 |

**在非差异化的领域，直接复用最优方案**。

---

## 3. OpenClaw browser 架构

OpenClaw 的 browser 是一个**独立 HTTP 服务**（express app），对外暴露 REST API：

```
GET  /                    → 浏览器状态
POST /start               → 启动浏览器
POST /stop                → 关闭浏览器
GET  /profiles            → 列出 profile
GET  /tabs                → 标签页列表
POST /tabs/open           → 打开标签
POST /tabs/focus          → 切换标签
DELETE /tabs/:id          → 关闭标签
POST /navigate            → 导航
POST /screenshot          → 截图
GET  /snapshot            → ARIA 快照（LLM 最友好的页面理解格式）
POST /act                 → 交互操作（click/type/fill/press/hover/drag/select/wait/evaluate/close）
GET  /console             → 控制台日志
POST /pdf                 → 保存 PDF
POST /hooks/file-chooser  → 文件上传
POST /hooks/dialog        → 对话框处理
```

默认监听 `127.0.0.1:{controlPort}`（通常 9222 附近）。

---

## 4. 集成方案

### V1：进程外调用（推荐先做）

```
用户对话: "帮我测试 localhost:3000"
    ↓
Equality Core → browser 工具 execute
    ↓
HTTP fetch → OpenClaw browser server (127.0.0.1:9222)
    ↓
Playwright → Chrome/Edge
```

**Equality 的 browser tool = OpenClaw browser REST API 的薄 HTTP client**。

- 设置项：`BROWSER_CONTROL_URL`（默认 `http://127.0.0.1:9222`）
- 连接失败时：友好提示 "请先启动 OpenClaw browser server"
- 工具 schema 与 OpenClaw `browser-tool` 对齐（LLM 已有训练数据）

### V2（可选，后续升级）：自动检测 + 回退

```
1. 检测本机是否有 OpenClaw browser server → 有则直接用
2. 没有 → 提示安装 / 内嵌启动精简版
```

---

## 5. Scope

### V1 做什么

- `browser` 工具注册到 ToolRegistry（工具总数 → 15）
- 一个 ~150 行的 HTTP client wrapper（`callBrowserApi()`）
- 12 个 action 对应 OpenClaw browser REST API
- 配置项 `BROWSER_CONTROL_URL`
- 连接检测 + 错误提示

### V1 不做

- ❌ 不自己实现 Playwright 驱动
- ❌ 不嵌入 OpenClaw browser server
- ❌ 不做浏览器进程管理
- ❌ 不做安全策略

---

## 6. 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 自研 vs 复用 | **复用 OpenClaw** | 132+ 文件成熟方案，非差异化领域 |
| 集成方式 | **进程外 HTTP** | 最简单、最快、解耦 |
| Schema 设计 | **对齐 OpenClaw** | LLM 已有训练数据 |
| 实现量 | **~150 行** | 只是 HTTP client wrapper |
