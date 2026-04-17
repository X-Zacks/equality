# Equality — AI 桌面智能助理

[English](./README_EN.md)

> 面向 Windows 用户的本地 AI Agent 桌面应用。29 个内置工具、多 Agent DAG 编排、跨会话记忆、技能自动沉淀——不止于聊天，它是一个**可以持续进化的 AI 工作伙伴**。

---

## 🎯 设计理念：技能平权

用强模型（如 GPT-5）完成一项复杂任务后，Equality 会自动将执行方法沉淀为"技能文档"。此后，成本更低的模型（如 DeepSeek V3）读取这份技能文档，同样能完成这项任务。**你用得越久，它越懂你——同时成本越低。**

---

## ✨ 核心能力

### 🤖 29 个内置工具 — Agent 执行引擎

| 类别 | 工具 |
|------|------|
| **文件系统** | `read_file` · `write_file` · `edit_file` · `apply_patch` · `list_dir` · `glob` · `grep` |
| **代码智能** | `codebase_search` (语义搜索) · `lsp_hover` · `lsp_definition` · `lsp_references` · `lsp_diagnostics` |
| **执行** | `bash` (沙箱) · `browser` (Playwright) · `web_search` · `web_fetch` |
| **记忆** | `memory_save` · `memory_search` · `session_search` |
| **多 Agent** | `subagent_spawn` · `subagent_list` · `subagent_steer` · `subagent_kill` |
| **多媒体** | `read_image` · `read_pdf` · `skill_view` · `cron` |

- 编译错误自动重试、工具调用循环检测、伪执行文本拦截
- `Promise.allSettled` 并行工具执行，不因单个失败阻塞全部

### 🧠 长期记忆系统

- **Embedding Hybrid Search**：向量嵌入 + SQLite FTS5 关键词混合检索
- 跨会话持久化：关闭再打开，对话和记忆完整保留
- 记忆安全扫描：14 种 THREAT_PATTERNS 防止注入攻击
- 设置页面统一查看、编辑、导出/导入所有记忆

### 📝 Skills 技能系统

- **自动沉淀**：复杂任务完成后（≥5 次工具调用），AI 主动提议保存为技能
- **渐进式披露**：System Prompt 只注入元数据摘要，`skill_view` 按需加载完整指令，节省 Token
- **技能商店**：远程 Gallery 下载 + 本地安装 + 安全扫描
- **热重载**：SkillWatcher 监控文件变更，修改即生效
- **多层优先级**：工作区级 > 个人级 > 系统级

### 🎭 多 Agent 协作编排

- **6 种内置角色**：Planner · Architect · Coder · Runner · Reviewer · Researcher
- **Plan DAG 引擎**：复杂任务拆解为有向无环图，自动并行调度
- **运行时控制**：`subagent_steer` 重定向指令、`subagent_kill` 强制终止
- **深度安全**：`toolDenyPrefixes` 封锁子 Agent 递归委派 + `maxDepth` 限制

### 🔐 7 层安全保障

| 层 | 防护 |
|----|------|
| 策略管道 | 可配置 allow/deny 工具调用规则 |
| 变更分类 | 自动识别读/写/执行，高风险需授权 |
| 沙箱隔离 | Bash 命令防路径穿越 + 符号链接攻击 |
| 注入防护 | 14 种 Prompt Injection 模式检测 |
| 网络防护 | SSRF 拦截，阻止访问内网地址 |
| 记忆安全 | THREAT_PATTERNS 扫描写入内容 |
| 事实核查 | Answer Evidence Guard 拦截无证据断言 |

### 📊 费用追踪 (Cost Ledger)

- 每次 LLM 调用记录：Token 数、耗时、CNY 费用
- 按会话 / 按天 / 全局三级汇总
- 内置国产模型价格表（DeepSeek / 通义 / 火山 / MiniMax）
- Copilot 模型自动标记为零成本

---

## 🌏 支持的模型 Provider

| Provider | 特点 |
|----------|------|
| 🐙 **GitHub Copilot** | 免费（需 GitHub 订阅）· GPT-4o/4.1/5、Claude、Gemini、o3/o4-mini 全系列 |
| 🔮 **DeepSeek** | V3 / R1 推理模型，思考过程可见，性价比高 |
| 🌟 **通义千问** | qwen3-coder-plus 等编程增强模型 |
| 🌋 **火山引擎** | 字节跳动豆包系列 |
| 🤖 **MiniMax** | MiniMax-M1，支持思考过程 |
| 🔌 **自定义** | 任意 OpenAI 兼容 API |

**智能路由**：Light / Standard / Heavy 三档自动切换 · `@模型名` 强制指定 · 多 Key 轮换 · 限速无缝降级

---

## ⚔️ Equality vs Hermes-Agent

Hermes-Agent 是知名开源 Python CLI Agent（763 个 .py 文件，60+ 工具）。以下是核心维度对比：

| 维度 | Hermes | Equality | 结论 |
|------|--------|----------|------|
| 核心循环 | 同步 while + 8 worker 并行 | 异步 SSE + Promise.allSettled 并行 | 🟢 等价 |
| 记忆 | FTS5 + 冻结快照 | FTS5 + **Embedding 混合搜索** + 冻结快照 | 🟢 **超越** |
| 上下文压缩 | LLM 摘要 + 预剪枝 | LLM 分块摘要 + **Identifier Shield** | 🟢 **超越** |
| 智能路由 | 关键词启发式 | Light/Standard/Heavy + `@model` + Fallback | 🟢 **超越** |
| 安全防护 | 6 层 | 7 层 + 14 种注入检测 + 记忆威胁扫描 | 🟢 **超越** |
| 代码智能 | terminal grep | LSP hover/definition/references + codebase_search | 🟢 **独有** |
| 子代理控制 | 只能等完成 | steer 重定向 + kill 终止 | 🟢 **独有** |
| 费用追踪 | usage_pricing 估算 | Cost Ledger (SQLite + 三级汇总) | 🟢 **独有** |
| UI | CLI | Tauri 桌面 + React 富交互 + Diff 预览 | 🟢 **独有** |
| 工具数量 | 60+ | 29 | 🟡 Hermes 更多 |
| 平台覆盖 | CLI + 14 网关 | Desktop 单平台 | 🟡 Hermes 更广 |
| MoA | ✅ 多 LLM 协作推理 | ❌ | 🟡 Hermes 独有 |

**15 个维度中 10 个持平或超越，3 个部分差距（非核心），2 个开放差距（MoA/Profiles，非核心）。**

> 详细报告见 [equality-vs-hermes-gap-2026-04-17.md](./openspec/changes/equality-vs-hermes-gap-2026-04-17.md)

---

## 🖥️ 桌面体验

- **流式对话**：AI 回复、工具调用过程实时可见
- **Diff 预览**：写文件前展示行级差异，接受或拒绝
- **交互式操作**：对话中插入按钮、下拉选择框
- **文件附件**：拖放文件、粘贴截图（图片/PDF/文本），最多 5 个
- **暂停与重定向**：执行中暂停，输入新指令调整方向
- **会话管理**：多会话切换，按日期分组
- **主题与缩放**：浅色/深色/跟随系统，50%–200% 缩放
- **轻量安装**：~25MB 安装包，系统托盘常驻

---

## 🚀 快速开始

### 环境要求

Windows 系统，需安装：
- [Visual Studio Build Tools 2022](https://aka.ms/vs/17/release/vs_BuildTools.exe)（勾选"使用 C++ 的桌面开发"）
- Rust 工具链（`winget install Rustlang.Rustup`）
- Node.js ≥ 18 + pnpm ≥ 8

### 安装与运行

```bash
pnpm install
pnpm dev:core      # 终端 1：启动后端 Agent Core
pnpm dev:desktop   # 终端 2：启动桌面应用
```

### 第一次使用

1. 点击左侧 **⚙️ 设置** → **模型** Tab，配置至少一个 API Key
   - 最快：点击 GitHub Copilot 的「登录」按钮，完成浏览器授权（免费）
   - 推荐：同时配置 Copilot + DeepSeek，开启自动路由

2. 回到聊天页面，直接描述你想做的事

3. 探索更多：
   - `@` 唤出技能选择器，`#` 唤出工具选择器
   - "每天早上 9 点提醒我看邮件" — AI 自动创建定时任务
   - 设置 → **记忆** Tab，管理跨会话记忆

---

## 📄 License

MIT
