# Tasks: Phase 0 — Tauri Windows Shell

## 1. 项目初始化

- [ ] 1.1 在 `packages/desktop/` 初始化 Tauri 2.x 项目（`npm create tauri-app`）
- [ ] 1.2 配置 pnpm workspace，将 `desktop` 加入 monorepo
- [ ] 1.3 安装 Tauri 插件：`tauri-plugin-global-shortcut`、`tauri-plugin-system-tray`、`tauri-plugin-notification`
- [ ] 1.4 配置 `tauri.conf.json`（透明窗口、无边框、alwaysOnTop、初始隐藏）
- [ ] 1.5 配置 Vite + React + TypeScript + Tailwind CSS

## 2. 系统托盘

- [ ] 2.1 实现 `tray.rs`：创建系统托盘图标
- [ ] 2.2 实现托盘右键菜单：显示/隐藏、设置、退出
- [ ] 2.3 托盘图标有两个状态：就绪（彩色）、未就绪（灰色）
- [ ] 2.4 双击托盘图标 = 切换悬浮窗显示/隐藏

## 3. 全局快捷键

- [ ] 3.1 实现 `hotkey.rs`：注册 `Alt+Space` 全局快捷键
- [ ] 3.2 快捷键触发时，向前端 WebView 发送 `toggle-float-window` 事件
- [ ] 3.3 快捷键冲突时（被其他程序占用），记录警告日志，托盘显示提示

## 4. 悬浮输入框前端

- [ ] 4.1 实现 `FloatInput.tsx` 组件（输入框 + 发送按钮）
- [ ] 4.2 监听 `toggle-float-window` 事件，控制组件显示/隐藏动画
- [ ] 4.3 按 `Esc` 收起悬浮窗
- [ ] 4.4 输入框自动获取焦点（窗口显示时）
- [ ] 4.5 发送消息后显示 Mock 响应区域（为 Phase 1 流式输出预留位置）
- [ ] 4.6 窗口高度随回复内容动态调整（`window.setSize()`）

## 5. Gateway 子进程管理

- [ ] 5.1 实现 `gateway.rs`：在 Tauri 启动时 spawn `equality-core.exe` 子进程
- [ ] 5.2 轮询 `GET http://localhost:18790/health` 等待就绪（最多 10s，500ms 间隔）
- [ ] 5.3 就绪后更新托盘图标为彩色
- [ ] 5.4 监听子进程退出事件，意外退出时自动重启（最多 3 次）
- [ ] 5.5 Tauri 主进程退出时，先发 SIGTERM 给子进程，等待 5s 后强制 SIGKILL

## 6. Gateway Stub（equality-core.exe Phase 0 版）

- [ ] 6.1 在 `packages/core/` 创建 Node.js 项目
- [ ] 6.2 实现最简 HTTP 服务（fastify 或 node:http）监听 18790
- [ ] 6.3 实现 `GET /health` → `{ "status": "ok", "version": "0.1.0" }`
- [ ] 6.4 实现 `POST /chat/stream` → 返回 SSE mock 文本 "Gateway stub，Phase 1 即将到来"
- [ ] 6.5 使用 Node.js 22 SEA 打包为 `equality-core.exe`（附带构建脚本）

## 7. 安装包

- [ ] 7.1 配置 `tauri-bundler` NSIS 安装脚本
- [ ] 7.2 安装包包含：`equality.exe` + `equality-core.exe` + 图标资源
- [ ] 7.3 安装时写入开机自启动注册表（`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`）
- [ ] 7.4 卸载时清理注册表和 AppData 数据（可选，询问用户）
- [ ] 7.5 构建脚本：`pnpm run build:installer`，输出到 `dist/EqualitySetup-{version}-x64.exe`

## 8. 验收测试

- [ ] 8.1 全新 Windows 11 系统，运行 `EqualitySetup.exe`，安装完成后托盘出现图标
- [ ] 8.2 按 Alt+Space 呼出输入框，输入文字，看到 Mock 回复
- [ ] 8.3 按 Esc 收起，再次按 Alt+Space 重新显示（位置在屏幕中央）
- [ ] 8.4 托盘右键 → 退出，任务管理器中无残留进程
- [ ] 8.5 重启系统后，开机自动启动，托盘图标出现
