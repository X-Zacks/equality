# Tasks: Phase 4 — 定时任务（Cron / Scheduler）

## Section 1: CronStore（持久化存储）

- [ ] 1.1 定义 `CronJob` 类型（id, name, schedule, payload, enabled, createdAt, lastRunAt, nextRunAt, runCount, deleteAfterRun）
- [ ] 1.2 定义 `Schedule` 类型（3 种：cron / every / at）
- [ ] 1.3 定义 `Payload` 类型（3 种：notify / chat / agent）
- [ ] 1.4 实现 `CronStore`：JSON 文件读写 + CRUD 操作
- [ ] 1.5 实现 `computeNextRun(schedule)` — 计算下次触发时间

## Section 2: Scheduler（调度引擎）

- [ ] 2.1 实现 `CronScheduler` 类：setInterval 60s tick
- [ ] 2.2 tick 逻辑：遍历 enabled jobs，比较 nextRunAt ≤ now，触发执行
- [ ] 2.3 执行后更新 lastRunAt / nextRunAt / runCount
- [ ] 2.4 deleteAfterRun=true 的一次性任务自动删除
- [ ] 2.5 运行日志记录（每个 job 最近 20 次执行记录）

## Section 3: 执行器（Executor）

- [ ] 3.1 `notify` payload：调用 Tauri 桌面通知 API 推送系统通知
- [ ] 3.2 `chat` payload：向指定 session 注入用户消息（触发 AI 回复）
- [ ] 3.3 `agent` payload：执行完整 runAttempt()（带 tool loop），结果写入对话

## Section 4: cron 工具（LLM 可调用）

- [ ] 4.1 实现 `cron` 工具定义（inputSchema）
- [ ] 4.2 `add` action：创建定时任务
- [ ] 4.3 `list` action：列出所有定时任务
- [ ] 4.4 `update` action：修改定时任务
- [ ] 4.5 `remove` action：删除定时任务
- [ ] 4.6 `run` action：立即触发执行
- [ ] 4.7 `runs` action：查看执行日志
- [ ] 4.8 注册到 ToolRegistry

## Section 5: Core 集成

- [ ] 5.1 Gateway 启动时初始化 CronScheduler
- [ ] 5.2 HTTP API：`GET /cron/jobs` / `POST /cron/jobs` / `DELETE /cron/jobs/:id`（可选，主要通过工具管理）
- [ ] 5.3 Gateway 关闭时清理 scheduler

## Section 6: Desktop 集成（通知）

- [ ] 6.1 安装 `@tauri-apps/plugin-notification`
- [ ] 6.2 Core 通知 payload 时，通过 Tauri command 触发系统通知
- [ ] 6.3 通知点击时打开对应会话（可选）

## Section 7: cron 表达式解析

- [ ] 7.1 安装 `cron-parser` npm 包
- [ ] 7.2 实现 cron 表达式到下次触发时间的转换
- [ ] 7.3 支持常见表达式（`0 17 * * *` = 每天 5PM，`0 9 * * 1-5` = 工作日 9AM）

## 验收

- [ ] V1 用户说 "每天下午 5 点提醒我写日报" → LLM 调用 cron add → 任务创建成功
- [ ] V2 到点触发 → 桌面弹出系统通知 "该写日报了"
- [ ] V3 用户说 "列出我的定时任务" → LLM 调用 cron list → 展示任务列表
- [ ] V4 用户说 "删除写日报的提醒" → LLM 调用 cron remove → 任务删除
- [ ] V5 用户说 "明天早上 9 点提醒我开会" → 一次性 at 任务 → 触发后自动删除
- [ ] V6 重启应用后定时任务依然存在（持久化）
