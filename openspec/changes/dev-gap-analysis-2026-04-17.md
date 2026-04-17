# Equality 开发能力差距分析报告

> 分析日期：2026-04-17  
> 基于：所有已完成 Phase (0–14, A–T) + 现有源码 + 竞品对比 (Cursor/Copilot/Claude Code/Hermes)

---

## 一、已完成能力总览

经过 30+ 个 Phase 迭代，Equality 已实现以下核心能力：

| 模块 | 状态 | 关键实现 |
|------|------|---------|
| Agent 核心循环 | ✅ 完整 | 异步 SSE + Promise.allSettled 并行 + budget(50/50) + 压力警告 |
| 内置工具 | ✅ 29 个 | 文件系统 7 + 代码智能 5 + 执行 4 + 记忆 3 + 多 Agent 4 + 多媒体 6 |
| 长期记忆 | ✅ 完整 | SQLite + FTS5 + Embedding Hybrid Search + 冻结快照 + 威胁扫描 |
| Skills 技能 | ✅ 完整 | 自动沉淀 + Gallery + Watcher + 安全扫描 + 渐进式披露 (Phase T) |
| 多 Agent 编排 | ✅ 完整 | Plan DAG + PlanExecutor + 6 角色 + steer/kill + depth 限制 |
| 安全 | ✅ 7 层 | 策略管道 + 变更分类 + 沙箱 + 14 种注入检测 + SSRF + 记忆扫描 + 事实核查 |
| 智能路由 | ✅ 完整 | Light/Standard/Heavy + @model + Fallback + Key 轮换 + 冷却 |
| 费用追踪 | ✅ 完整 | Cost Ledger (SQLite) + 三级汇总 + 内置价格表 |
| 上下文管理 | ✅ 完整 | Compaction + 分块摘要 + Identifier Shield + Token 估算 |
| 会话管理 | ✅ 完整 | 持久化 + 快照 + FTS 搜索 + Purpose + 队列 + 标题生成 |
| LSP 代码智能 | ✅ 完整 | hover/definition/references/diagnostics |
| 浏览器自动化 | ✅ 完整 | Playwright 537 行，Chrome/Edge 自动检测 |
| 定时任务 | ✅ 完整 | cron-parser + 每分钟 tick + SQLite 持久化 |
| MCP 客户端 | ✅ 完整 | McpClientManager + tool/resource/prompt 支持 |
| 桌面 UI | ✅ 完整 | Tauri + React + 流式 + Diff 预览 + 交互式块 + 会话树 |
| 插件系统 | ✅ 基础 | Plugin SDK Lite |
| TTS | ✅ 基础 | 文字转语音集成 |
| Chat 命令 | ✅ 大部分 | /help /status /new /reset /compact /usage /model |

---

## 二、与竞品的关键差距

### 🔴 高影响差距

| # | 差距 | 影响 | 竞品参考 | 补齐难度 |
|---|------|------|---------|---------|
| 1 | **代码索引缺乏向量嵌入** | `codebase_search` 本质是分块关键词搜索，800+ 文件项目中召回率低 | Cursor: 全项目 embedding 索引 | 中 (~400 行) |
| 2 | **无 LLM 请求次数追踪/配额** | Copilot 企业版按请求计费 (1000次/月高级模型)，用户无法感知消耗速度 | Copilot: 请求配额 UI | 中 (~300 行) |
| 3 | **无文件树浏览器** | 用户只能靠 `list_dir` 或手动输入路径，无法拖放文件到对话 | Cursor/Copilot: IDE 原生文件树 | 中 (~400 行前端) |

### 🟡 中等影响差距

| # | 差距 | 影响 | 补齐难度 |
|---|------|------|---------|
| 4 | **Diff 预览不够精细** | 当前是简单文本 diff，非 Monaco 级 inline diff (无 hunk accept/reject) | 高 (~500 行前端) |
| 5 | **Mixture-of-Agents (MoA)** | 多 LLM 协作推理，提升复杂问题质量 | 中 (~300 行) |
| 6 | **MCP Server 模式** | 仅有 MCP 客户端，不能作为 MCP Server 被其他工具调用 | 低 (~200 行) |
| 7 | **Chat 命令前端集成** | Phase Q 后端完成但前端 `/` 触发器未集成 | 低 (~100 行前端) |

### 🟢 低影响 / 非核心差距

| # | 差距 | 说明 |
|---|------|------|
| 8 | Profiles 多实例 | 完全隔离的配置/记忆/技能 profile (Hermes 有，但非核心) |
| 9 | 多平台网关 | Hermes 有 14 个网关 (Telegram/Discord/Slack 等)，Equality 仅桌面 |
| 10 | Skills Hub 安全 | quarantine + audit + taps (Hermes 有完整实现) |
| 11 | Checkpoint Manager | 任务断点保存/恢复 (Hermes 新增) |

---

## 三、Phase 完成度统计

| 状态 | Phase 列表 | 数量 |
|------|-----------|------|
| ✅ 完成 | 2, 3, 3.1, 3.2, 3.3, 6, 7, 8, 10.1, 11, 12, 12.1, B, C, D, E, E4, F, G, H, I, I.5, I.5b, J, K, L, M, N, O, Q, R, S, T | 33 |
| 🟡 部分 | 14, Q (前端待集成), K/L/M (v2 任务延迟) | 4 |
| ❌ 未完成 tasks | 0, 1, 4, 5, 9, 10, A | 7 |

> 注：Phase 0/1/A 的 tasks.md 未打勾，但其功能已在后续 Phase 中实现（只是未回填 checkbox）。

---

## 四、推荐下一步优先级

### P0 — 直接影响用户日常使用

| # | 项目 | 预计工作量 | 说明 |
|---|------|-----------|------|
| 1 | **LLM 请求次数追踪 + 配额预警** | 1-2 天 | 见 Phase U OpenSpec |
| 2 | **codebase_search 向量嵌入升级** | 2-3 天 | 利用已有 `SimpleEmbeddingProvider`，增加项目文件索引器 |
| 3 | **文件树浏览器** | 2 天 | 桌面端左侧新增面板，支持拖放文件到对话 |

### P1 — 提升体验

| # | 项目 | 预计工作量 |
|---|------|-----------|
| 4 | Chat 命令前端 `/` 触发器 | 半天 |
| 5 | Monaco Diff 预览升级 | 2 天 |
| 6 | MoA 工具 | 1-2 天 |

### P2 — 长期规划

| # | 项目 | 预计工作量 |
|---|------|-----------|
| 7 | MCP Server 模式 | 1 天 |
| 8 | Profiles 多实例 | 3 天 |
| 9 | 多平台网关 (至少 Telegram) | 3-5 天 |

---

## 五、架构健康度评估

| 指标 | 值 | 评价 |
|------|-----|------|
| 核心 .ts 文件数 | ~220 | 合理，模块化清晰 |
| 测试断言数 | ~1,300+ | 良好，关键路径有覆盖 |
| 内置工具数 | 29 | 充足，覆盖文件/代码/执行/记忆/协作 |
| 安全层数 | 7 | 优秀，超过多数竞品 |
| Provider 数 | 6+ | 充足，含免费 Copilot |
| 最大技术债 | Phase 0/1 tasks 未回填 | 低风险，功能已实现 |

**结论**：Equality 在核心 Agent 能力上已达到竞品水平，在记忆、安全、路由、子代理控制等方面超越。**最大的差距集中在开发者体验侧**（代码索引精度、文件树、请求配额感知），建议优先补齐。
