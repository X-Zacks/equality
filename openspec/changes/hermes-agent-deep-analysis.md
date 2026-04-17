# Hermes-Agent vs Equality 差距分析报告

> 生成日期：2026-04-17 | 基于源码对比

---

## 1. 总览表

| 维度 | Hermes 特性 | Equality 状态 | 差距评级 |
|---|---|---|---|
| **Core Agent Loop** | 迭代预算 + 并行工具执行 | ✅ budget awareness + Promise.allSettled 并行执行 | **CLOSED** |
| **System Prompt** | 模块化拼装、per-model 指引、注入扫描 | ✅ 模块化 buildSystemPrompt + per-model 规则 + bootstrapBlock/purposeBlock | **CLOSED** |
| **Memory** | 冻结快照 + MEMORY.md/USER.md + 安全扫描 + 容量限制 | ✅ SQLite FTS + frozenMemorySnapshot + scanMemoryThreats + embeddings | **CLOSED** |
| **Skills** | auto-create/auto-patch + progressive disclosure + frontmatter | ✅ frontmatter + gallery + scanner + watcher + prompt.ts | **PARTIAL** |
| **Sub-agent Delegation** | 隔离上下文 + 工具屏蔽 + 深度限制 + 并行执行 | ✅ subagent_spawn/list/steer/kill + role-config deny + plan-executor | **PARTIAL** |
| **Context Compression** | LLM 摘要 + tool result 预剪枝 + tail 保护 + 结构化模板 | ✅ compaction.ts + identifier-shield + keepTailCount + 分块摘要 | **CLOSED** |
| **Session Storage** | SQLite WAL + FTS5 跨会话搜索 + schema 迁移 | ✅ better-sqlite3 + session-search.db FTS5 + persist-guard | **CLOSED** |
| **Smart Routing** | intent 检测 + cheap model 路由 | ✅ router.ts Tier light/standard/heavy + @model 覆盖 + FallbackProvider | **CLOSED** |
| **Prompt Caching** | Anthropic cache_control + frozen snapshot | ⚠️ frozenMemorySnapshot 已实现；Anthropic cache_control 未确认 | **PARTIAL** |
| **Security** | 注入检测 + 凭证保护 + URL safety + OSV 检查 | ✅ external-content.ts 14 种注入模式 + memory threat scan + audit.ts | **PARTIAL** |
| **Tool System** | ~60+ 工具 + toolset 组合 + 动态解析 | ✅ 28 builtin + MCP + LSP + policy-pipeline + registry | **PARTIAL** |
| **Cron/定时任务** | cron/scheduler.py + jobs.py | ✅ cron/scheduler.ts + store.ts + types.ts + cron builtin tool | **CLOSED** |

---

## 2. 各维度详细分析

### 2.1 Core Agent Loop — **CLOSED** ✅

| 特性 | Hermes | Equality |
|---|---|---|
| 迭代预算 | `max_iterations` 参数控制 | `runner.ts:708-1094` — budgetState 含 70%/90% 警告 + maxLlmTurns/maxToolCalls |
| 并行工具执行 | ThreadPoolExecutor 并行 | `runner.ts:912` — Promise.allSettled 并发执行，保序汇总 |
| Loop 检测 | 有 | `tools/loop-detector.ts` — argsHash/resultHash 检测 |

**结论**：核心循环已完全对齐。

---

### 2.2 System Prompt — **CLOSED** ✅

| 特性 | Hermes | Equality |
|---|---|---|
| 模块化拼装 | `prompt_builder.py` — identity + platform + memory + skills + context files | `system-prompt.ts` — buildSystemPrompt() 含 skills/bootstrap/purpose/agentIdentity |
| Per-model 指引 | TOOL_USE_ENFORCEMENT_MODELS / GOOGLE/OPENAI guidance | system-prompt.ts 内嵌 PowerShell 规则 + 执行证据规则 |
| 上下文文件注入 | .hermes.md / AGENTS.md / SOUL.md + 注入扫描 | bootstrapBlock (workspace-bootstrap.ts) |
| 注入扫描 | `_scan_context_content()` 14 种威胁模式 | security/external-content.ts 14 种模式 |

---

### 2.3 Memory — **CLOSED** ✅

| 特性 | Hermes | Equality |
|---|---|---|
| 存储后端 | MEMORY.md / USER.md 纯文件 | `memory/db.ts` — SQLite + FTS5 + embeddings 混合搜索 |
| 冻结快照 | Session 开始时冻结，mid-session 不更新 prompt | `frozenMemorySnapshot` 字段（session-snapshot.ts） |
| 安全扫描 | `_MEMORY_THREAT_PATTERNS` 注入检测 | `scanMemoryThreats()` — prompt_injection 等 |
| 容量限制 | 字符上限（非 token） | `memoryList(limit=20)` + DB 分页 |
| Hybrid Search | 无（纯文本匹配） | ✅ `hybrid-search.ts` FTS5 + cosine similarity embedding |

**Equality 在此维度超越 Hermes**（embedding hybrid search）。

---

### 2.4 Skills — **PARTIAL** ⚠️

| 特性 | Hermes | Equality | 状态 |
|---|---|---|---|
| SKILL.md frontmatter | ✅ YAML 解析 + platform/prerequisites | ✅ `frontmatter.ts` | CLOSED |
| Progressive disclosure | ✅ skills_list (metadata) → skill_view (full) | ⚠️ loader.ts 一次性全加载到 prompt | **OPEN** |
| Auto-create skill | ✅ `skill_manage` action=create | ⚠️ 未见 auto-create 工具 | **OPEN** |
| Auto-patch skill | ✅ `skill_manage` action=update | ⚠️ 未见 auto-patch 工具 | **OPEN** |
| Gallery/Hub | ✅ `skills_hub.py` + `skills_sync.py` | ✅ `gallery.ts` | CLOSED |
| Watcher | 无 | ✅ `watcher.ts` 热重载 | CLOSED (超越) |

**关键差距**：Equality 缺少 skill 的 auto-create 和 auto-patch（让 agent 自动沉淀经验为新 skill）。Progressive disclosure（先展示摘要，按需加载全文）也未实现。

---

### 2.5 Sub-agent Delegation — **PARTIAL** ⚠️

| 特性 | Hermes | Equality | 状态 |
|---|---|---|---|
| 子 agent 生成 | ✅ `delegate_tool.py` | ✅ `subagent-spawn.ts` | CLOSED |
| 隔离上下文 | ✅ 全新对话 + 独立 task_id | ✅ 独立 session | CLOSED |
| 工具屏蔽 | ✅ `DELEGATE_BLOCKED_TOOLS` frozenset | ✅ `role-config.ts` toolDenyPrefixes | CLOSED |
| 深度限制 | ✅ `MAX_DEPTH = 2` | ⚠️ 未在 subagent-spawn.ts 中找到 depth 限制 | **OPEN** |
| 并行子任务 | ✅ `ThreadPoolExecutor` MAX_CONCURRENT=3 | ✅ `plan-executor.ts` PlanExecutor 并行节点 | CLOSED |
| Steer/Kill | 无 | ✅ `subagent-steer.ts` / `subagent-kill.ts` | CLOSED (超越) |

**关键差距**：缺少递归 delegation 深度限制，可能导致无限递归。

---

### 2.6 Context Compression — **CLOSED** ✅

| 特性 | Hermes | Equality |
|---|---|---|
| LLM 摘要压缩 | ✅ ContextCompressor + 结构化 summary 模板 | ✅ `compaction.ts` + compactChunked/compactSingle |
| Tool result 预剪枝 | ✅ 在 LLM 摘要前先清理旧 tool output | ✅ `default-engine.ts` TOOL_RESULT_COMPACT_PLACEHOLDER |
| Tail 保护 | ✅ token budget tail protection | ✅ `findKeepTailCount()` |
| Identifier 保护 | 无 | ✅ `identifier-shield.ts` 提取+验证标识符 (超越) |
| 迭代摘要 | ✅ iterative summary update | ⚠️ 未确认是否迭代更新 |

---

### 2.7 Session Storage — **CLOSED** ✅

| 特性 | Hermes | Equality |
|---|---|---|
| SQLite | ✅ WAL mode + schema 迁移 | ✅ better-sqlite3 |
| FTS5 | ✅ messages_fts | ✅ session_turns_fts |
| Session search 工具 | ✅ `session_search_tool.py` | ✅ `builtins/session-search.ts` |
| 跨会话搜索 | ✅ | ✅ `searchSessions()` |
| Title 生成 | ✅ title_generator.py | ✅ `title-gen.ts` |

---

### 2.8 Smart Routing — **CLOSED** ✅

| 特性 | Hermes | Equality |
|---|---|---|
| Intent 检测 | ✅ 关键词匹配 simple vs complex | ✅ `router.ts` Tier: light/standard/heavy |
| Cheap model | ✅ 可配 cheap_model provider | ✅ MODEL_TIERS 含 gpt-4o/deepseek 等 |
| @model 覆盖 | 无 | ✅ @model 语法 (超越) |
| Fallback 链 | 无 | ✅ `fallback.ts` FallbackProvider + `failover-policy.ts` (超越) |
| Key rotation | 无 | ✅ `key-rotation.ts` (超越) |

---

### 2.9 Prompt Caching — **PARTIAL** ⚠️

| 特性 | Hermes | Equality | 状态 |
|---|---|---|---|
| Frozen snapshot 模式 | ✅ mid-session 不更新 system prompt | ✅ frozenMemorySnapshot | CLOSED |
| Anthropic cache_control | ✅ `prompt_caching.py` apply_anthropic_cache_control | ⚠️ 未见显式 cache_control breakpoint | **OPEN** |

---

### 2.10 Security — **PARTIAL** ⚠️

| 特性 | Hermes | Equality | 状态 |
|---|---|---|---|
| Prompt injection 检测 | ✅ context file + memory 双重扫描 | ✅ external-content.ts + memory/db.ts | CLOSED |
| 凭证文件保护 | ✅ `credential_files.py` | ⚠️ 未见专门凭证文件保护 | **OPEN** |
| Tool approval 流程 | ✅ `approval.py` | ✅ `policy-pipeline.ts` requiresApproval | CLOSED |
| URL 安全检查 | ✅ `url_safety.py` | ⚠️ 未见 URL safety 模块 | **OPEN** |
| 代码执行沙箱 | ✅ `terminal_tool.py` 隔离 VM | ✅ `bash-sandbox.ts` | CLOSED |
| OSV 漏洞检查 | ✅ `osv_check.py` | ⚠️ 未见 | **OPEN** |

---

### 2.11 Tool System — **PARTIAL** ⚠️

| 特性 | Hermes | Equality | 状态 |
|---|---|---|---|
| 工具总数 | ~60+ (含 HA/RL/browser/TTS 等) | 28 builtin + MCP 扩展 | **OPEN** (数量差距) |
| Toolset 组合 | ✅ toolsets.py TOOLSETS + includes 组合 | ⚠️ 无 toolset 分组概念 | **OPEN** |
| 动态解析 | ✅ resolve_toolset 递归解析 | ⚠️ 扁平 registry | **OPEN** |
| MCP 支持 | ✅ `mcp_tool.py` | ✅ `tools/mcp/` | CLOSED |
| Browser 自动化 | ✅ 11 个 browser 工具 | ✅ `browser.ts` | CLOSED |
| Home Assistant | ✅ 4 个 HA 工具 | ❌ | OPEN |
| RL Training | ✅ 10 个 RL 工具 | ❌ | OPEN (低优先级) |
| Clarify 工具 | ✅ 主动向用户提问澄清 | ❌ | OPEN |
| Execute Code | ✅ 独立代码执行沙箱 | ⚠️ bash 工具覆盖 | PARTIAL |

---

### 2.12 Cron/定时任务 — **CLOSED** ✅

| 特性 | Hermes | Equality |
|---|---|---|
| 调度引擎 | cron/scheduler.py + jobs.py | cron/scheduler.ts + store.ts |
| Cron 工具 | ✅ cronjob | ✅ builtins/cron.ts |

---

## 3. 差距优先级列表

### P0 — 核心体验影响

| # | 差距 | 说明 | 相关文件 |
|---|---|---|---|
| 1 | **Skill auto-create / auto-patch** | Agent 无法自动沉淀经验为 skill，是 Hermes 核心差异化功能 | Hermes: `tools/skills_tool.py` `skill_manage` |
| 2 | **Sub-agent 深度限制** | 无 MAX_DEPTH 保护，存在无限递归风险 | Hermes: `tools/delegate_tool.py:43` MAX_DEPTH=2 |
| 3 | **Skills progressive disclosure** | 当前全量加载 skill 到 prompt 浪费 token，应先摘要后按需加载 | Hermes: `skills_list` → `skill_view` 两级 |

### P1 — 安全 & 成本优化

| # | 差距 | 说明 | 相关文件 |
|---|---|---|---|
| 4 | **Anthropic prompt cache_control** | 长会话下 token 费用缺乏优化 | Hermes: `agent/prompt_caching.py` |
| 5 | **凭证文件保护** | 阻止读取 .env/.netrc/.pgpass 等 | Hermes: `tools/credential_files.py` |
| 6 | **URL 安全检查** | 拦截恶意 URL 在 browser/web 工具中 | Hermes: `tools/url_safety.py` |
| 7 | **OSV 漏洞检查** | 安装依赖前检查已知漏洞 | Hermes: `tools/osv_check.py` |

### P2 — 完善 & 扩展

| # | 差距 | 说明 |
|---|---|---|
| 8 | **Toolset 分组机制** | Hermes 的 toolset 组合模式更灵活，便于场景化裁剪 |
| 9 | **Clarify 工具** | 主动向用户提问澄清，减少猜测 |
| 10 | **迭代摘要更新** | Context compression 多次压缩时保持 summary 连续性 |
| 11 | **Home Assistant 集成** | IoT 智能家居控制（垂直场景，低优先级） |

---

## 4. Equality 超越 Hermes 的能力

| 能力 | Equality 文件 | 说明 |
|---|---|---|
| **Embedding hybrid search** | `memory/hybrid-search.ts` | FTS5 + cosine similarity，Hermes 仅纯文本 |
| **Identifier shield** | `context/identifier-shield.ts` | compaction 时保护关键标识符不丢失 |
| **@model 覆盖语法** | `providers/router.ts` | 用户可在消息中直接 @model 指定 |
| **Fallback + Key rotation** | `providers/fallback.ts` + `key-rotation.ts` | 多 provider 自动降级 + API key 轮换 |
| **Subagent steer/kill** | `tools/builtins/subagent-steer.ts` | 运行中子 agent 的实时控制 |
| **Skill watcher** | `skills/watcher.ts` | 文件系统热重载 |
| **LSP 工具 (4个)** | `tools/builtins/lsp-*.ts` | hover/definition/references/diagnostics |
| **Plan DAG** | `orchestration/plan-dag.ts` | 有向无环图任务编排 |
| **Cost ledger** | `cost/ledger.ts` | 实时费用追踪 + 格式化报告 |
| **Copilot auth** | `providers/copilot-auth.ts` | GitHub Copilot 集成认证 |

---

## 5. 统计总结

- **12 个维度**中：**7 个 CLOSED**、**5 个 PARTIAL**、**0 个完全 OPEN**
- **P0 差距**：3 项（skill auto-create、depth limit、progressive disclosure）
- **P1 差距**：4 项（prompt caching、凭证保护、URL safety、OSV）
- **P2 差距**：4 项（toolset 分组、clarify、迭代摘要、HA）
- **Equality 超越项**：10 项
