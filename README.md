# Equality — AI 桌面智能助理

> 面向中国大陆 Windows 用户的 AI 智能体桌面应用。基于 [OpenClaw](https://github.com/openclaw/openclaw) 设计理念，针对国内网络环境和使用习惯深度定制。

---

## ✨ 主要特性

- **多模型支持**：DeepSeek、通义千问、火山方舟（豆包）、GitHub Copilot、自定义 OpenAI 兼容接口
- **20+ 内置工具**：bash、文件读写、浏览器自动化、网页抓取、Brave 搜索、图片/PDF 读取、内存记忆、定时任务等
- **Skills 技能系统**：通过 Markdown 定义领域专家提示词，支持 Excel 分析、PDF 合同提取、钉钉推送等开箱即用技能
- **上下文压缩**：自动检测 token 用量，触发 compaction 保持长对话质量
- **智能路由 & 模型降级**：主模型失败时自动切换备用模型
- **剪贴板粘贴附件**：Ctrl+V 直接粘贴截图或文件到对话框
- **Windows 原生体验**：系统托盘、单例窗口、NSIS 安装包 / 便携版双发布

---

## 🆚 相比 OpenClaw 的独有能力

OpenClaw 是优秀的开源 AI 智能体框架，但作为服务端多用户架构，许多面向本地桌面的交互体验并未覆盖。Equality 在以下方面做了超越：

### ⏸ 任务暂停与重定向（Task Pause & Redirect）

OpenClaw 只有"立即停止"（`/stop`、`abort`），任务一旦中断上下文即丢失。

Equality 新增**工具边界暂停**：

- 点击 **⏸ 暂停** → 等当前工具执行完毕后暂停，上下文完整保留
- 暂停后输入框立即可用，可以发送新指令**重定向**任务方向
- AI 会携带完整的已执行历史继续工作，无需从头描述
- 进入暂停前自动将 session 持久化到磁盘，关闭应用也不会丢失

```
执行中  →  点「⏸ 暂停」  →  当前工具完成  →  [已暂停]
                                               ↓
                              输入新指令 → AI 按新方向继续
```

### 🔍 视觉模型自动路由（Vision Provider Auto-Routing）

OpenClaw 需要用户手动选择具备视觉能力的模型才能处理图片。

Equality 实现了**自动视觉提供商路由**：

- 当前模型不支持视觉时（如 MiniMax、纯文本 DeepSeek），`read_image` 工具自动切换到可用的视觉模型
- 回退优先级：当前模型 → GitHub Copilot gpt-4o → 通义千问 qwen-vl-max → 自定义模型 → 友好报错
- 用户无需感知，任何模型下都可以直接 Ctrl+V 粘贴截图

### 🎨 主题切换（Light / Dark / System）

OpenClaw Web UI 没有内置主题切换，默认固定深色。

Equality 支持浅色 / 深色 / 跟随系统三档，在设置界面实时切换，无需重启。

### 🔄 会话切换后流式内容恢复（Session Stream Restore）

OpenClaw 的工具卡片和流式文本只存在于前端内存（`toolStreamById` Map），切换到其他会话再切回来，执行中任务的工具卡片和已输出内容**全部丢失**。OpenClaw 的 `chat.history` 接口只返回 run 完全结束后写入磁盘的消息，无法恢复执行中的状态。OpenClaw 没有提供任何 run-events 回放或流式内容恢复接口（`chat` 命名空间仅有 `history`、`send`、`abort`、`inject` 四个方法）。

Equality 实现了**执行中内容持久化**：每次 `tool_result` 到达后立即将已完成的工具调用写入 session，用户切换会话再切回来时，`loadHistory` 即可恢复所有已完成的工具卡片。

---

## 📦 项目结构

```
equality/
├── packages/
│   ├── core/           # Node.js SEA 核心智能体（工具、LLM 提供商、会话、技能）
│   └── desktop/        # Tauri 2.x 桌面壳（Rust + React/TypeScript）
├── openspec/           # 设计规范文档（各 phase 的 proposal / design / tasks）
├── scripts/            # 构建脚本（build-all.mjs、build-portable.mjs）
└── packages/core/skills/  # 内置技能库
```

---

## 🚀 快速开始

### 环境要求（Windows）

> ⚠️ Tauri 需要 **完整的 Rust 工具链 + MSVC 编译器**，缺少任意一项均会导致编译失败。请按顺序完成以下安装。

#### 第一步：安装 Visual Studio C++ 编译工具

Tauri 依赖 MSVC linker，**VS Code ≠ Visual Studio**，必须单独安装编译工具。

**方式 A（推荐，体积小）：仅安装 Build Tools**

1. 下载 [Visual Studio Build Tools 2022](https://aka.ms/vs/17/release/vs_BuildTools.exe)
2. 安装时勾选 **"使用 C++ 的桌面开发"** 工作负载
3. 确保以下组件被选中（默认已勾选）：
   - MSVC v143 - VS 2022 C++ x64/x86 生成工具
   - Windows 11 SDK（或 Windows 10 SDK）

**方式 B：安装完整 Visual Studio 2022 Community**

安装时同样勾选 **"使用 C++ 的桌面开发"** 工作负载即可。

#### 第二步：安装 Rust

```powershell
# 下载并运行 rustup 安装器（会自动检测到 MSVC 工具链）
winget install Rustlang.Rustup
# 或手动下载：https://rustup.rs/

# 安装完成后重新打开终端，验证：
rustc --version   # 应显示 rustc 1.xx.x
cargo --version   # 应显示 cargo 1.xx.x
```

> 若 `rustup` 安装时提示找不到 MSVC 工具链，请先完成第一步再重试。

#### 第三步：安装 Node.js 和 pnpm

```powershell
winget install OpenJS.NodeJS.LTS   # Node.js ≥ 18
npm install -g pnpm                 # pnpm ≥ 8
```

#### 环境验证

```powershell
node --version    # v18.x 或更高
pnpm --version    # 8.x 或更高
rustc --version   # rustc 1.xx.x
cargo --version   # cargo 1.xx.x
```

---

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 启动 core 智能体（需先配置 API Key，见下方配置说明）
pnpm dev:core

# 另开一个终端，启动 Tauri 桌面应用
pnpm dev:desktop
```

### 构建发布包

```bash
# 构建 NSIS 安装包（equality-setup.exe）
pnpm build:installer

# 构建便携版（equality-portable.zip）
pnpm build:portable
```

---

## ⚙️ 配置

启动后点击右上角 **⚙ 设置** 进入配置界面。

### 模型配置

| 配置项 | 说明 |
|--------|------|
| DeepSeek API Key | [platform.deepseek.com](https://platform.deepseek.com) 申请 |
| 通义千问 API Key | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com) 申请 |
| 火山方舟 API Key | [console.volcengine.com/ark](https://console.volcengine.com/ark) 申请 |
| GitHub Copilot | 使用已登录 VS Code 的 Copilot Token |
| 自定义模型 | 兼容 OpenAI API 的任意端点（Key / Base URL / Model） |

### 工具配置

| 配置项 | 说明 |
|--------|------|
| Brave Search API Key | [api.search.brave.com](https://api.search.brave.com) 申请，用于 `web_search` 工具 |
| Chrome 路径 | 浏览器自动化工具所需，留空则自动检测 |

### 代理

在「设置 → 网络代理」中填入 HTTP 代理地址（如 `http://127.0.0.1:7890`），所有 LLM 请求均会走代理。

---

## 🔧 内置工具列表

| 工具 | 说明 |
|------|------|
| `bash` | 执行 shell 命令（支持流式输出、超时控制） |
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件 |
| `edit_file` | 基于字符串替换的精确编辑 |
| `apply_patch` | 应用 unified diff 补丁 |
| `glob` | 文件模式匹配 |
| `grep` | 文本搜索 |
| `list_dir` | 列出目录 |
| `web_search` | Brave Search 网页搜索 |
| `web_fetch` | 抓取网页内容（支持 JS 渲染） |
| `browser` | Puppeteer 浏览器自动化 |
| `read_image` | 读取图片（传给视觉模型） |
| `read_pdf` | 提取 PDF 文本 |
| `memory_store` | 存储记忆片段（SQLite FTS5） |
| `memory_search` | 搜索历史记忆 |
| `cron_add` | 添加定时任务 |
| `cron_list` | 查看定时任务 |
| `cron_remove` | 删除定时任务 |
| `process_start` | 启动后台进程 |
| `process_list` | 查看进程列表 |

---

## 🎯 Skills 技能库

技能通过 `packages/core/skills/<name>/SKILL.md` 定义，使用时在对话中 `@技能名` 激活。

| 技能 | 功能 |
|------|------|
| `coding` | 代码生成与重构专家 |
| `python` | Python 脚本开发 |
| `nodejs` | Node.js 开发 |
| `git` | Git 操作辅助 |
| `markdown` | Markdown 写作 |
| `excel-cost-diff-analysis` | Excel 费用差异分析 |
| `excel-quarterly-cost-diff-analysis` | 季度费用环比分析 |
| `pdf-contract-llm-extract` | PDF 合同关键信息提取 |
| `web-fetch` | 网页内容抓取整理 |
| `aliyun-oss` | 阿里云 OSS 操作 |
| `dingtalk` | 钉钉消息推送 |
| `wechat-push` | 微信推送（企业微信） |
| `skill-creator` | 创建新技能的元技能 |
| `openspec-skill` | 编写 OpenSpec 设计文档 |

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│         Tauri 2.x Desktop Shell         │
│  React + TypeScript + Vite (前端 UI)    │
│  Rust (系统托盘、窗口管理、文件代理)      │
└─────────────────┬───────────────────────┘
                  │ HTTP localhost:18788
                  ▼
┌─────────────────────────────────────────┐
│       Node.js SEA Core Agent            │
│                                         │
│  ┌─────────┐  ┌──────────┐  ┌────────┐ │
│  │ Session │  │  Tools   │  │ Skills │ │
│  │  Queue  │  │ Registry │  │ Loader │ │
│  └────┬────┘  └────┬─────┘  └───┬────┘ │
│       └────────────┼────────────┘       │
│                ┌───▼───┐                │
│                │ Agent │                │
│                │Runner │                │
│                └───┬───┘                │
│                    │                    │
│  ┌─────────────────▼─────────────────┐  │
│  │         LLM Provider Router       │  │
│  │  DeepSeek / Qwen / Volc /         │  │
│  │  Copilot / Custom + Fallback      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**数据存储**：`%APPDATA%\Equality\`
- `settings.json` — API Key 等配置（Windows DPAPI 加密）
- `sessions/` — 会话历史（JSON）
- `memory.db` — SQLite 记忆库（FTS5 全文索引）
- `skills/` — 用户自定义技能

---

## 📋 开发规范

本项目使用 **OpenSpec** 规范管理功能迭代，每个功能对应 `openspec/changes/<name>/` 目录下的：
- `proposal.md` — 需求描述
- `design.md` — 技术设计
- `tasks.md` — 实现任务清单
- `specs/` — 详细接口规范

详见 [openspec/README.md](./openspec/README.md)。

---

## 📄 License

MIT
