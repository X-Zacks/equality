# Equality vs Hermes-Agent 差异分析报告 (2026-04-17)

> 基于 Hermes-Agent 源码 (`example/hermes-agent/`) 与 Equality 当前 `master` 分支的逐模块对比。  
> 上次分析日期: 2025 年初 | 本次更新: 2026-04-17

---

## 0. 概览

| 指标 | Hermes-Agent | Equality |
|------|-------------|----------|
| 语言 | Python (~763 个 .py 文件) | TypeScript (~220 个 .ts 文件) |
| 核心文件 | `run_agent.py` (9,611 行) | `agent/runner.ts` (~1,100 行) |
| 工具数 | 60+ (含 browser, vision, TTS, MoA 等) | 28 内置工具 |
| 平台 | CLI + 14 网关 (Telegram/Discord/Slack/飞书/企微...) | Desktop (Tauri) 单平台 |
| 测试 | ~3,000+ pytest | ~1,300 assertions (node:test) |

### 上次报告后 Equality 新增的关键能力

| 能力 | Phase | 说明 |
|------|-------|------|
| 迭代预算 + 压力警告 | O1.2 | `maxLlmTurns=50`, `maxToolCalls=50`, 70%/90% warning |
| 冻结记忆快照 | O1 | `session.frozenMemorySnapshot` |
| 上下文压缩 | N6 | `transcript-compact.ts` 消息数阈值触发 |
| 会话搜索 | O4 | SQLite FTS5 + `session_search` 工具 |
| 会话级 Purpose | 本次 | 替代 SOUL/IDENTITY/USER.md |
| LSP 工具 | B | hover/definition/references/diagnostics |
| Codebase Search | B | 本地代码语义搜索 |
| Skill Gallery | K | 远程安装 + managed 目录 |
| Skill Watcher | K | 文件变更自动热重载 |
| FallbackProvider | 8 | 模型降级链 + key rotation |
| Cost Ledger | J | 每消息费用追踪 |
| 子代理 steer/kill | E | 运行时干预子代理 |
| Session Purpose | 本次 | `inferPurpose()` 自动推断 + system prompt 注入 |

---

## 1. 维度对比总表

| # | 维度 | Hermes | Equality | 状态 | 差距 |
|---|------|--------|----------|------|------|
| 1 | **核心循环** | 同步 while + IterationBudget + 并行工具 (8 worker) | 异步 SSE + budget (50/50) + 压力警告 + Promise.allSettled 并行 | 🟢 CLOSED | |
| 2 | **System Prompt** | 991 行, 按模型分支引导, 提示注入扫描 | ~320 行, 模块化 + 行为准则 + 14 种注入检测 | 🟢 CLOSED | |
| 3 | **记忆** | 冻结快照 + 8 插件 + 容量限制 + 安全扫描 | 冻结快照 ✅ + embedding hybrid search + THREAT_PATTERNS 扫描 | 🟢 CLOSED | Equality 超越 (embedding) |
| 4 | **Skills 系统** | 自动创建/patch/hub/sync/guard + 3 层渐进披露 | O3 沉淀引导 + Gallery + watcher + scanner | 🟡 PARTIAL | 无渐进式披露 (全量注入 prompt) |
| 5 | **子代理** | 隔离 + blocked tools + MAX_DEPTH=2 + 3 并行 | steer/kill + toolDenyPrefixes 封锁 + plan-executor 并行 | 🟡 PARTIAL | 无显式深度限制 (MAX_DEPTH) |
| 6 | **上下文压缩** | LLM 摘要 + 预剪枝 + 尾部 token 预算 + 迭代摘要 | compaction.ts 50% 阈值 + LLM 分块摘要 + identifier shield | 🟢 CLOSED | Equality 超越 (identifier shield) |
| 7 | **会话搜索** | SQLite FTS5 + LLM 摘要 | SQLite FTS5 + session_search 工具 | 🟢 CLOSED | 无 LLM 摘要 (小差距) |
| 8 | **智能路由** | 关键词启发式 cheap model routing | router.ts Tier light/standard/heavy + @model + Fallback | 🟢 CLOSED | Equality 超越 (@model + fallback) |
| 9 | **Prompt 缓存** | 冻结快照 + TTL + 强保护约束 | 冻结快照 ✅ | 🟢 CLOSED | 基本等价 |
| 10 | **安全防护** | 6 层 (注入检测, 记忆扫描, 工具审批, SSRF, 凭证) | 14 种注入检测 + memory threat scan + policy-pipeline + audit + bash-sandbox | 🟢 CLOSED | |
| 11 | **定时任务** | 自然语言 cron + 跨平台投递 | cron 类型定义 + cron 工具 | 🟢 CLOSED | |
| 12 | **工具系统** | 60+ 工具, registry 模式, 并行安全分类 | 28 builtin + MCP + LSP + Promise.allSettled 并行 | 🟡 PARTIAL | 工具数量差距 (非核心) |
| 13 | **Mixture-of-Agents** | MoA 工具 (多 LLM 协作推理) | ❌ 无 | 🔴 OPEN | 全新能力 |
| 14 | **Skills Hub** | GitHub 源 + quarantine + audit + taps + 安全扫描 | Gallery (HTTP fetch) | 🟡 PARTIAL | 无安全扫描/quarantine |
| 15 | **Profiles 多实例** | 完全隔离的 profile (config/memory/skills) | ❌ 无 | 🔴 OPEN | 非核心需求 |

### 统计

- 🟢 CLOSED: 10 个 (核心循环, System Prompt, 记忆, 上下文压缩, 会话搜索, 智能路由, Prompt 缓存, 安全防护, 定时任务, Purpose)
- 🟡 PARTIAL: 3 个 (Skills 渐进披露, 子代理深度限制, 工具数量)
- 🔴 OPEN: 2 个 (MoA, Profiles — 非核心)

---

## 2. Equality 超越 Hermes 的领域

| 能力 | 说明 |
|------|------|
| **Embedding Hybrid Search** | 记忆搜索用向量嵌入 + 关键词混合, Hermes 只有 FTS5 |
| **LSP 代码智能** | hover/definition/references/diagnostics, Hermes 无 |
| **Codebase Search** | 本地代码语义搜索, Hermes 依赖 terminal grep |
| **Tauri 桌面 UI** | 原生桌面体验 + React 富交互, Hermes 是 CLI |
| **@model 语法** | 对话中切换模型, Hermes 需要配置文件 |
| **子代理 steer/kill** | 运行时干预, Hermes 只能等完成 |
| **Cost Ledger** | 每消息费用追踪, Hermes 无 (只有 usage_pricing 估算) |
| **Skill Watcher** | 文件变更自动热重载, Hermes 需要重启 |
| **会话级 Purpose** | 自动推断会话目标, Hermes 无此概念 |
| **Copilot Provider** | 直接对接 GitHub Copilot 认证, 零成本 |

---

## 3. 关键差距详析

### 3.1 🟡 P0: Purpose 持久化

**问题**: `SessionPurpose` 只存在内存中的 `Session` 对象里，服务重启后丢失。

**建议**: 在 `persist.ts` 中序列化 purpose，在 `store.ts` 中恢复。

### 3.2 🟡 P0: Skills 渐进式披露 (Progressive Disclosure)

**Hermes 实现** (`tools/skills_tool.py`):
- **Tier 1**: `skills_list` 只返回 name + description (省 token)
- **Tier 2**: `skill_view(name)` 按需加载完整指令
- **Tier 3**: `skill_view(name, "references/api.md")` 加载附件

**Equality 现状**: 所有 skill 内容全量注入 system prompt, 浪费 token。Skill 沉淀已有 (Phase O3 system prompt 引导)。

**建议**: 改为 Tier 1 元数据注入 + Tier 2 按需 `skill_view` 工具。

### 3.3 🟡 P0: 子代理深度限制

**Hermes 实现** (`tools/delegate_tool.py`): `MAX_DEPTH = 2`

**Equality 现状**: 已有 `toolDenyPrefixes: ['subagent_']` 防止子代理递归委派，但无显式深度计数器。

**建议**: 添加 `MAX_SUBAGENT_DEPTH` 检查作为额外安全网。

---

## 4. Hermes 新增能力 (上次报告后)

自上次分析以来, Hermes 新增了以下值得关注的功能:

| 功能 | 文件 | 说明 |
|------|------|------|
| **Skills Hub** | `tools/skills_hub.py` (2,708 行) | GitHub 源适配器 + 安全隔离 (quarantine/audit/taps) |
| **Skills Guard** | `tools/skills_guard.py` | Skill 安全扫描 (恶意代码检测) |
| **Skills Sync** | `tools/skills_sync.py` | Manifest-based bundled skill 同步 + 用户修改保护 |
| **Mixture-of-Agents** | `tools/mixture_of_agents_tool.py` | 多 LLM 协作推理 |
| **Credential Pool** | `agent/credential_pool.py` | 多 API key 轮转 |
| **MCP OAuth** | `tools/mcp_oauth.py` | MCP 服务器 OAuth 认证 |
| **Copilot ACP** | `agent/copilot_acp_client.py` | Copilot Agent Communication Protocol |
| **Checkpoint Manager** | `tools/checkpoint_manager.py` | 任务检查点保存/恢复 |
| **Browser Camofox** | `tools/browser_camofox.py` | 反检测浏览器自动化 |

---

## 5. 优先级排序建议

### P0 — 立即实施 (影响核心体验)

| # | 项目 | 工作量 | 依赖 |
|---|------|--------|------|
| 1 | Purpose 持久化 (重启不丢失) | 半天 | persist.ts + store.ts |
| 2 | Skills 渐进式披露 (Tier 1 元数据 + Tier 2 按需) | 1 天 | system-prompt.ts + 新工具 |
| 3 | 子代理深度限制 (MAX_DEPTH) | 半天 | subagent-spawn.ts |

### P1 — 近期实施

| # | 项目 | 工作量 | 依赖 |
|---|------|--------|------|
| 4 | Anthropic prompt cache_control | 1 天 | providers/ |
| 5 | Mixture-of-Agents (MoA) | 2 天 | 新工具 |
| 6 | Checkpoint Manager (任务断点恢复) | 2 天 | session/ |

### P2 — 长期规划

| # | 项目 | 工作量 |
|---|------|--------|
| 8 | Skills Hub 安全 (quarantine + guard) | 3 天 |
| 9 | 智能模型路由 (cheap model for chat) | 1 天 |
| 10 | Mixture-of-Agents | 2 天 |
| 11 | Checkpoint Manager (任务断点恢复) | 2 天 |

---

## 6. 结论

上次分析时 Equality 有 **7 个🔴大差距**。经过持续迭代, 现在:
- **10 个已完全关闭** (迭代预算, 冻结快照, 并行工具, LLM 压缩, 会话搜索, 智能路由, 安全扫描, Prompt 缓存, Skill 沉淀, 定时任务)
- **3 个部分关闭** (Skills 渐进披露, 子代理深度, 工具数量)
- **2 个新差距** (MoA, Profiles — 均为非核心)
- **1 个自身 bug** (Purpose 持久化缺失)

**最关键的剩余差距是 Skills 渐进式披露**。加上 Purpose 持久化和子代理深度限制，合并为 Phase T 实施。
