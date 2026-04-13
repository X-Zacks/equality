# Equality — AI 桌面智能助理

> 面向中国大陆 Windows 用户的 AI Agent 操作系统。25 个子系统 · 28 内置工具 · 7 层安全 · 4 个 SQLite 数据库 · 25MB 安装包

<p align="center">
  <strong>Tauri 2 (Rust)</strong> · <strong>Node.js 22 (Fastify)</strong> · <strong>React 19 (TypeScript)</strong>
</p>

---

## 🎯 设计理念

Equality 不是聊天机器人。它是 **AI 代理的神经系统**——感知（多渠道输入）→ 记忆（持久化长期记忆）→ 思考（LLM + Skills + Context Engine）→ 行动（28 工具 + MCP）→ 表达（流式输出 + 交互式 UI）→ **进化（Skill 自动沉淀）**。

**三大核心创新：**

1. **技能平权**：GPT-5 完成的复杂任务 → 自动沉淀为 SKILL.md → DeepSeek V3 读取 Skill 后也能执行同样任务
2. **纵深安全**：工具调用经 7 层安全管道（Policy Pipeline → Mutation 分类 → Bash 沙箱 → 循环检测 → 结果截断 → 外部内容防注入 → SSRF 防护）
3. **智能上下文**：可插拔 Context Engine + 分段压缩 + 标识符保护 + 记忆冻结快照 + Token 预算管理

---

## ✨ 功能全景

### 🤖 Agent 运行时（25 个子系统）

| 子系统 | 能力 |
|--------|------|
| **Agent Runner** | 主循环（1037 行）：LLM 调用 → tool_call 分发 → 流式输出 · 编译错误自动重试 · 网络中断重试 |
| **Context Engine** | 可插拔接口：system prompt 构造 + memory recall + 历史拼接 + 压缩 + trimMessages |
| **Compaction** | 两级压缩：分段 LLM 摘要 + O2 六步流水线 · 标识符保护（UUID/路径/URL 不被改写）|
| **Memory** | SQLite + FTS5 + embedding 混合检索 · 自动召回/捕获 · 去重 · 威胁扫描 · GC · 导入/导出 |
| **Tools** | 28 内置 + MCP 动态工具 · 4 级容错匹配 · 3 层策略管道 · 4 检测器循环检测 |
| **Skills** | 6 层优先级加载 · 安全扫描 (8 规则) · Gallery 安装 · 热更新 · **自动沉淀** |
| **Provider** | 6 类 Provider + FallbackProvider · 智能路由 (light/standard/heavy) · Key 轮换 · @model 语法 |
| **Session** | per-Key 串行队列 · JSON 持久化 · FTS5 跨会话搜索 · 生命周期事件 |
| **SubagentManager** | spawn / list / steer / kill · 孤儿恢复 · 深度限制 |
| **Orchestration** | DAG 编排引擎：拓扑排序 + 并发调度 · 5 角色 · 暂停/恢复/重试/跳过 |
| **Task Registry** | 7 种状态 · SSE 事件推送 · SQLite 持久化 · 孤儿恢复 |
| **Cost Ledger** | SQLite 费用账本 · 阶段级粒度 · 每日限额 · CNY 费率表 |
| **Cron Scheduler** | cron 表达式 / 固定间隔 / 一次性 · 3 种 Payload · JSON 持久化 |
| **Plugin Host** | K1 SDK · 3 种类型（provider/tool/hook）· ESM 动态加载 |
| **Security** | 安全审计(6 类检查) · 外部内容防注入(14 模式) · SSRF 防护 |
| **Diagnostics** | JSONL 结构化日志 · 7 阶段 LLM 调用追踪 · 自动脱敏 |
| **Hooks** | 6 个 hook 点（before/after ToolCall · LLMCall · Persist）|
| **Code Indexer** | 增量文件扫描 · 混合代码搜索（语义 + 关键词 + 符号 RRF 融合）|
| **LSP Client** | 4 个 LSP 工具（hover/definition/references/diagnostics）|
| **MCP Client** | stdio/SSE 传输 · 动态发现 → 注册到 ToolRegistry |
| **Web Search** | Provider 注册表 · Brave → DDG 回退 |
| **TTS Engine** | 客户端 Web Speech + 服务端 OpenAI TTS |
| **Media Router** | 按 MIME type 自动路由 · 内存缓存 (10min TTL) |
| **Bootstrap** | 7 阶段启动追踪 · 工作区引导(BOOTSTRAP.md → 对话引导 → 身份建立) |
| **Process** | 命令队列（并发 5）· 跨平台进程树 Kill |

### 🔧 28 内置工具

| 分类 | 工具 |
|------|------|
| 🖥️ Shell | `bash`（沙箱隔离 + 路径检测 + 注入防护 + 流式 stdout） |
| 📁 文件 | `read_file` · `write_file` · `edit_file`（模糊匹配+CRLF兼容） · `glob` · `grep`（正则+上下文行） · `list_dir` · `apply_patch` |
| 🌐 网络 | `web_fetch`（SSRF 防护） · `web_search`（Brave→DDG 回退） |
| 🖥️ 浏览器 | `browser`（Puppeteer · ARIA Snapshot · 多标签 · 截图） |
| 📷 媒体 | `read_image`（base64→视觉模型 · 自动路由） · `read_pdf`（pdfjs 逐页提取） |
| ⏰ 调度 | `cron_create`（cron/interval/at 三种模式 · 桌面通知） |
| 🧠 记忆 | `memory_save` · `memory_search`（BM25 + cosine 混合检索） |
| 🔎 搜索 | `session_search`（FTS5 跨会话） · `code_search`（语义+关键词混合） |
| ⚙️ 进程 | `process`（启动/列出/停止） · `tree-kill` |
| 📐 LSP | `lsp_hover` · `lsp_definition` · `lsp_references` · `lsp_diagnostics` |
| 🤖 Agent | `subagent_spawn` · `subagent_list` · `subagent_steer` · `subagent_kill` |

### 🧠 记忆系统

- **SQLite + FTS5 全文索引** — 跨会话持久化长期记忆
- **Embedding 混合检索** — BM25 关键词 + cosine 向量 → min-max 归一化 + alpha 加权融合
- **自动召回** — 每轮注入 top-3 相关记忆到 `<memories>` 块
- **自动捕获** — 检测"记住/remember/偏好"触发词 → 自动保存 → SSE 通知 + 撤销
- **完整管理** — CRUD · 去重检测 · 安全扫描 · GC 归档 · 导入/导出 · 置顶 · 分类(5种) · 524 行管理 UI

### 🔐 7 层安全体系

```
工具调用 → [1]Policy Pipeline(3层策略,deny优先)
         → [2]Mutation Classification(19工具分类 READ/WRITE/EXEC)
         → [3]Bash Sandbox(路径隔离+遍历检测+符号链接防护)
         → [4]Loop Detection(4检测器: circuit_breaker/generic_repeat/poll_no_progress/ping_pong)
         → [5]Result Truncation(400K字符+Context Guard 75%预算)
         → [6]Content Sanitization(14种prompt injection检测+随机boundary)
         → [7]SSRF Protection(私有IP+localhost阻断+DNS验证)
         → ✅ 执行
```

### 📝 Skills 技能系统

| 特性 | 说明 |
|------|------|
| **格式** | SKILL.md（YAML frontmatter + Markdown body, 256KB 上限） |
| **6 层优先级** | workspace > project > personal > managed > bundled > extra（高优先覆盖低优先同名 Skill） |
| **懒加载** | System Prompt 只注入 XML 索引（~24 tokens/skill），模型按需读取全文 |
| **安全扫描** | 8 条规则（exec/eval/凭证窃取/挖矿检测），critical 级别自动 blocked |
| **⭐ 自动沉淀** | 复杂任务完成后 AI 主动提议保存为 Skill → 生成规范 SKILL.md → 热加载 |
| **@Skill 提及** | 聊天框输入 `@` 弹出选择器 + 模糊搜索，支持多 Skill 组合调用 |
| **Gallery 安装** | 可信仓库白名单 + 下载后自动扫描 |

### 🧪 智能模型路由

| 能力 | 说明 |
|------|------|
| **3 档复杂度** | light（闲聊）/ standard（代码编写）/ heavy（大规模重构）— 纯本地规则，零 API 调用 |
| **@model 语法** | `@deepseek-reasoner 帮我分析这段代码` — 强制路由到指定模型 |
| **自动降级** | FallbackProvider：9 类错误精细分类 → 冷却策略 → 渐进降级（thinking→无thinking→fallback） |
| **Key 轮换** | 多 API Key 自动轮换，rate limit 时无缝切换 |
| **视觉自动路由** | 当前模型不支持视觉时 → 自动切换可用 vision provider |

### 🎭 多 Agent 编排

| 层级 | 能力 |
|------|------|
| **Runner 主循环** | 单 Agent 深度工具循环（30 次断路器）+ 编译错误自动重试 |
| **SubagentManager** | 4 个工具（spawn/list/steer/kill）· 独立 Session · 深度限制 · 孤儿恢复 |
| **DAG 编排引擎** | PlanGraph 拓扑排序 + PlanExecutor 并发调度 (maxConcurrent=3) · 5 角色 (supervisor/architect/developer/tester/reviewer) · 暂停/恢复/重试/跳过 |

---

## 🖥️ 桌面体验

| 能力 | 说明 |
|------|------|
| **安装包** | ~25MB NSIS 安装包（Tauri + Node.js SEA） |
| **系统托盘** | 常驻后台 · 点关闭隐藏到托盘 · 右键菜单 |
| **崩溃自恢复** | Core 子进程崩溃 → 自动重启（最多 3 次） |
| **流式对话** | SSE 实时推流 · 工具调用实时卡片（spinner→✅/❌）· 可展开 INPUT/OUTPUT/STDOUT |
| **暂停/恢复** | ⏸ 暂停（等工具完成）→ 输入指令重定向 → ■ 停止 |
| **文件附件** | 📎 选择 + 拖放 + Ctrl+V 粘贴截图（最多 5 个） |
| **Diff 预览** | 文件写入前行级差异展示 · Accept ✅ / Reject ❌ |
| **交互式 UI** | Agent 发送按钮/选择器/文本 → 用户点击后继续对话 |
| **@提及** | @Skill + #Tool 模糊搜索选择器 · 支持多选 |
| **会话管理** | 日期分组 · 父子 Agent 树 · 5 种角色图标 · 6 种状态徽标 · 搜索 · 多标签 |
| **6 Tab 设置** | 模型 · 工具 · Skills · 记忆(524行管理UI) · 高级 · 关于 |
| **主题** | 白 / 暗 / 跟随系统 |
| **缩放** | Ctrl+=/- (50%–200%) · Ctrl+0 重置 |
| **费用追踪** | 关于 Tab 显示累计费用 ¥ / 总 tokens / 调用次数 |

---

## 🌏 国内模型 & 本地化

| Provider | 模型 | 特点 |
|----------|------|------|
| 🐙 **GitHub Copilot** | GPT-4o/4.1/5.x, Claude, Gemini, o3/o4-mini | **免费**（$0 订阅） · Device Flow OAuth |
| 🔮 **DeepSeek** | V3 / R1 (Reasoner) | api.deepseek.com 直连 · 思考过程可见 |
| 🌟 **通义千问** | qwen3-coder-plus / qwen3-plus | dashscope.aliyuncs.com 国内端点 |
| 🌋 **火山引擎** | doubao-seed-1-8 / doubao-1.5-pro | 豆包模型 |
| 🤖 **MiniMax** | MiniMax-M1 | 含「显示思考过程」开关 |
| 🔌 **自定义** | 任意 OpenAI 兼容 API | URL + Key + Model |

- Skills 安装命令默认国内镜像源（清华 pypi、npmmirror、goproxy.cn）
- 本地 Embedding：BGE-M3（中英双语，22MB 本地模型）
- 费用账本以 **人民币** 计价

---

## 📦 项目结构

```
equality/
├── packages/
│   ├── core/                  # Node.js 22 Core Agent（25 个子系统 · 130+ 源文件）
│   │   ├── src/
│   │   │   ├── agent/         # Runner · SubagentManager · SystemPrompt · Bootstrap · Decorators
│   │   │   ├── tools/         # 28 内置工具 + MCP + LSP（含 builtins/ · mcp/ · lsp/）
│   │   │   ├── memory/        # SQLite + FTS5 + embedding 混合检索
│   │   │   ├── context/       # ContextEngine + Compaction + Compressor
│   │   │   ├── providers/     # 6 Provider + Fallback + Routing + Key轮换
│   │   │   ├── session/       # Store + Queue + Persist + Search + Lifecycle
│   │   │   ├── skills/        # 6层Loader + Scanner + Installer + Watcher
│   │   │   ├── orchestration/ # DAG Engine + Executor + Serializer + Roles
│   │   │   ├── tasks/         # TaskRegistry + EventBus + SQLiteStore + 孤儿恢复
│   │   │   ├── config/        # Secrets(DPAPI) + Proxy + AgentConfig + Schema + Validation
│   │   │   ├── security/      # 安全审计 + 外部内容防注入
│   │   │   ├── cost/          # SQLite 费用账本
│   │   │   ├── cron/          # CronScheduler + JSON持久化
│   │   │   ├── plugins/       # PluginHost + SDK Types
│   │   │   ├── diagnostics/   # JSONL Logger + CacheTrace + 脱敏
│   │   │   ├── indexer/       # CodeScanner + CodeSearch
│   │   │   ├── hooks/         # 6 个 Hook 点位
│   │   │   ├── search/        # WebSearchRegistry
│   │   │   ├── tts/           # TTSEngine
│   │   │   ├── media/         # MediaRouter
│   │   │   └── links/         # URL提取 + SSRF防护
│   │   └── skills/            # 内置技能库
│   └── desktop/               # Tauri 2.x 桌面壳（Rust + React 19）
│       ├── src/               # React 前端（Chat · Settings · MemoryTab · SessionPanel...）
│       └── src-tauri/src/     # Rust 后端（gateway · proxy · tray · window）
├── openspec/                  # 规格驱动开发（11 个 Spec + 40 个 Phase/变更）
└── scripts/                   # 构建脚本
```

**数据存储**：`%APPDATA%\Equality\`

| 文件 | 用途 |
|------|------|
| `settings.json` | API Key 等配置（Windows DPAPI 加密） |
| `sessions/` | 会话历史（JSON 文件，原子写入） |
| `memory.db` | 长期记忆（SQLite + FTS5 + embedding BLOB） |
| `cost-ledger.db` | 费用账本（逐次 LLM 调用记录 token + CNY） |
| `session-search.db` | 跨会话全文搜索索引 |
| `tasks.db` | 任务注册中心（子 Agent 状态） |
| `skills/` | 用户自定义 / 自动沉淀的技能 |
| `cron-jobs.json` | 定时任务配置 |

---

## 🚀 快速开始

### 环境要求（Windows）

> ⚠️ Tauri 需要 **Rust 工具链 + MSVC 编译器**。请按顺序安装。

#### 1. Visual Studio C++ 编译工具

下载 [Visual Studio Build Tools 2022](https://aka.ms/vs/17/release/vs_BuildTools.exe)，勾选 **"使用 C++ 的桌面开发"** 工作负载。

#### 2. Rust

```powershell
winget install Rustlang.Rustup
# 重新打开终端后验证：rustc --version && cargo --version
```

#### 3. Node.js + pnpm

```powershell
winget install OpenJS.NodeJS.LTS   # Node.js ≥ 18
npm install -g pnpm                 # pnpm ≥ 8
```

### 安装与运行

```bash
pnpm install

# 终端 1：启动 Core（需先在设置中配置至少一个 API Key）
pnpm dev:core

# 终端 2：启动桌面应用
pnpm dev:desktop
```

### 构建发布包

```bash
pnpm build:installer    # NSIS 安装包（~25MB）
pnpm build:portable     # 便携版 ZIP
```

---

## 🧭 新手入门指南

### 第一步：配置模型

启动后点击左下角 **⚙ 设置** → **🤖 模型** Tab：

| 推荐方案 | 操作 | 费用 |
|----------|------|------|
| **零成本方案** | 点击 GitHub Copilot 的「登录」按钮 → 浏览器完成 Device Flow 授权 | 免费（需 GitHub 账号） |
| **国内直连** | 填入 DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com)） | ≈ ¥0.002/千 tokens |
| **性能最优** | 同时配置 Copilot + DeepSeek → 开启 Auto 路由 | 智能选择最优模型 |

配置完成后，状态栏会显示 `● copilot (gpt-5.2)` 或对应模型名。

### 第二步：开始对话

回到聊天页面，试试这些场景：

```
💬 "帮我分析一下 C:\projects\myapp 这个项目的结构"
   → AI 会自动使用 glob、read_file 等工具扫描项目

💬 "把这个 Python 脚本改成异步版本" + Ctrl+V 粘贴截图
   → AI 会用 read_image 分析截图，然后 write_file 写入新代码

💬 "@excel-cost-diff-analysis" + 拖入 Excel 文件
   → 激活 Skill，自动分析费用差异并生成报告

💬 "记住：我的项目都放在 D:\work 目录下"
   → 自动保存到长期记忆，下次对话会自动召回
```

### 第三步：探索进阶功能

| 功能 | 操作 |
|------|------|
| **暂停/重定向** | 执行中点 ⏸ → 等工具完成后暂停 → 输入新指令重定向 |
| **@Skill 调用** | 输入 `@` 弹出技能选择器，可多选组合 |
| **#Tool 指定** | 输入 `#` 弹出工具选择器 |
| **记忆管理** | 设置 → 🧠 记忆 Tab → 查看/搜索/编辑/导出所有记忆 |
| **定时任务** | 对话中说"每天早上 9 点提醒我查看邮件" |
| **Diff 预览** | AI 写文件时自动弹出差异预览，可 Accept/Reject |
| **交互式选择** | AI 提供选项时会显示可点击按钮 |
| **模型覆盖** | `@deepseek-reasoner 深度分析这个算法的时间复杂度` |
| **工作区引导** | 首次使用时 AI 会主动了解你，建立个性化身份 |

---

## 📋 开发规范

本项目使用 **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** 规格驱动开发。每个功能对应 `openspec/changes/<name>/` 目录：

```
openspec/
├── specs/          ← 11 个领域 Spec（系统行为的权威来源）
│   ├── agent-runner/spec.md
│   ├── session/spec.md
│   ├── tools/spec.md
│   └── ...
└── changes/        ← 40 个 Phase/变更（已完成 + 进行中）
    ├── phase-0-tauri-shell/     ✅
    ├── phase-1-agent-core/      ✅
    ├── ...
    └── phase-O-self-evolution/  🔧
```

详见 [openspec/README.md](./openspec/README.md)。

---

## 📄 License

MIT
