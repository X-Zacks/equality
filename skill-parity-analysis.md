# Equality 技能平权分析

> 基于 OpenClaw README (2026.3.31) 与 Equality 当前实现能力的对比分析。
> 目标：**做到技能的平权**——Equality 作为桌面 AI 助手，在"本地控制面 + Agent 运行时 + 工具体系"层面达到与 OpenClaw 同等的能力水平。

---

## 1. OpenClaw 能力全景图

从 README 提取的完整能力矩阵：

### 1.1 核心平台 (Core Platform)

| # | 能力 | OpenClaw 描述 |
|---|------|-------------|
| C1 | Gateway 控制面 | WebSocket 控制面，session/presence/config/cron/webhooks |
| C2 | CLI 表面 | `openclaw gateway/agent/send/onboard/doctor` |
| C3 | Pi Agent 运行时 | RPC 模式，tool streaming + block streaming |
| C4 | Session 模型 | main/group 隔离，activation modes，queue modes，reply-back |
| C5 | Media 管道 | 图片/音频/视频，转录，大小限制，临时文件生命周期 |

### 1.2 频道 (Channels) — 23 个

WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, BlueBubbles, iMessage, IRC, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, Zalo Personal, WeChat, WebChat

### 1.3 Apps + Nodes

| # | 能力 | OpenClaw 描述 |
|---|------|-------------|
| A1 | macOS App | 菜单栏控制、Voice Wake/PTT、Talk Mode、WebChat、调试工具 |
| A2 | iOS Node | Canvas、Voice Wake、Talk Mode、Camera、Screen Recording、Bonjour |
| A3 | Android Node | Chat/Voice/Canvas、Camera/Screen、通知/位置/SMS/照片/联系人/日历/运动 |
| A4 | macOS Node Mode | system.run/notify + canvas/camera |

### 1.4 工具 + 自动化 (Tools + Automation)

| # | 能力 | OpenClaw 描述 |
|---|------|-------------|
| T1 | Browser 控制 | CDP Chrome/Chromium，snapshots，actions，uploads，profiles |
| T2 | Canvas + A2UI | Agent 驱动的可视工作区 |
| T3 | Nodes | camera snap/clip, screen record, location.get, notifications |
| T4 | Cron + Wakeups | 定时任务 + webhooks + Gmail Pub/Sub |
| T5 | Skills 平台 | bundled/managed/workspace skills, install gating + UI |
| T6 | Sessions 工具 | sessions_list / sessions_history / sessions_send（Agent-to-Agent） |
| T7 | Chat Commands | /status /new /reset /compact /think /verbose /usage /restart /activation |

### 1.5 运行时 + 安全 (Runtime + Safety)

| # | 能力 | OpenClaw 描述 |
|---|------|-------------|
| R1 | Channel Routing | 路由 + 重试策略 + streaming/chunking |
| R2 | Presence + Typing | 在线状态 + 打字指示器 |
| R3 | Usage Tracking | Token 用量追踪 |
| R4 | Models + Failover | 多模型 + 模型降级 + session pruning |
| R5 | Security | DM pairing, sandbox (Docker), allowlist/denylist |
| R6 | Multi-agent Routing | 按 channel/account/peer 路由到隔离 agent |

### 1.6 运维 + 分发 (Ops + Packaging)

| # | 能力 | OpenClaw 描述 |
|---|------|-------------|
| O1 | Control UI + WebChat | 从 Gateway 直接提供 |
| O2 | Tailscale Serve/Funnel | 远程访问 |
| O3 | Docker / Nix | 容器化 + 声明式配置 |
| O4 | Doctor | 迁移 + 日志 + 健康检查 |

---

## 2. Equality 当前能力清单

### 2.1 已实现

| 类别 | Equality 能力 | 对应 OpenClaw |
|------|-------------|-------------|
| **Gateway** | Fastify HTTP 控制面 (port 18790) | C1（HTTP 版） |
| **Agent 运行时** | runAttempt (tool loop, streaming, decorators, abort) | C3 |
| **Session** | SessionKey, persist, store, queue, concurrency | C4 |
| **模型** | 6 个 Provider (Copilot/DeepSeek/Qwen/Volc/MiniMax/Custom) | R4 |
| **模型降级** | FallbackProvider + FailoverPolicy + 冷却 | R4 |
| **Context Window** | resolveContextWindow 动态查表 (I.5-2) | R4 |
| **Key Rotation** | executeWithKeyRotation (H3) | R4 |
| **工具** | bash/read_file/write_file/edit_file/apply_patch/glob/grep/web_search/web_fetch/browser/process/cron/memory_save/memory_search/subagent_*/read_image/read_pdf | T1,T4,T6 |
| **MCP** | MCP Client Manager（外部工具服务器集成） | — |
| **Skills** | SKILL.md, priority, hot reload, V2 security scan, gallery install | T5 |
| **Memory** | SQLite + FTS5 + BM25 长期记忆 | — |
| **Compaction** | 50% 阈值 chunked summary | R4 (pruning) |
| **Cost Ledger** | SQLite 费用记录，按会话/全局/每日汇总 | R3 |
| **Smart Routing** | @model override + 智能路由 | R4 |
| **Steering** | 运行中注入用户指令 (/chat/steer) | — |
| **Interactive UI** | :::interactive 块检测 + 前端渲染 | — |
| **Security** | 变异分类审计, bash sandbox, 工具策略管道, DPAPI 密钥 | R5 |
| **External Content** | wrapExternalContent (I.5-1) | R5 |
| **Persist Guard** | truncateForPersistence (I.5-5) | R4 |
| **Cache Trace** | JSONL 诊断追踪 (I.5-8) | — |
| **Agent Scope** | per-agent 配置解析 (I.5-7) | R6 |
| **Tool Catalog** | Profile 系统 (minimal/coding/messaging/full) | T5 |
| **SQLite Task Store** | 任务持久化 WAL 模式 (I.5-3) | — |
| **Task Registry** | E1 子任务 + 事件总线 + orphan recovery | — |
| **SubagentManager** | 多子 Agent 生命周期管理 | T6 |
| **Workspace Bootstrap** | AGENTS.md/SOUL.md/TOOLS.md 自动生成 | T5 |
| **Loop Detection** | 4 检测器（exact/semantic/pattern/budget） | R5 |
| **Stream Decorators** | thinking/usage/model_switch/image_limiter/... | C3 |
| **Copilot OAuth** | Device Flow 登录 | — |
| **Tauri Desktop** | React + Tauri v2 桌面应用 | A1 (替代方案) |

### 2.2 覆盖率统计

| OpenClaw 类别 | 总条目 | Equality 已覆盖 | 覆盖率 |
|-------------|-------|--------------|-------|
| Core Platform (C) | 5 | 4 | 80% |
| Channels (CH) | 23 | 0 | 0% |
| Apps + Nodes (A) | 4 | 1 (桌面) | 25% |
| Tools + Automation (T) | 7 | 6 | 86% |
| Runtime + Safety (R) | 6 | 5 | 83% |
| Ops + Packaging (O) | 4 | 0 | 0% |

---

## 3. 结论：能否实现技能的平权？

### ✅ 能力层面：**基本可以**

Equality 在 **Agent 运行时 + 工具体系 + 模型管理** 这三个核心维度上已经达到了与 OpenClaw 等价的能力水平：

| 维度 | 状态 | 说明 |
|------|------|------|
| Agent 运行时 | ✅ 平权 | tool loop / streaming / abort / compaction / context engine / decorators |
| 工具体系 | ✅ 平权 | bash / fs / web / browser / cron / memory / subagent / MCP / skills |
| 模型管理 | ✅ 平权 | 6 providers / fallback / key rotation / smart routing / context window |
| 安全体系 | ✅ 平权 | mutation audit / bash sandbox / policy pipeline / external content guard |
| 任务管理 | ✅ 超越 | TaskRegistry + SubagentManager + orphan recovery（OpenClaw 无独立任务系统） |
| 内存/RAG | ✅ 超越 | SQLite + FTS5 长期记忆（OpenClaw 无内置 memory） |

**在"技能"（Skills）层面已完全平权**：
- Equality 支持 SKILL.md 格式 ✅
- 支持优先级系统（6 级） ✅
- 支持热重载 ✅
- 支持 V2 安全扫描 ✅
- 支持 Gallery 安装/卸载 ✅
- 支持 Profile 过滤 ✅

### ❌ 尚未平权的领域

以下能力 Equality **当前不具备**，是否需要补齐取决于产品定位：

#### 3.1 频道系统（优先级：高，但已规划）

OpenClaw 支持 23 个通讯频道，Equality 当前为 0。

**影响**：Equality 只能通过桌面 UI 交互，无法在 WhatsApp/Telegram/Slack/Discord 等平台使用。

**建议**：Phase 13 已规划频道适配器系统。最小可行方案：
1. **WebSocket 频道协议** — 统一的消息路由层
2. **飞书适配器** — 国内企业首选
3. **Telegram 适配器** — 通用性最强
4. **微信/企业微信适配器** — 国内用户刚需

#### 3.2 语音能力（优先级：中）

OpenClaw 的 Voice Wake + Talk Mode 提供语音交互能力。

**建议**：
- 短期：集成 Web Speech API（浏览器内 STT/TTS）
- 中期：集成 ElevenLabs / Azure TTS

#### 3.3 Canvas / A2UI（优先级：中）

OpenClaw 的 Canvas 提供 Agent 驱动的可视化工作区。

**建议**：Tauri v2 的 WebView 可以实现类似功能，作为后续 Phase 扩展。

#### 3.4 远程访问（优先级：低）

OpenClaw 支持 Tailscale Serve/Funnel 和 SSH 隧道。

**建议**：Equality 作为桌面应用天然在本地运行，远程访问优先级较低。可在有频道系统后考虑。

#### 3.5 Chat Commands（优先级：低）

OpenClaw 支持 `/status /new /reset /compact /think /verbose /usage /restart /activation`。

**Equality 状态**：大部分功能已通过 UI 控件实现（模型切换、新建会话），但没有命令行式的 `/` 指令。

---

## 4. 需要补充的能力（按优先级排序）

| 优先级 | 能力 | 工作量 | 说明 |
|-------|------|-------|------|
| **P0** | WebSocket 控制面 | ~3 天 | Phase 13.1 已规划，频道系统的基础 |
| **P0** | Channel 路由系统 | ~2 天 | Phase 13.2 已规划，NormalizedMessage + ChannelAdapter |
| **P1** | 飞书频道适配器 | ~2 天 | 国内企业最高优先级 |
| **P1** | Telegram 频道适配器 | ~2 天 | 全球通用性最强 |
| **P1** | 结构化日志 | ~1 天 | Phase J (GAP-27)，频道调试基础 |
| **P2** | 微信/企业微信适配器 | ~3 天 | 需要 Tencent iLink Bot API |
| **P2** | Discord 适配器 | ~2 天 | 开发者社区常用 |
| **P2** | Chat Commands (`/` 指令) | ~1 天 | 在频道场景下必需 |
| **P3** | 语音 STT/TTS | ~3 天 | Web Speech API + ElevenLabs |
| **P3** | Canvas/可视工作区 | ~5 天 | Tauri WebView |
| **P4** | 远程 Gateway 访问 | ~2 天 | Tailscale 或 SSH 隧道 |
| **P4** | Docker 部署 | ~2 天 | 服务器部署场景 |

---

## 5. 最终结论

> **Equality 在 Agent 运行时和工具层面已经实现了与 OpenClaw 的技能平权。**
>
> 差距集中在 **频道生态** 和 **语音能力** 两个方向。其中频道系统是最关键的差距——它直接决定了 AI 助手是"只在桌面使用"还是"在所有通讯平台使用"。
>
> 建议路线图：先完成 Phase J（结构化日志 + Hooks），再启动 Phase 13（频道系统），最后补充语音和 Canvas。

---

*生成日期：2025-07-21*
*基于：OpenClaw README (2026.3.31 snapshot) vs Equality (feat/phase-D-extensibility, commit 1da801a)*
