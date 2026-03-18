# Tasks: Phase 4.5 — 浏览器控制（复用 OpenClaw）

## Section 1: browser 工具实现

- [ ] 1.1 实现 `callBrowserApi()` — HTTP client，调用 OpenClaw REST API
- [ ] 1.2 实现 `checkServerAvailable()` — 2s 超时检测 server 是否在线
- [ ] 1.3 实现 `browserTool` 定义（name, description, inputSchema）
- [ ] 1.4 实现 `browserExecute()` — 12 个 action 分发（status/start/stop/navigate/screenshot/snapshot/act/console/tabs/open/focus/close）
- [ ] 1.5 server 不可用时返回友好安装指引

## Section 2: 注册

- [ ] 2.1 在 `builtinTools` 数组中注册 browserTool
- [ ] 2.2 工具总数 14 → 15

## Section 3: 配置

- [ ] 3.1 支持 `BROWSER_CONTROL_URL` 设置项（默认 `http://127.0.0.1:9222`）
- [ ] 3.2 通过 `ctx.env` 或 secrets 读取

## 验收

- [ ] V1 OpenClaw browser server 未启动时，调用 browser 工具 → 返回友好安装提示
- [ ] V2 OpenClaw browser server 启动后，`browser status` → 返回浏览器状态 JSON
- [ ] V3 `browser start` → 启动浏览器
- [ ] V4 `browser navigate url=http://localhost:3000` → 导航成功
- [ ] V5 `browser snapshot` → 返回 ARIA 无障碍快照
- [ ] V6 `browser screenshot` → 返回截图路径
- [ ] V7 `browser act kind=click ref=e12` → 点击元素
- [ ] V8 集成：用户说 "帮我测试 localhost:3000" → AI 完整走通 start→navigate→snapshot→act→screenshot 流程
