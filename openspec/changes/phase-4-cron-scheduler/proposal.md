# Phase 4 — 定时任务（Cron / Scheduler）

> **状态**: Draft → Ready  
> **优先级**: 🔴 P0  
> **依赖**: Phase 3.x（Tools 基础设施）  
> **对标**: OpenClaw `cron-tool` + `CronService` + `server-cron`

---

## 1. 问题陈述

用户需要 AI 助手在**指定时间自动执行任务**，而不是每次都手动触发。典型场景：

| 场景 | 用户说法 | 期望行为 |
|------|---------|---------|
| 定时提醒 | "每天下午 5 点提醒我写日报" | 5PM 弹出桌面通知 "该写日报了" |
| 周期检查 | "每小时检查一下服务器状态" | 每小时执行 bash 命令并汇报结果 |
| 一次性任务 | "明天早上 9 点提醒我开会" | 明天 9:00 弹出通知，之后自动删除 |
| 定时执行 | "每周五下午 3 点帮我整理本周 git log" | 周五 3PM 自动执行并在对话中展示结果 |

### 当前 Equality 的能力缺口

- 所有交互都是**用户主动发起**的，AI 无法主动触发
- 没有任何定时/调度机制
- 桌面通知能力未利用（Tauri 支持但未接入）

---

## 2. OpenClaw 的做法

OpenClaw 有完整的 Cron 系统，但其架构是面向**服务端多渠道**的：

- `CronService` — 内存调度引擎，支持 cron 表达式 / 固定间隔 / 一次性定时
- `cron-tool` — LLM 可调用的工具，支持 add/list/update/remove/run/status 操作
- `server-cron` — Gateway 层的 cron 执行器，到点触发 agent turn 或 system event
- `delivery` — 执行完毕后通过 announce/webhook 发送结果到指定渠道

### Equality 的简化方案

我们是**单机桌面应用**，不需要：
- ❌ 多渠道 delivery（没有 Telegram/Discord）
- ❌ Webhook 回调
- ❌ agentId / 多代理路由
- ❌ isolated session（单用户无需隔离）

我们需要的核心子集：
- ✅ **cron 工具** — LLM 可以创建/管理定时任务
- ✅ **调度引擎** — 到点触发执行
- ✅ **执行方式** — 直接在当前 session 注入消息 或 桌面通知
- ✅ **持久化** — 关闭再打开，定时任务不丢失
- ✅ **桌面通知** — 通过 Tauri notification API 推送到系统通知

---

## 3. 设计概览

### 架构

```
用户: "每天 5 点提醒我写日报"
    │
    ▼
LLM 调用 cron 工具
    │  action: "add"
    │  schedule: { kind: "cron", expr: "0 17 * * *" }
    │  payload: { kind: "notify", text: "该写日报了" }
    ▼
┌────────────────────┐
│    CronStore        │  ← JSON 文件持久化 (%APPDATA%/Equality/cron-jobs.json)
│    (增删改查)        │
└────────┬───────────┘
         │
    ┌────▼────┐
    │ Scheduler│  ← setInterval 每分钟检查一次
    │ (内存)   │
    └────┬────┘
         │ 到点触发
         ▼
┌─────────────────────┐
│  执行器 (Executor)   │
│  ├── notify: 桌面通知 │  → Tauri notification
│  ├── chat: 注入消息   │  → session.addMessage() + 触发 agent turn
│  └── agent: 执行任务  │  → runAttempt() 完整 tool loop
└─────────────────────┘
```

### 核心概念

| 概念 | 说明 |
|------|------|
| **CronJob** | 一个定时任务的完整定义（name, schedule, payload, enabled） |
| **Schedule** | 何时触发：cron 表达式 / 固定间隔 / 一次性 |
| **Payload** | 触发后做什么：notify（通知）/ chat（注入消息）/ agent（执行任务） |
| **CronStore** | JSON 文件持久化存储 |
| **Scheduler** | 内存中的调度循环（setInterval 60s） |

---

## 4. Scope

### 做什么（V1）

- `cron` 工具：add / list / update / remove / run（手动触发）
- 3 种 schedule：cron 表达式、固定间隔（everyMs）、一次性（at ISO 时间）
- 3 种 payload：notify（桌面通知）、chat（注入消息到当前会话）、agent（执行完整 agent turn）
- JSON 文件持久化（%APPDATA%/Equality/cron-jobs.json）
- 每分钟调度检查
- deleteAfterRun 支持一次性任务自动清理
- 运行日志（最近 N 次执行记录）

### 不做（V1）

- ❌ 前端 UI 管理界面（通过对话管理即可）
- ❌ 多渠道 delivery（仅桌面通知 + 对话注入）
- ❌ Webhook 回调
- ❌ 秒级精度（分钟级足够）

---

## 5. 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 调度精度 | 分钟级 | 桌面场景不需要秒级，减少系统开销 |
| 持久化 | JSON 文件 | 简单可靠，与 session 存储一致 |
| 通知方式 | Tauri notification | 原生系统通知，不干扰当前对话 |
| cron 库 | cron-parser 或手写 | 只需基础表达式，不引入重依赖 |
| 时区 | 系统本地时区 | 桌面单用户，无需多时区 |
