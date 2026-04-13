# Eigent vs Equality 深度对比分析报告（v2）

> 生成日期: 2026-04-13
> 分析版本: Eigent v0.0.89 / Equality v0.2.1
> 方法论: 完整源码扫描 + 40 份 OpenSpec 设计文档 + 11 份核心 Spec + 2801 行 DESIGN_PHILOSOPHY

---

## 一、项目概览

| 维度 | **Eigent** | **Equality** |
|------|-----------|-------------|
| **定位** | 多智能体工作流桌面应用（"Open Source Cowork"） | AI 代理的神经系统（感知→记忆→思考→行动→表达闭环） |
| **核心理念** | Multi-Agent Workforce — 专职 Agent 并行 | 单 Agent 深度循环 + DAG 多角色编排 + Skill 自动沉淀 |
| **开源协议** | Apache 2.0 | 自研（基于 OpenClaw 架构重建） |
| **桌面框架** | **Electron** v33 | **Tauri** v2 (Rust) |
| **后端语言** | **Python** (FastAPI + CAMEL-AI) | **TypeScript** (Node.js 22 + Fastify) |
| **前端** | React 18 + Zustand + Tailwind + Radix UI | React 19 + 原生 CSS + Tauri API |
| **目标用户** | 全球企业用户 | 中国大陆 Windows 用户（PRC 模型优先） |
| **包管理** | npm 单仓 | pnpm workspace monorepo（@equality/core + @equality/desktop） |
| **代码规模** | 前端 ~3600 行 chatStore + 3639 行 Electron main | Core ~130 个 TS 文件 / 25 个模块目录 / 4 个 SQLite 数据库 |

---

## 二、架构对比

### 2.1 整体架构

```
Eigent 架构（3 层）:
┌──────────────────────────────────────────────────────┐
│              Electron Main (3639 行)                   │
│  Python Backend 进程管理 · CDP Browser Pool           │
│  文件系统 / IPC / 自动更新 · WebView Manager          │
└──────────────┬────────────────────┬──────────────────┘
               │ IPC                │ HTTP/SSE
               ▼                    ▼
┌─────────────────────┐  ┌──────────────────────────────┐
│  React Frontend      │  │  Python Backend (FastAPI)     │
│  Vite + Zustand      │  │  CAMEL-AI Workforce          │
│  React Flow          │  │  Agent Factory (8 角色)       │
│  Tailwind + Radix    │  │  35+ Toolkit                 │
│  i18next (4 语言)    │  │  MCP Integration             │
└─────────────────────┘  └──────────────────────────────┘
                                    │ (企业部署可选)
                                    ▼
                         ┌────────────────────────┐
                         │  Server (FastAPI)       │
                         │  PostgreSQL + Redis     │
                         │  Celery + Alembic       │
                         │  OAuth 2.0 / SSO        │
                         └────────────────────────┘

Equality 架构（三层 + 26 个子系统）:
┌──────────────────────────────────────────────────────────┐
│                 Tauri Shell (Rust, ~536 行)                │
│  gateway.rs — Core 子进程管理(崩溃自动重启×3)            │
│  proxy.rs  — SSE 代理(reqwest byte_stream → emit)        │
│  tray.rs   — 系统托盘(左键恢复/右键菜单)                 │
│  window.rs — 窗口管理(关闭→隐藏到托盘)                   │
└───────────────────┬──────────────────────────────────────┘
                    │ Tauri Commands / HTTP / SSE Events
                    ▼
┌──────────────────────┐   ┌────────────────────────────────┐
│   React Frontend      │   │   Node.js Core (Fastify, 1185行)│
│   Vite + CSS Variables│   │                                 │
│   900×640 标准窗口    │   │   ┌── Agent Runtime ──────────┐ │
│   Markdown + Highlight│   │   │ Runner (1037行 + 网络重试) │ │
│   6-Tab Settings      │   │   │ SubagentManager            │ │
│   MemoryTab (524行)   │   │   │ Stream Decorators (洋葱)   │ │
│   SessionPanel (298行)│   │   │ InteractivePayload         │ │
│   DiffPreview         │   │   └────────────────────────────┘ │
│   MentionPicker       │   │   ┌── Context Engine ─────────┐ │
│   InteractiveBlock    │   │   │ DefaultEngine + Compressor │ │
│   TaskProgressBar     │   │   │ Memory Recall (冻结快照)   │ │
│   RoleIcon (5种角色)  │   │   │ Compaction (分段压缩)      │ │
│   StatusBadge (6状态) │   │   └────────────────────────────┘ │
└──────────────────────┘   │   ┌── Tools (28 内置 + MCP) ──┐ │
                           │   │ bash·read/write/edit·grep  │ │
                           │   │ glob·web_fetch/search      │ │
                           │   │ browser (Puppeteer)        │ │
                           │   │ read_image/read_pdf        │ │
                           │   │ cron_create·process        │ │
                           │   │ memory_save/search         │ │
                           │   │ session_search·code_search │ │
                           │   │ 4×LSP + 4×subagent + MCP  │ │
                           │   │ Policy Pipeline (3层)      │ │
                           │   │ Loop Detection (4检测器)   │ │
                           │   │ Bash Sandbox (路径隔离)    │ │
                           │   └────────────────────────────┘ │
                           │   ┌── Memory ──────────────────┐ │
                           │   │ SQLite + FTS5 + embedding  │ │
                           │   │ BM25 + cosine 混合检索     │ │
                           │   │ 去重·威胁扫描·GC·导入导出  │ │
                           │   └────────────────────────────┘ │
                           │   ┌── Orchestration ───────────┐ │
                           │   │ PlanGraph (DAG 拓扑排序)   │ │
                           │   │ PlanExecutor (并发调度)     │ │
                           │   │ 5 角色·超时·重试·暂停      │ │
                           │   └────────────────────────────┘ │
                           │   ┌── 其他子系统 ──────────────┐ │
                           │   │ 6 Provider + Fallback链    │ │
                           │   │ Skills (6级加载+安全扫描)  │ │
                           │   │ Session (队列+FTS5搜索)    │ │
                           │   │ Cost Ledger (SQLite 账本)  │ │
                           │   │ Cron Scheduler             │ │
                           │   │ Task Registry + 孤儿恢复   │ │
                           │   │ Plugin Host (K1 SDK)       │ │
                           │   │ Code Indexer (混合搜索)    │ │
                           │   │ Diagnostics (JSONL 日志)   │ │
                           │   │ Security (审计+防注入+SSRF)│ │
                           │   │ Hooks (6 点位)             │ │
                           │   │ TTS · Media Router         │ │
                           │   │ Bootstrap Graph            │ │
                           │   └────────────────────────────┘ │
                           └────────────────────────────────────┘
```

### 2.2 关键架构差异

| 方面 | Eigent | Equality |
|------|--------|----------|
| **进程模型** | Electron main → spawn Python → HTTP | Tauri Rust → sidecar Node.js SEA → SSE |
| **Agent 运行时** | Python (CAMEL-AI SDK) | TypeScript (自研 runner.ts 1037 行) |
| **多 Agent 方式** | Workforce 预置 8 角色并行 | SubagentManager spawn/steer + DAG Orchestration 5 角色 |
| **任务分解** | LLM 自动 decompose → 分配给专职 Agent | DAG PlanGraph 拓扑排序 → 并发调度 (maxConcurrent=3) |
| **数据库** | PostgreSQL (Server) / 无本地 DB | **4 个 SQLite**：memory.db + cost-ledger.db + session-search.db + tasks.db |
| **认证** | OAuth 2.0 + JWT + Stack Auth | DPAPI 加密 API Key + Token/Password/Trusted-Proxy 四模式 |
| **语言栈** | TS + Python 双语言 | 全 TypeScript 统一栈 |

---

## 三、Agent 系统对比

### 3.1 Eigent 的 Multi-Agent Workforce

基于 CAMEL-AI `Workforce` 类，**8 种预置专职 Agent**：

| Agent | 核心能力 |
|-------|---------|
| `developer_agent` | 代码编写、终端命令、Web 部署、搜索 |
| `browser_agent` | CDP 浏览器控制、网页提取、截图 |
| `document_agent` | 文档创建（Excel/PPTX/Markdown/PDF） |
| `multi_modal_agent` | 图像生成、音频/视频分析 |
| `social_media_agent` | Twitter/LinkedIn/Reddit/Slack/WhatsApp/Notion/Lark |
| `mcp_agent` | 动态 MCP 工具 |
| `task_summary_agent` | 任务总结（纯 LLM） |
| `question_confirm_agent` | 复杂度判断（纯 LLM） |

**执行流程**：用户任务 → 复杂度判断 → 简单直答/复杂分解 → Workforce 并行调度 → Agent 间 NoteTaking 协作 → task_summary 汇总

### 3.2 Equality 的三层 Agent 架构

Equality 不是"单 Agent"——它具备**三层 Agent 能力**：

**第一层：Agent Runner 深度循环（Phase 1）**
- `runAttempt()` 主循环：Context Engine 组装 → LLM 流式调用 → tool_call 分发 → Policy Pipeline 校验 → 执行 → 结果注入 → 循环
- Stream 装饰器洋葱管道（7 个装饰器链式组合）：trimToolCallNames → decodeXaiToolCallArguments → dropThinkingBlocks → sanitizeToolCallIds → downgradeOpenAI → cacheTrace → anthropicPayloadLogger
- 编译错误自动重试（Phase A）：检测 TS/Python/Rust/Go/Java 编译输出 → 注入修复提示 → 自动重试一次
- LLM 网络中断自动重试：ECONNRESET/Connection error 检测 → 2s 延迟 → 重试一次

**第二层：SubagentManager 按需 spawn（Phase E）**
- 4 个子 Agent 工具：`subagent_spawn` / `subagent_list` / `subagent_steer` / `subagent_kill`
- 独立 Session + 独立工具集 + 深度限制
- 孤儿恢复（Phase H）：崩溃后 `lost → queued → running` 自动恢复
- TaskRegistry 管理 7 种任务状态 + SSE 事件推送 + SQLite 持久化

**第三层：DAG 编排引擎（Phase N）**
- `PlanGraph`：DAG 拓扑排序（Kahn 算法）、环检测、关键路径分析
- `PlanExecutor`：并发调度（maxConcurrent=3, maxTotalNodes=50）、暂停/恢复/取消/重试/跳过/steer
- **5 种预置角色**：supervisor / architect / developer / tester / reviewer
- 前端展示：SessionTreeView 父子树 + RoleIcon + StatusBadge + TaskProgressBar

**对比总结：**

| 方面 | Eigent (Workforce) | Equality (Runner + Subagent + DAG) |
|------|-------------------|-------------------------------------|
| 并行方式 | 预置角色天然并行 | DAG 拓扑排序按依赖并发 (maxConcurrent=3) |
| 任务分解 | LLM 自动 decompose | LLM 规划 → DAG 序列化 → 拓扑执行 |
| 角色定义 | 8 种固定角色 | 5 种可配角色 + 自定义 Agent 配置 |
| 工具分配 | 每类 Agent 固定工具集 | Tool Profiles (minimal/coding/messaging/full) 按需组合 |
| 协作通信 | NoteTaking 共享文件 | Session send + 结果注入上下文 |
| 失败处理 | retry + replan | retry + skip + steer + cancel + 孤儿恢复 |
| 人工介入 | Human-in-the-loop 请求输入 | InteractivePayload 按钮/选择器 + 暂停/恢复 |
| 状态追踪 | React Flow 可视化 | TaskProgressBar + StatusBadge + 父子树 |
| 超时控制 | 3600s 全局 | 节点级 + 全局级双层超时 |

---

## 四、工具系统对比

### 4.1 Eigent — 35+ Toolkit (Python)

按功能域组织的 Toolkit 继承体系：
- **代码**: code_execution, terminal, hybrid_browser_python
- **浏览器**: hybrid_browser, craw4ai
- **文件**: file_write, excel, pptx, markitdown
- **搜索**: search, mcp_search
- **社交**: slack, twitter, linkedin, reddit, whatsapp, lark
- **Google**: google_calendar, google_drive_mcp, google_gmail_mcp
- **媒体**: openai_image, audio_analysis, video_analysis, video_download
- **辅助**: human, note_taking, thinking, skill, screenshot, rag
- **部署**: web_deploy
- **自动化**: pyautogui

### 4.2 Equality — 28 内置工具 + MCP + LSP (TypeScript)

| 分类 | 工具 |
|------|------|
| 🔧 Shell | `bash`（沙箱隔离 + 路径提取 + 注入检测） |
| 📁 文件 | `read_file`, `write_file`, `edit_file`（模糊匹配+CRLF兼容）, `glob`, `grep`（正则+上下文行）, `patch` |
| 🌐 网络 | `web_fetch`（SSRF 防护）, `web_search`（Brave→DDG 回退） |
| 🖥️ 浏览器 | `browser`（Puppeteer, ARIA Snapshot 无障碍快照, 多标签） |
| 📷 媒体 | `read_image`（base64→视觉模型）, `read_pdf`（pdfjs 逐页提取） |
| ⏰ 调度 | `cron_create`（cron 表达式/固定间隔/一次性） |
| 🧠 记忆 | `memory_save`, `memory_search` |
| 🔎 搜索 | `session_search`（FTS5 跨会话）, `code_search`（语义+关键词混合） |
| ⚙️ 进程 | `process`, `tree-kill`（跨平台进程树 Kill） |
| 📐 LSP | `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_diagnostics` |
| 🤖 Agent | `subagent_spawn`, `subagent_list`, `subagent_steer`, `subagent_kill` |
| 🔌 MCP | MCP Client Manager — stdio/SSE 传输, 动态发现 → 注册到 ToolRegistry |

**Equality 独有的工具安全体系：**

| 层 | 机制 |
|----|------|
| **Policy Pipeline** | 3 层策略（profile → providerProfile → agentProfile），deny 优先 |
| **Mutation Classification** | 19 个工具精确分类 READ/WRITE/EXEC + bash 命令词启发式 |
| **Bash Sandbox** | 路径隔离 + `..` 遍历检测 + 符号链接逃逸防护 |
| **Loop Detection** | 4 检测器：circuit_breaker(30次) + generic_repeat(warn10/crit20) + poll_no_progress + ping_pong |
| **Tool Result Truncation** | 单条 400K 字符上限 + Context Guard（上下文 75% 预算） |
| **外部内容防注入** | 14 种 prompt injection 模式检测 + 随机 boundary 包裹 |
| **SSRF 防护** | 私有 IP 段 + localhost 阻断 + DNS 解析验证 |

### 4.3 对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| 内置工具数 | 35+ Toolkit | 28 个工具 |
| 安全层数 | 1 层（工具权限） | **7 层**（Pipeline + Mutation + Sandbox + Loop + Truncation + 防注入 + SSRF） |
| MCP | ✅ CAMEL MCPToolkit + 搜索安装 UI | ✅ MCP Client Manager (stdio/SSE) |
| LSP 代码理解 | ❌ | ✅ 4 个 LSP 工具（hover/definition/references/diagnostics） |
| 代码搜索 | ❌ | ✅ `code_search`（语义+关键词混合 RRF 融合） |
| 跨会话搜索 | ❌ | ✅ `session_search`（FTS5 索引全部历史会话） |
| 社交集成 | ✅ 丰富（7 个平台直连） | 渠道适配器架构设计（飞书/钉钉/企微/微信公众号） |
| 浏览器控制 | CDP Pool + Playwright | Puppeteer + ARIA Snapshot |

---

## 五、记忆系统对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **记忆存储** | ❌ 无独立记忆系统 | ✅ SQLite + FTS5 + embedding BLOB 向量列 |
| **检索方式** | 会话历史拼接 (`build_conversation_context`) | **混合检索**：BM25 全文 + cosine 向量 → min-max 归一化 + alpha 加权融合 |
| **向量模型** | — | 本地 all-MiniLM-L6-v2 (22MB) 或 通义 text-embedding-v3 |
| **自动召回** | ❌ | ✅ 每轮注入 top-3 记忆到 `<memories>` 块，按 agentId 作用域 + pinned 优先 |
| **自动捕获** | ❌ | ✅ 检测"记住/remember/偏好"等触发词自动保存，SSE 通知 + 撤销 |
| **重复检测** | ❌ | ✅ `checkMemoryDuplicate()` 保存前去重 |
| **安全扫描** | ❌ | ✅ `scanMemoryThreats()` 检测恶意内容 |
| **容量控制** | 会话 200K 字符限制 | ✅ GC 机制（归档低分 + 删除过期归档）+ 4000 字符预算 |
| **冻结快照** | ❌ | ✅ 会话首轮冻结记忆快照，后续不变（O1） |
| **管理 UI** | ❌ | ✅ 524 行完整 MemoryTab（CRUD/搜索/过滤/分页/分类/置顶/导出/导入/GC） |
| **会话搜索** | 无 | ✅ SQLite FTS5 索引全部历史会话 + `session_search` 工具 |

---

## 六、上下文引擎对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **上下文管理** | 会话历史长度检查（200K字符），超出提示新建 | **可插拔 ContextEngine 接口**：assemble() / afterTurn() / beforeTurn() / afterToolCall() |
| **压缩机制** | ❌ 无 Compaction | ✅ 两级压缩：`compaction.ts`（分段 LLM 摘要）+ `compressor.ts`（O2 六步流水线） |
| **触发条件** | — | 上下文超 50% token 或 30 条消息 |
| **标识符保护** | — | ✅ UUID/路径/URL 提取 → 摘要时原样保留 |
| **Token 预算** | — | `contextWindow - systemPrompt - outputReserve(4096) - safetyMargin(20%)` |
| **图像保留** | — | ✅ 保留最近 3 轮图像数据 |
| **Memory 注入** | — | ✅ assemble() 中自动注入冻结记忆快照 + top-N 相关记忆 |
| **Skill 注入** | — | ✅ XML 索引（name+description+location ≈ 24 tokens/skill），最多 150 个 |
| **任务感知** | 上下文拼接 | ✅ System Prompt 注入主动澄清 + 执行前计划 + 执行后摘要规则（Phase task-awareness） |

---

## 七、Skills 系统对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **格式** | SKILL.md（Markdown + 磁盘同步） | SKILL.md（YAML frontmatter + Markdown body, 256KB 上限） |
| **加载层级** | 1 层（~/.eigent/skills/） | **6 层优先级**（extra → bundled → managed → personal → project → workspace），同名高优先覆盖 |
| **注入方式** | 全文注入 | **懒加载**：XML 索引（~24 tokens/skill）→ 模型按需 `read_file` 读取全文 |
| **注入限制** | 无明确限制 | 最多 150 个 + 30,000 字符，超出二分法截断 |
| **热更新** | ✅ 磁盘同步 | ✅ chokidar 监听 + 30s 防抖重载 |
| **安全扫描** | ❌ | ✅ Scanner 8 条规则（exec/eval/凭证窃取/挖矿检测），critical 级别自动 blocked |
| **Gallery 安装** | ❌ | ✅ 可信仓库白名单 + 下载后自动扫描 |
| **⭐ 自动沉淀** | ❌ | ✅ 复杂任务完成后 LLM 主动提议保存为 Skill → 生成规范 SKILL.md → 自动加载 |
| **技能平权** | ❌ | ✅ GPT-5 完成的复杂任务 → 沉淀为 Skill → GPT-4o 读取后也能执行 |
| **PRC 本地化** | ❌ | ✅ 安装命令默认国内镜像源（清华 pypi、npmmirror、goproxy.cn） |
| **@Skill 提及** | ❌ | ✅ 聊天框输入 `@` 弹出 Skill 选择器 + 模糊搜索 |
| **描述格式** | 自由文本 | ✅ 双分区：`[功能摘要]。Use when: [场景]。NOT for: [排除]。`（≤200 字符） |

---

## 八、Provider / 模型支持对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **Provider 架构** | CAMEL-AI ModelFactory 直连 | **OpenAICompatProvider 基类** + ProviderRegistry + FallbackProvider 包装 |
| **支持模型** | 任意 OpenAI 兼容 API（通过 CAMEL） | 6 类 Provider：Copilot(GPT-5.x/Claude/Gemini/o3)、DeepSeek、Qwen、Volc、MiniMax、Custom |
| **免费方案** | ❌（需自带 API Key） | ✅ GitHub Copilot（$0 订阅，Device Flow OAuth）|
| **降级链** | ❌ | ✅ FallbackProvider：9 类错误精细分类 → 冷却策略矩阵 → 渐进降级（thinking→无thinking→fallback） |
| **Key 轮换** | ❌ | ✅ 多 API Key 自动轮换（rate limit 时切换） |
| **智能路由** | ❌（手动选模型） | ✅ 3 档复杂度（light/standard/heavy）纯本地规则分类（零 API 调用） |
| **@model 语法** | ❌ | ✅ `@deepseek-reasoner 帮我分析` 强制路由 |
| **PRC 直连** | 通过 CAMEL 间接 | ✅ DeepSeek V3/R1、通义千问、豆包、MiniMax 原生直连 |
| **Stream 装饰器** | ❌ | ✅ 7 个装饰器洋葱模型（去思考块/规范化工具ID/解码 HTML 实体/成本追踪等） |
| **Context Window** | 硬编码 timeout=600s | ✅ 4 级解析（配置覆盖 → 模型查表 → Provider 报告 → 默认 128K） |

---

## 九、费用追踪对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **费用追踪** | Cloud 端 credits 系统 | ✅ SQLite 本地账本：逐次 LLM 调用记录 token + CNY |
| **粒度** | 任务级 | **阶段级**（classify/prompt/compact/subagent/embedding 5 种 phase） |
| **费率表** | 服务端管理 | 本地覆盖 > CDN 远程(24h 更新) > 内置兜底 |
| **预算限额** | Cloud credits | ✅ 每日限额（默认 ¥10），超出拒绝并提示 |
| **查询 API** | ❌ | ✅ `GET /cost/today`、`GET /cost/sessions`、`GET /cost/export`（CSV） |
| **UI 展示** | ❌ | ✅ 关于 Tab 显示累计费用 / 总 tokens / 调用次数 |
| **优化闭环** | ❌ | ✅ 积累 >100 次数据 → 分析路由效率 → 自动调整建议 |

---

## 十、安全模型对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **API Key 存储** | .env 文件或 Server DB | ✅ Windows DPAPI 加密 `config.enc`，启动时解密到内存，NEVER 写入日志 |
| **工具安全** | 工具级权限 | ✅ 7 层安全体系（§四中详述） |
| **沙箱隔离** | Python 本地执行 | ✅ Bash 路径沙箱 + 注入检测 + `..` 遍历 + 符号链接逃逸防护 |
| **最小权限** | ❌ | ✅ 主 Session 完整权限 / 子 Session 受限 / Cron 只读 |
| **安全审计** | ❌ | ✅ 6 类检查（sandbox/secrets/toolPolicy/memoryEncryption/cors/transport）+ `GET /api/security-audit` |
| **SSRF 防护** | ❌ | ✅ 私有 IP + localhost 阻断 + DNS 解析验证 |
| **Prompt 注入防护** | ❌ | ✅ 14 种模式检测 + 随机 boundary 包裹 |
| **CORS** | ❌ | ✅ 白名单过滤（仅允许 Tauri + 开发模式 localhost） |
| **诊断脱敏** | ❌ | ✅ API key/Bearer token/hex token + 敏感字段名自动脱敏 |

---

## 十一、前端 UI 对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **UI 组件库** | Tailwind + Radix UI + shadcn/ui (~50 组件) | 原生 CSS 变量 + 手写组件 |
| **动画** | GSAP + Framer Motion + Lottie | 无（CSS transition） |
| **i18n** | ✅ i18next (EN/CN/JA/PT-BR) | 中文为主 + 英文混合 |
| **Workflow 可视化** | ✅ React Flow 实时拓扑 | ❌（但有 TaskProgressBar + 父子树 + 角色图标） |
| **Terminal** | ✅ xterm.js 内嵌 | ❌（通过工具卡片展示 stdout 流） |
| **Editor** | ✅ Monaco Editor | ❌（Markdown 代码块 + DiffPreview） |
| **Storybook** | ✅ | ❌ |
| **暗色主题** | ✅ next-themes | ✅ CSS 变量（白/暗/跟随系统） |
| **设置页** | 基础设置 | ✅ **6 Tab**（模型/工具/Skills/记忆/高级/关于）|
| **记忆管理 UI** | ❌ | ✅ 524 行完整 MemoryTab |
| **Diff 预览** | ❌ | ✅ DiffPreview（行级差异 + Accept/Reject） |
| **交互式 UI** | ❌ | ✅ InteractiveBlock（Agent 发送按钮/选择器/文本） |
| **@提及** | ❌ | ✅ MentionPicker（@Skill + #Tool 模糊搜索） |
| **文件附件** | ✅ | ✅（文件选择 + 拖放 + 剪贴板粘贴图片，最多 5 个） |
| **工具调用展示** | 基础日志 | ✅ 实时卡片（spinner→✅/❌）+ 可展开 INPUT/OUTPUT/STDOUT |
| **暂停/恢复** | ❌ | ✅ ⏸暂停(等工具完成) → 输入指令 → ■停止 |
| **缩放** | ❌ | ✅ Ctrl+=/- (50%–200%)、Ctrl+0 重置、Ctrl+滚轮 |
| **会话管理** | 基础历史 | ✅ 日期分组 + 父子树 + 搜索 + 多标签 + Ctrl+N |

---

## 十二、桌面框架对比

| 方面 | Eigent (Electron) | Equality (Tauri) |
|------|-------------------|------------------|
| **安装包** | ~150-300MB | **~25MB** (NSIS: tauri.exe + core.exe + resources) |
| **运行内存** | 高（Chromium 多进程） | ~30MB（系统 WebView2） |
| **渲染引擎** | 自带 Chromium | 系统 WebView2 (Windows 11 内置) |
| **原生能力** | Node.js 全 API | Rust 后端 + 6 个 Tauri 插件 (dialog/global-shortcut/notification/opener/shell) |
| **系统托盘** | ✅ | ✅（左键恢复/右键菜单） |
| **崩溃恢复** | 手动重启 | ✅ Core 子进程崩溃自动重启（最多 3 次） |
| **CDP 浏览器** | ✅ Pool 管理 + 健康检查 | ❌（Puppeteer 独立进程） |
| **构建** | electron-builder | tauri build (NSIS/MSI) + Node.js SEA 打包 |

---

## 十三、自动化与调度对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **Trigger 系统** | ✅ Webhook + 定时 + WebSocket 推送 | ❌ 无 Webhook |
| **定时任务** | Server Celery Beat | ✅ CronScheduler（cron 表达式/固定间隔/一次性）+ JSON 持久化 |
| **Payload** | 执行完整任务 | 3 种：notify（桌面通知）/ chat（注入消息）/ agent（完整 turn） |
| **后台队列** | Celery + Redis | ❌（同步 SSE） |

---

## 十四、可观测性对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **结构化日志** | electron-log + Python logging | ✅ 零依赖 JSONL 日志 + 4 级 (debug/info/warn/error) + 自动脱敏 |
| **LLM 调用追踪** | ❌ | ✅ 7 阶段追踪（JSONL 输出）+ CacheTrace 装饰器 |
| **启动追踪** | ❌ | ✅ BootstrapGraph 7 阶段（prefetch→env-guards→config-load→tool-registry→skill-loader→code-indexer→gateway-ready） |
| **Session 生命周期** | ❌ | ✅ 5 种事件（created/restored/persisted/destroyed/reaped） |
| **Hook 点** | ❌ | ✅ 6 个 hook（before/afterToolCall, before/afterLLMCall, before/afterPersist） |
| **OpenTelemetry** | ✅ | ❌ |

---

## 十五、可扩展性对比

| 方面 | Eigent | Equality |
|------|--------|----------|
| **插件系统** | ❌ | ✅ Plugin SDK (K1)：manifest.json + ESM import()、3 种类型（provider/tool/hook） |
| **MCP** | ✅ CAMEL + 搜索安装 UI | ✅ MCP Client Manager（stdio/SSE 传输） |
| **Skills 扩展** | ✅ 磁盘 MD 文件 | ✅ 6 层优先级 + 安全扫描 + Gallery 安装 + 自动沉淀 |
| **自定义 Agent** | ❌（固定 8 角色） | ✅ Multi-Agent 配置（`equality.config.json`），每个 Agent 独立 workspace/model/tools/identity |
| **Tool Profiles** | ❌ | ✅ 4 种配置（minimal/coding/messaging/full），allow-list 模式 |

---

## 十六、关键设计哲学差异

| 哲学 | Eigent | Equality |
|------|--------|----------|
| **Agent 策略** | "分而治之" — 预置角色自动分工 | "深度循环 + 按需编排" — 单 Agent 迭代 → DAG 多角色协作 |
| **知识扩展** | Python Toolkit 继承 | **Skill 自动沉淀** — "技能平权"，强模型的能力可被弱模型复用 |
| **安全理念** | 应用层认证 | **纵深防御** — 7 层安全（Pipeline + Sandbox + 防注入 + SSRF + 审计...） |
| **部署模型** | Cloud-first + 可选本地 | **Local-first + 零云依赖**（4 个 SQLite，DPAPI 加密） |
| **上下文策略** | 历史拼接 + 长度限制 | **可插拔 ContextEngine** + 分段压缩 + 标识符保护 + 记忆冻结快照 |
| **成本意识** | 服务端 credits | **本地 CNY 账本** + 每日限额 + 费率表自动更新 + 路由优化闭环 |
| **AI 框架** | CAMEL-AI SDK（学术驱动） | 自研薄层（OpenAI SDK + Provider 抽象 + Stream 装饰器） |
| **语言栈** | TS + Python 双语言 | 全 TypeScript 统一栈 |
| **PRC 优化** | 无特殊处理 | ✅ 国内模型直连 + 国内镜像源 + 中文 Prompt + BGE-M3 中英双语 Embedding |

---

## 十七、优劣势分析

### Eigent 独有优势
1. **🏭 Workforce 开箱即用** — CAMEL-AI 成熟的多 Agent 并行编排，无需用户配置
2. **📊 React Flow Workflow 可视化** — 实时展示 Agent 节点拓扑和任务流
3. **🖥️ 内嵌 Terminal + Editor** — xterm.js + Monaco Editor 集成
4. **🔄 Trigger 系统** — Webhook + 定时触发实现外部事件驱动的自动化
5. **🌍 完善国际化** — 4 种语言 + 社区活跃
6. **🎨 UI 完成度高** — shadcn/ui + Framer Motion 完整设计系统
7. **🏢 企业功能** — SSO、OAuth、PostgreSQL、Redis、Celery

### Equality 独有优势
1. **🧠 完整记忆系统** — SQLite+FTS5+embedding 混合搜索 + 自动召回 + 冻结快照 + GC + 管理 UI
2. **🔐 7 层纵深安全** — Policy Pipeline + Mutation 分类 + Bash 沙箱 + 循环检测 + 外部内容防注入 + SSRF + 审计
3. **📝 Skill 自动沉淀** — 核心创新：复杂任务完成 → 自动生成 SKILL.md → "技能平权"闭环
4. **🔄 可插拔 Context Engine** — 分段压缩 + 标识符保护 + 记忆冻结快照 + Token 预算管理
5. **📐 LSP 语义代码理解** — 4 个 LSP 工具（hover/definition/references/diagnostics）
6. **💰 CNY 费用追踪** — 本地账本 + 每日限额 + 阶段级粒度 + 优化闭环
7. **🪶 极致轻量** — 25MB 安装包 + ~30MB 运行内存 + 全 TypeScript 统一栈
8. **🎭 DAG 编排引擎** — 拓扑排序 + 并发调度 + 5 角色 + 暂停/恢复/重试/跳过
9. **🔎 跨会话搜索** — session_search + code_search FTS5 索引
10. **🛡️ 崩溃自恢复** — Core 子进程崩溃自动重启 + 子 Agent 孤儿恢复
11. **🇨🇳 PRC 深度本地化** — 国内模型直连 + 国内镜像源 + 中文 Prompt + BGE-M3

### Eigent 待改进
1. 📦 体积大（300MB+ Electron + Python）
2. 🐍 双语言维护负担
3. 🗄 重依赖（PostgreSQL + Redis + Celery）
4. 🧠 无长期记忆系统
5. 🔒 缺乏工具执行安全管道
6. 📐 无代码语义理解（LSP）
7. 💰 无本地费用追踪

### Equality 待改进
1. 🎨 UI 视觉设计（无组件库/无动画/无 Workflow 可视化）
2. 🌍 国际化不足
3. 🔄 无 Webhook Trigger
4. 🖥️ 无内嵌终端/编辑器
5. 📊 无 React Flow 工作流图

---

## 十八、可相互借鉴之处

### Equality 可从 Eigent 借鉴
1. **React Flow Workflow 可视化** — DAG 编排已有，缺图形化展示
2. **Webhook Trigger** — 外部事件驱动自动化
3. **内嵌 Terminal (xterm.js)** — 直接展示工具 stdout 流
4. **完整 i18n** — i18next 框架
5. **社交平台直连 Toolkit** — Slack/Twitter/LinkedIn 等

### Eigent 可从 Equality 借鉴
1. **Memory 系统全套** — 存储 + 混合检索 + 自动召回 + GC + 管理 UI
2. **7 层安全体系** — Policy Pipeline + Bash Sandbox + 循环检测 + 防注入
3. **Context Engine + Compaction** — 可插拔上下文 + 分段压缩 + 标识符保护
4. **Skill 自动沉淀** — "技能平权"创新设计
5. **LSP 代码理解** — hover/definition/references/diagnostics
6. **CNY 费用追踪** — 本地账本 + 限额 + 优化闭环
7. **Tauri 轻量化** — 从 Electron 迁移到 Tauri
8. **Stream 装饰器洋葱模型** — 可组合的流式输出处理管道
9. **跨会话搜索** — FTS5 索引全部历史

---

## 十九、结论

Eigent 和 Equality 代表了 AI 桌面助理的两条技术路线：

**Eigent** 走 **"开箱即用"** 路线 — CAMEL-AI 成熟 SDK + 预置 8 角色 + 35+ Toolkit + 企业功能，追求的是**广度覆盖**和**即时可用性**。它的核心壁垒在于 Workforce 并行编排和丰富的社交平台集成。

**Equality** 走 **"深度工程"** 路线 — 自研 25 个子系统 + 7 层安全 + 可插拔 Context Engine + 记忆系统 + DAG 编排 + Skill 自动沉淀，追求的是**架构深度**和**可进化性**。它的核心壁垒在于：

1. **技能平权闭环**（Skill 自动沉淀 → 弱模型也能执行复杂任务）
2. **纵深安全体系**（7 层，远超同类产品）
3. **智能上下文管理**（可插拔引擎 + 压缩 + 记忆冻结 + Token 预算）
4. **本地费用意识**（CNY 账本 + 每日限额 + 路由优化）
5. **极致轻量**（25MB 安装包 vs 300MB+）

从子系统完整度看，Equality 的 **25 个模块（130+ 源文件 / 4 个 SQLite 数据库）** 构成了一个对标 OpenClaw 级别的完整 Agent 操作系统，而非简单的"聊天应用"。它在安全、记忆、上下文管理、费用控制、Skill 进化等维度的深度，是 Eigent 目前不具备的。

两者的最佳互补方案：**Eigent 的 Workforce 可视化 + 社交集成** × **Equality 的记忆/安全/上下文/Skill 沉淀引擎**。
