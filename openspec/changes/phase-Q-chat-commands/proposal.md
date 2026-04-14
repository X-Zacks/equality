# Proposal: Phase Q — Chat Commands (/ 指令系统)

> Author: AI Agent | Date: 2026-04-14

## 动机

OpenClaw 支持 9 种 Chat Commands：`/status /new /reset /compact /think /verbose /usage /restart /activation`。
Equality 当前没有 `/` 指令系统，所有会话控制功能都依赖桌面 UI 控件实现。

缺少 `/` 指令的影响：
1. **功能不平权**：用户必须在输入框外操作（点按钮/菜单），效率低于键入指令
2. **频道前置**：未来接入 Telegram/飞书等频道后，没有 UI 控件，`/` 指令是唯一的会话控制手段
3. **高级用户需求**：开发者群体习惯命令行，`/` 指令是自然交互模式

## 目标

在 `@equality/core` 中实现 Chat Commands 框架，并在 `@equality/desktop` 前端提供指令补全与即时执行。

## 范围

### 核心指令（7 个）

| 指令 | 功能 | 实现层 |
|------|------|--------|
| `/status` | 显示当前会话状态（消息数、Token 用量、活跃模型、内存条数） | core |
| `/new` | 新建空白会话 | core + desktop |
| `/reset` | 清空当前会话（保留 sessionKey，清消息） | core |
| `/compact` | 手动触发当前会话的上下文压缩 | core |
| `/usage` | 显示本次会话 Token 消耗统计 | core |
| `/model <name>` | 切换当前会话使用的 LLM 模型 | core |
| `/help` | 列出所有可用指令及简要说明 | core |

### 框架能力

1. **命令注册表** — `ChatCommandRegistry`：可扩展，插件可注册新指令
2. **命令解析器** — 解析 `/command arg1 arg2` 格式
3. **即时响应** — 指令结果不经过 LLM，直接返回结构化结果
4. **前端集成** — 输入 `/` 时弹出指令补全菜单

## 非范围

- `/think` `/verbose` — 这些通过前端 UI 设置实现更自然
- `/restart` — Tauri 应用重启由 desktop 层直接处理
- `/activation` — 多实例场景，当前不需要
- 频道系统（Phase P，独立提案）
- 权限控制（所有指令对所有用户开放）

## 成功标准

1. 用户在输入框输入 `/status` 回车后，2秒内返回会话状态信息
2. 输入 `/` 后前端显示可用指令列表
3. 所有 7 个指令有单元测试覆盖
4. `tsc --noEmit` 零错误
5. 指令框架可扩展（插件可通过 `ChatCommandRegistry.register()` 注册新指令）
