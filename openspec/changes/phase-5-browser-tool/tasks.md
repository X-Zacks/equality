# Tasks: Phase 4.5 V2 — 浏览器控制（内置 Playwright）

> V1 tasks 见 `tasks-v1.md`（HTTP client 方案，已废弃）

## Section 1: 依赖安装

- [ ] 1.1 `pnpm --filter @equality/core add playwright`
- [ ] 1.2 确认 Chromium 自动下载成功（`npx playwright install chromium`）
- [ ] 1.3 确认 `playwright` 在 Node.js v22 + Windows 上正常 launch

## Section 2: 浏览器生命周期

- [ ] 2.1 实现全局单例 `ensureBrowser()` — 懒初始化，headless: false
- [ ] 2.2 实现 `closeBrowser()` — 清理单例
- [ ] 2.3 实现 `getActivePage(context, targetId?)` — 页面管理
- [ ] 2.4 Core 退出时自动关闭浏览器（SIGINT/SIGTERM）

## Section 3: ARIA Snapshot

- [ ] 3.1 实现 `getAriaSnapshot(page)` — 调用 `page.accessibility.snapshot()`
- [ ] 3.2 实现 `formatNode()` — 递归格式化为 `[ref] role "name"` 文本
- [ ] 3.3 实现 ref → locator 映射（`_refToLocator` Map）
- [ ] 3.4 `buildLocator(node)` — 用 role + name 构建 Playwright locator 字符串

## Section 4: Act 操作

- [ ] 4.1 `actByRef()` — 通过 ref 查找 locator 并执行操作
- [ ] 4.2 click / fill / type / press / hover / select
- [ ] 4.3 wait（等待时间或选择器）
- [ ] 4.4 evaluate（在页面执行 JS）
- [ ] 4.5 ref 未找到时的错误提示（"请先执行 snapshot"）

## Section 5: 重写 browser.ts

- [ ] 5.1 替换 `callBrowserApi` / `checkServerAvailable` 为 Playwright 直接调用
- [ ] 5.2 保持 inputSchema 不变（向后兼容）
- [ ] 5.3 实现 12 个 action: status/start/stop/navigate/screenshot/snapshot/act/console/tabs/open/focus/close
- [ ] 5.4 start 时如果 Chromium 未安装，返回安装指引
- [ ] 5.5 screenshot 保存到临时目录

## Section 6: 集成

- [ ] 6.1 确认 builtinTools 中 browserTool 仍然正常注册
- [ ] 6.2 确认不影响其他 14 个工具
- [ ] 6.3 Core 启动日志中显示 browser tool 状态

## 验收

- [ ] V1 `browser start` → Chromium 窗口弹出
- [ ] V2 `browser navigate url=https://example.com` → 页面加载
- [ ] V3 `browser snapshot` → 返回 ARIA 树（[e1] role "name" 格式）
- [ ] V4 `browser act kind=click ref=e3` → 点击对应元素
- [ ] V5 `browser act kind=fill ref=e5 text=hello` → 填入文本
- [ ] V6 `browser screenshot` → 截图保存到文件
- [ ] V7 `browser tabs` → 列出所有标签页
- [ ] V8 Chromium 未安装时 → 返回友好安装指引
- [ ] V9 Core 退出 → Chromium 自动关闭
- [ ] V10 集成测试：用户说"帮我测试 localhost:3000 的查询功能" → AI 完整走通 start→navigate→snapshot→act→snapshot→screenshot 流程
