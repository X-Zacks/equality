# Equality vs OpenClaw 再对比差距分析 V2

> 基于对 `example/openclaw-2026.3.31` 实际源码的逐模块对比。
> 上次分析（GAP-1~15）已全部实现并合入。本次识别新的差距。

---

## 一、已完成的原始 GAP（确认 ✅）

| GAP | 名称 | 状态 | 实现位置 |
|-----|------|------|----------|
| GAP-1 | 错误反馈自动重试 | ✅ | `runner.ts` — error retry loop |
| GAP-2 | LSP 语义代码理解 | ✅ | `tools/lsp/` — 4 工具 |
| GAP-3 | 工具循环检测增强 | ✅ | `tools/loop-detector.ts` — 四重检测器 |
| GAP-4 | Schema 跨 Provider 兼容 | ✅ | `tools/schema-compat.ts` |
| GAP-5 | bash 执行安全管道 | ✅ | `tools/bash-sandbox.ts` |
| GAP-6 | MCP 协议集成 | ✅ | `tools/mcp/` — stdio/SSE 客户端 |
| GAP-7 | Compaction 分段压缩 | ✅ | `context/compaction.ts` — V2 分块 |
| GAP-8 | 多 Agent 编排 | ✅ | `agent/subagent-manager.ts` |
| GAP-9 | 后台任务注册中心 | ✅ | `tasks/` — registry + events + store |
| GAP-10 | 七层工具策略管道 | ✅ | `tools/policy-pipeline.ts` |
| GAP-11 | 可插拔上下文引擎 | ✅ | `context/` — 5 生命周期 |
| GAP-12 | Provider Failover 策略 | ✅ | `providers/failover-policy.ts` |
| GAP-13 | 写操作精确识别 | ✅ | `tools/mutation.ts` — 468 行 |
| GAP-14 | 交互式 UI 载荷 | ✅ | `agent/interactive.ts` + `InteractiveBlock.tsx` |
| GAP-15 | Prompt 稳定性测试 | ✅ | `__tests__/system-prompt.test.ts` — 6 场景 |

**208 项测试全部通过。**

---

## 二、新发现差距清单

通过逐文件对比 OpenClaw `src/agents/`、`src/security/`、`src/gateway/`、`src/tasks/`、`src/context-engine/`，发现以下 Equality 尚未覆盖的重要能力：

---

### GAP-16 🔴 工作区引导文件加载（Workspace Bootstrap）— P1

**OpenClaw 实现**（`src/agents/workspace.ts`，648 行 + `bootstrap-files.ts`，119 行）：
- 自动扫描工作区根目录的 8 种特殊文件：`AGENTS.md`、`SOUL.md`、`TOOLS.md`、`IDENTITY.md`、`USER.md`、`HEARTBEAT.md`、`BOOTSTRAP.md`、`MEMORY.md`
- 文件内容注入到 system prompt 中，让 Agent 具备项目级上下文
- **安全机制**：
  - boundary-safe 读取（`openBoundaryFile`），防止路径逃逸
  - inode/dev/size/mtime 缓存，避免 TOCTOU
  - 最大 2MB 限制
  - frontmatter 自动剥离
- 工作区初始化模板（从 docs/reference/templates 拷贝）
- workspace-state.json 状态跟踪

**Equality 现状**：
- `system-prompt.ts` 仅注入 workspaceDir 路径字符串
- 不读取工作区中的任何 `.md` 配置文件
- Agent 对项目结构/惯例/身份完全不知情

**影响**：用户无法通过放置 `AGENTS.md` 来定制 Agent 行为，这是 OpenClaw 的核心可定制化机制。

---

### GAP-17 🔴 子 Agent 孤儿恢复（Subagent Orphan Recovery）— P2

**OpenClaw 实现**（`subagent-orphan-recovery.ts`，315 行）：
- Gateway 重启后自动扫描所有 `running` 状态的子 Agent 会话
- 生成合成 resume 消息，让中断的子 Agent 从上次停下的地方继续
- 与 `session-subagent-reactivation.ts` 配合：已完成的子 Agent 可重新激活
- 级联恢复（父→子→孙）

**Equality 现状**：
- `TaskRegistry` 有 `running` → `lost` 转换（`recoverOrphans()`）
- 但只是标记为 lost，**不自动恢复执行**
- 服务重启后所有运行中的子任务丢失

**影响**：长时间运行任务的可靠性——服务重启意味着工作丢失。

---

### GAP-18 🟡 任务 SQLite 持久化（Task Store Upgrade）— P2

**OpenClaw 实现**（`task-registry.store.sqlite.ts`，508 行）：
- WAL 模式 SQLite，支持并发读
- 索引优化（by_status, by_session, by_parent）
- 原子操作（INSERT OR REPLACE）
- 自动迁移列（`ALTER TABLE ADD COLUMN`）
- 大量任务性能稳定

**Equality 现状**：
- `JsonTaskStore`：全量 JSON 读写（`task-snapshot.json`）
- 适合 < 1000 任务，无索引
- 并发安全性弱（file write race condition）

**影响**：任务量增长后性能下降；多进程并发时数据损坏风险。

---

### GAP-19 🔴 外部内容安全包装（External Content Security）— P1

**OpenClaw 实现**（`src/security/external-content.ts`，364 行）：
- **注入检测**：14 种 prompt injection 正则模式
- **安全包装**：外部内容用随机 boundary ID 的 `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` 标记包裹
- 安全警告前置：明确告知 LLM 此内容不可信
- 来源标记（email/webhook/api/browser/web_search 等）
- 嵌套包装检测（防止包装欺骗）

**Equality 现状**：
- `tools/bash-sandbox.ts` 有路径沙箱
- `tools/policy-pipeline.ts` 有工具访问控制
- **但对外部内容（web_search 结果、API 响应）无安全包装**

**影响**：通过 web 搜索或 API 返回的恶意内容可能直接注入 LLM 上下文。

---

### GAP-20 🔴 API Key 轮换执行（API Key Rotation）— P2

**OpenClaw 实现**（`api-key-rotation.ts`，73 行）：
- `executeWithApiKeyRotation<T>`：按 key 列表依次尝试
- 去重 + 空值过滤
- `shouldRetry` 自定义判断（默认：rate limit error 时重试下一个 key）
- `onRetry` 回调（日志/通知）
- `collectProviderApiKeysForExecution`：从环境变量收集所有可用 key

**Equality 现状**：
- `FallbackProvider` 在 provider 级别做 failover
- 但同一 provider 内只用单个 API key
- rate limit 时只能切换 provider，不能切换 key

**影响**：使用多 key 策略的用户无法充分利用配额。

---

### GAP-21 🔴 工具目录与配置文件（Tool Catalog + Profiles）— P2

**OpenClaw 实现**（`tool-catalog.ts`，359 行）：
- 完整的工具元数据注册（id/label/description/sectionId）
- **工具 Profile** 系统：`minimal` / `coding` / `messaging` / `full`
- Profile 策略（allow/deny 列表）
- 按 section 分组（Files/Runtime/Web/Memory/Sessions/UI/Messaging/Automation 等）
- 支持"OpenClaw 组"（第三方 OpenAI 兼容 API 暴露的工具子集）

**Equality 现状**：
- `tools/registry.ts` 平铺注册，无分组
- 无 profile 概念
- 策略管道有 7 层，但工具本身无元数据

**影响**：无法按场景（编码/消息/最小）动态调整可用工具集。

---

### GAP-22 🔴 安全审计框架（Security Audit）— P3

**OpenClaw 实现**（`src/security/audit.ts`，1505 行）：
- 完整安全审计报告（info/warn/critical 三级）
- 检查项：配置权限、文件系统权限、沙箱状态、Gateway 探测、Channel 安全、exec 审批
- `SecurityAuditFinding` 结构化输出（checkId/severity/title/detail/remediation）
- 深度模式（连接 Gateway 探测/Docker 检查）
- CLI `/security-audit` 命令

**Equality 现状**：
- 有 bash-sandbox 和 policy-pipeline
- 无统一的安全审计命令/报告

**影响**：用户无法一键检查当前配置的安全状况。

---

### GAP-23 🟡 缓存追踪/LLM 诊断（Cache Trace）— P3

**OpenClaw 实现**（`cache-trace.ts`，261 行）：
- 7 个追踪阶段：`session:loaded` → `session:sanitized` → `session:limited` → `prompt:before` → `prompt:images` → `stream:context` → `session:after`
- 记录完整的 LLM 调用载荷（messages/system/options）
- 消息指纹（SHA-256 digest）
- 敏感数据脱敏（`sanitizeDiagnosticPayload`）
- 排队文件写入（`QueuedFileWriter`，不阻塞主线程）
- 环境变量开关 `OPENCLAW_CACHE_TRACE=1`

**Equality 现状**：
- `console.log` / `console.warn` 散落式日志
- 无结构化 LLM 调用追踪
- 调试 prompt 问题时需手动加断点

**影响**：排查"为什么 LLM 给了错误回答"极其困难。

---

### GAP-24 🔴 Agent 作用域配置（Agent Scoping）— P2

**OpenClaw 实现**（`agent-scope.ts`，355 行）：
- 多 Agent 定义（`config.agents.list`）
- 每个 Agent 独立配置：workspace / model / thinking / skills / tools / sandbox / heartbeat / identity
- session key 解析 → 自动匹配 Agent 配置
- 默认 Agent fallback

**Equality 现状**：
- 单一全局配置（所有 session 共享同一 model/tools/skills）
- SubagentManager 虽然支持 spawn，但子 Agent 继承父配置

**影响**：无法为不同场景（编码/运维/翻译）定义不同 Agent 身份。

---

### GAP-25 🔴 上下文窗口大小守卫（Context Window Guard）— P1

**OpenClaw 实现**（`context-window-guard.ts`，76 行）：
- 按 provider + model 组合解析 context window 大小
- 配置文件覆盖 > 模型元数据 > 默认值 链式解析
- 影响 compaction 阈值、tool result 截断、image 预算

**Equality 现状**：
- `DefaultContextEngine` 使用硬编码 `contextWindowTokens`（从 `RunAttemptParams` 传入）
- 无 per-model 自动解析
- 用户切换模型时可能使用错误的 context window 值

**影响**：不同模型的上下文窗口差异巨大（4K~2M），使用错误值会导致截断不足或过度。

---

### GAP-26 🟡 会话级 Tool Result 持久化守卫（Session Tool Result Guard）— P2

**OpenClaw 实现**（`session-tool-result-guard.ts`，290 行）：
- **持久化时截断**：保存到文件/DB 前，将超大 tool result 缩减
- 与运行时截断独立（`truncation.ts` 是运行时截断）
- 保护存储空间 + 加速历史加载
- 可配置阈值

**Equality 现状**：
- `truncation.ts` 在运行时截断 tool result
- `session/persist.ts` 全量保存消息历史
- 巨大的 tool result 会膨胀历史文件

**影响**：长会话历史文件可能增长到 MB 级，加载变慢。

---

## 三、差距优先级矩阵

| 优先级 | GAP | 名称 | 工作量 | 影响 |
|--------|-----|------|--------|------|
| **P1** | GAP-16 | 工作区引导文件 | 中 | Agent 上下文定制化核心 |
| **P1** | GAP-19 | 外部内容安全包装 | 小 | 安全关键 |
| **P1** | GAP-25 | Context Window Guard | 小 | 截断/压缩准确性 |
| **P2** | GAP-17 | 子 Agent 孤儿恢复 | 中 | 长任务可靠性 |
| **P2** | GAP-18 | Task SQLite 持久化 | 中 | 规模化 |
| **P2** | GAP-20 | API Key 轮换 | 小 | 配额利用 |
| **P2** | GAP-21 | 工具目录/Profile | 中 | 场景适配 |
| **P2** | GAP-24 | Agent Scoping | 中 | 多角色支持 |
| **P2** | GAP-26 | Tool Result 持久化守卫 | 小 | 存储效率 |
| **P3** | GAP-22 | 安全审计框架 | 大 | 安全可视化 |
| **P3** | GAP-23 | 缓存追踪/LLM 诊断 | 中 | 调试体验 |

---

## 四、建议实施路线图

### Phase G：项目感知与安全（GAP-16, GAP-19, GAP-25）
**主题**：让 Agent 真正理解项目、安全处理外部内容、正确管理上下文窗口

1. **G1 — Workspace Bootstrap**：扫描并注入 `AGENTS.md` / `SOUL.md` 等文件到 system prompt
2. **G2 — External Content Security**：外部内容（web search/API）安全包装 + 注入检测
3. **G3 — Context Window Guard**：per-model context window 自动解析

预估：~6 个文件新增/修改，~12 个测试用例

### Phase H：可靠性与规模（GAP-17, GAP-18, GAP-20, GAP-26）
**主题**：提升长任务可靠性、存储效率、配额利用

4. **H1 — Orphan Recovery**：服务重启后自动恢复中断的子 Agent
5. **H2 — SQLite Task Store**：替换 JSON 快照为 SQLite（better-sqlite3）
6. **H3 — API Key Rotation**：同一 provider 多 key 轮换
7. **H4 — Session Tool Result Guard**：持久化前截断超大 tool result

### Phase I：多角色与诊断（GAP-21, GAP-24, GAP-22, GAP-23）
**主题**：多 Agent 配置、工具分组、安全审计、调试追踪

8. **I1 — Tool Catalog & Profiles**：工具元数据 + minimal/coding/full profile
9. **I2 — Agent Scoping**：per-agent 配置解析
10. **I3 — Security Audit**：统一安全检查报告
11. **I4 — Cache Trace**：结构化 LLM 调用追踪

---

## 五、未纳入的 OpenClaw 特性（暂不追齐）

以下特性由于 Equality 架构差异或优先级原因暂不纳入：

| 特性 | 原因 |
|------|------|
| Channel 系统（Telegram/Discord/Slack 等） | Equality 是桌面应用，不需要消息渠道 |
| Gateway 分布式架构 | Equality 是本地单机架构 |
| Docker/SSH 沙箱后端 | Equality 目标是 Windows 桌面，Docker 不普及 |
| Auth profiles + 设备配对 | 单用户桌面应用，无需多用户认证 |
| OpenAI Responses API 兼容层 | 目前不需要对外暴露 API |
| 执行 Lane 路由 | 单机不需要 cron/nested/subagent lane 分离 |
| 工作区模板初始化 | 可后续跟随 GAP-16 增量添加 |

---

## 六、总结

| 维度 | 已完成 | 新增 | 总计 |
|------|--------|------|------|
| 原始 GAP | 15/15 | — | 15 ✅ |
| 新发现 GAP | — | 11 | 11 待做 |
| P1 | — | 3 | 3（Phase G） |
| P2 | — | 6 | 6（Phase H） |
| P3 | — | 2 | 2（Phase I） |

**建议下一步**：开始 Phase G（GAP-16 + GAP-19 + GAP-25），按 OpenSpec 方法论先写 proposal → design → tasks → specs → implement。
