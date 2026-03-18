# Proposal: Phase 0 — Tauri Windows Shell

## 意图

为 equality 搭建 Windows 桌面客户端骨架。  
这是所有功能开发的基础：在没有可视化界面的情况下，普通 Windows 用户无法使用 Agent Core。

## 背景

OpenClaw 在 Windows 上的体验是：终端 TUI + 强烈建议用 WSL2。  
没有图形界面，没有系统托盘，没有全局快捷键——对非技术用户不友好。

equality 的差异化核心是：**在相同的 Agent Core 架构上，提供真正的 Windows 原生体验**。

## 做什么

1. 创建 Tauri 2.x 项目（`packages/desktop/`）
2. 实现系统托盘常驻 + 右键菜单
3. 实现全局快捷键（Alt+Space）呼出/收起悬浮输入框
4. Tauri 主进程负责启动 / 守护 `equality-core.exe` 子进程
5. 前端通过 HTTP SSE 连接 Gateway（`localhost:18790`）
6. NSIS 安装包脚本（`EqualitySetup.exe`，目标 < 30MB）

## 不做什么（明确边界）

- ❌ 不实现真正的 Agent 逻辑（Phase 1 做）
- ❌ 不接入任何 LLM（Phase 1 做）
- ❌ 不实现渠道适配器（Phase 4 做）
- ❌ 对话历史面板（Phase 1 做）
- ❌ 设置面板的 API Key 配置（Phase 1 做）

## 成功标准

- [ ] 双击 `EqualitySetup.exe` 安装完成，系统托盘出现 Equality 图标
- [ ] 按 Alt+Space 呼出悬浮输入框，再按 Esc 收起
- [ ] 输入框发送 "hello" → 显示 Mock 回复 "Gateway 未就绪，请稍候"
- [ ] 托盘右键 → 退出，进程完全退出（无僵尸进程）
