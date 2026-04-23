# Claude Code Haha (cc-haha) 项目深度分析

> 分析日期：2026-04-23  
> 项目来源：基于 Claude Code 泄露源码修复的本地可运行版本  
> 作者：NanmiCoder (relakkes)

---

## 一、项目定位与设计思想

### 1.1 核心定位

cc-haha 是一个**本地化的 AI Coding Agent 全栈平台**，其核心思想是：

> **将 Anthropic 官方 Claude Code CLI 的完整能力本地化，同时在其之上扩展出桌面 GUI、远程 IM 控制、多 Agent 编排等高级功能。**

设计哲学可归纳为三个层次：

1. **忠实还原**：完整保留官方 Claude Code 的 TUI 交互、Tool 系统、权限模型
2. **开放接入**：解除 Anthropic API 绑定，支持任意兼容 API（MiniMax、OpenRouter、自部署等）
3. **能力延伸**：在原有 CLI 之上叠加 Desktop GUI、Channel 远程驱动、Multi-Agent Teams、Skills 系统等

### 1.2 设计原则

| 原则 | 体现 |
|------|------|
| **单体代码库** | CLI Core + Server + Desktop 全部在一个 monorepo，共享类型和工具定义 |
| **进程隔离** | CLI 是独立 Bun 进程；Desktop 通过 HTTP+WS Server 桥接；Tauri Shell 只做壳 |
| **渐进式复杂度** | CLI → `--print` 无头模式 → Server API → Desktop GUI → Channel IM → Multi-Agent |
| **Feature Flag 驱动** | 大量使用 `bun:bundle` 的 `feature()` 做编译期 DCE（Dead Code Elimination） |
| **约定优于配置** | 工具注册、Slash 命令、Skills 均采用目录即模块的约定式组织 |

---

## 二、整体架构（从高到低）

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户交互层                                │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ Ink TUI  │  │ Desktop GUI  │  │ Channel (TG/飞书/Discord) │ │
│  │ (React)  │  │ (Tauri+React)│  │ (adapters/)               │ │
│  └────┬─────┘  └──────┬───────┘  └────────────┬──────────────┘ │
│       │               │                        │                │
├───────┴───────────────┴────────────────────────┴────────────────┤
│                     通信桥接层                                   │
│  CLI 直接调用  │  HTTP REST + WebSocket Server (Bun.serve)      │
│               │  端口 3456，JSON API + WS 实时推送               │
├─────────────────────────────────────────────────────────────────┤
│                     核心引擎层 (src/)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ QueryEngine  │  │  AppState    │  │  Tool System           │ │
│  │ (对话循环)   │  │  (状态管理)   │  │  (50+ 内置工具)        │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────────┘ │
│         │                 │                    │                 │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌────────┴──────────────┐ │
│  │ query()      │  │ createStore  │  │ AgentTool / BashTool  │ │
│  │ API 调用     │  │ 发布-订阅    │  │ FileEdit / WebSearch  │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                     服务与基础设施层                              │
│  API Service │ MCP Client │ LSP │ OAuth │ Analytics │ Session   │
│  Memory      │ Skills     │ Plugins │ Policy Limits │ Compact  │
├─────────────────────────────────────────────────────────────────┤
│                     运行时与平台层                                │
│  Bun Runtime │ Tauri 2 (Desktop) │ Computer Use (Python)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、代码结构详解

### 3.1 根目录结构

```
cc-haha/
├── bin/                    # CLI 可执行入口 (claude-haha shell 脚本)
├── src/                    # 🔑 核心源码 (CLI + Server + Agent 引擎)
├── desktop/                # 🖥️ 桌面端 (Tauri 2 + React SPA)
├── adapters/               # 📡 IM Channel 适配器 (Telegram/飞书)
├── runtime/                # 🐍 Computer Use Python helper
├── docs/                   # 📖 VitePress 文档站
├── stubs/                  # 类型桩文件
├── fixtures/               # 测试 fixtures
├── scripts/                # 构建/发布脚本
├── package.json            # Bun 项目，依赖 ~80 个包
└── tsconfig.json
```

### 3.2 src/ — 核心引擎（约 60+ 个子目录/模块）

这是整个项目的大脑，组织清晰，职责分明：

#### 入口与启动

| 路径 | 职责 |
|------|------|
| `entrypoints/cli.tsx` | CLI Bootstrap 入口，快速路径处理 (--version, --dump-system-prompt 等) |
| `entrypoints/init.ts` | 初始化：配置加载、遥测、GrowthBook |
| `entrypoints/mcp.ts` | MCP 服务器入口 |
| `main.tsx` | **主函数**（~4700 行），Commander 参数解析 → 初始化 → 启动 REPL/print 模式 |

#### 对话引擎

| 路径 | 职责 |
|------|------|
| `QueryEngine.ts` | **核心对话循环**（~1300 行），管理 turn、tool call、compact、memory |
| `query.ts` / `query/` | 底层 API 调用、token budget 计算、stop hooks |
| `context.ts` | System Context 构建（git status、CLAUDE.md、memory 注入） |
| `constants/prompts.ts` | System Prompt 拼装 |

#### 状态管理

| 路径 | 职责 |
|------|------|
| `state/store.ts` | 极简发布-订阅 Store（`createStore<T>`） |
| `state/AppState.tsx` | React Context Provider，包裹整个 TUI |
| `state/AppStateStore.ts` | AppState 类型定义与默认值 |

**设计亮点**：`createStore` 仅 ~30 行，实现了 `getState / setState / subscribe`，与 React 的 `useSyncExternalStore` 无缝对接，无需引入 Zustand 等外部库。

#### 工具系统（50+ 工具）

```
src/tools/
├── AgentTool/           # 子 Agent 调度（多 Agent 核心）
├── BashTool/            # Shell 命令执行
├── PowerShellTool/      # Windows PowerShell 工具
├── FileReadTool/        # 文件读取
├── FileWriteTool/       # 文件写入
├── FileEditTool/        # 文件编辑 (diff patch)
├── GlobTool/            # 文件搜索
├── GrepTool/            # 文本搜索
├── WebSearchTool/       # 网页搜索
├── WebFetchTool/        # 网页抓取
├── WebBrowserTool/      # 浏览器控制
├── MCPTool/             # MCP 服务器工具桥接
├── LSPTool/             # LSP 语言服务协议
├── SkillTool/           # Skills 执行
├── TaskCreateTool/      # 后台任务创建
├── TaskListTool/        # 任务列表
├── TeamCreateTool/      # Team 创建（多 Agent 编排）
├── SendMessageTool/     # Agent 间消息传递
├── ScheduleCronTool/    # 定时任务
├── TerminalCaptureTool/ # 终端截图
├── NotebookEditTool/    # Jupyter Notebook 编辑
├── ReviewArtifactTool/  # 代码审查
├── TodoWriteTool/       # TODO 管理
├── REPLTool/            # REPL 交互
├── MonitorTool/         # 监控工具
├── shared/              # 工具间共享逻辑
└── utils.ts             # 工具通用工具函数
```

**工具注册机制**：`tools.ts` 统一导入所有工具，通过 `feature()` 做编译期条件裁剪，再由 `getTools()` 导出。

每个工具遵循 `Tool` 接口（`Tool.ts`，~793 行）：
- `name` — 工具名
- `description` — 给 LLM 的描述
- `inputSchema` — Zod/JSON Schema 参数定义
- `isEnabled()` — 是否启用
- `call()` — 执行逻辑
- `renderToolUse()` / `renderToolResult()` — TUI 渲染

#### 任务系统

```
src/tasks/
├── LocalShellTask/          # 本地 Shell 任务
├── LocalAgentTask/          # 本地子 Agent 任务
├── RemoteAgentTask/         # 远程 Agent 任务
├── InProcessTeammateTask/   # 进程内 Teammate
├── LocalWorkflowTask/       # 本地工作流
├── MonitorMcpTask/          # MCP 监控任务
├── DreamTask/               # 后台"做梦"任务
└── LocalMainSessionTask.ts  # 主会话任务
```

`Task.ts` 定义了统一的 `TaskType`（7 种）、`TaskStatus`（5 种），每种 Task 提供 `kill()` 方法。

#### 多 Agent 编排

| 路径 | 职责 |
|------|------|
| `coordinator/coordinatorMode.ts` | Coordinator 模式开关、系统提示构建 |
| `coordinator/workerAgent.ts` | Worker Agent 执行逻辑 |
| `tools/AgentTool/` | Agent 作为工具被调度 |
| `tools/TeamCreateTool/` | 创建 Team（多 Agent 协作） |
| `tools/SendMessageTool/` | Agent 间消息传递 |

**设计思想**：Coordinator-Worker 模式，主 Agent 作为 Coordinator，通过 `AgentTool` 派生子 Agent，通过 `SendMessageTool` 实现 Agent 间通信。

#### 服务层

```
src/services/
├── api/                     # Anthropic/Claude API 客户端
├── mcp/                     # MCP 服务器管理
├── lsp/                     # LSP 语言服务
├── oauth/                   # OAuth 认证
├── compact/                 # 上下文压缩
├── analytics/               # 遥测分析 (GrowthBook)
├── SessionMemory/           # 会话记忆持久化
├── extractMemories/         # 自动记忆提取
├── skillSearch/             # Skills 搜索
├── policyLimits/            # 策略限制
├── plugins/                 # 插件管理
├── tools/                   # 工具相关服务
├── voice.ts                 # 语音输入
├── PromptSuggestion/        # 提示建议
└── tokenEstimation.ts       # Token 估算
```

#### Slash 命令系统

`src/commands/` 下有 **100+ 个子命令**，每个命令一个目录，覆盖从基础操作到高级特性：

核心类别：
- **会话管理**：`session/`, `resume/`, `compact/`, `export/`
- **Agent 控制**：`agents/`, `tasks/`, `teams/`, `buddy/`
- **开发工具**：`commit.ts`, `diff/`, `review/`, `branch/`
- **配置管理**：`config/`, `model/`, `permissions/`, `theme/`
- **Skills**：`skills/`, `workflows/`
- **远程**：`remote-env/`, `teleport/`, `ssh/`
- **调试**：`doctor/`, `debug-tool-call/`, `perf-issue/`

#### TUI 组件

```
src/components/              # Ink (React for CLI) 组件
├── App.tsx                  # 根组件
├── Messages.tsx             # 消息列表
├── PromptInput/             # 输入框
├── diff/                    # Diff 渲染
├── StructuredDiff/          # 结构化 Diff
├── Settings/                # 设置界面
├── permissions/             # 权限对话框
├── mcp/                     # MCP 管理 UI
├── memory/                  # 记忆查看 UI
├── skills/                  # Skills UI
├── teams/                   # Teams UI
├── agents/                  # Agents UI
└── ... (150+ 组件文件)
```

#### 其他重要模块

| 路径 | 职责 |
|------|------|
| `skills/` | Skills 系统：bundled skills + 动态加载 + MCP skills |
| `plugins/` | 插件系统 |
| `memdir/` | 记忆目录管理（跨会话持久化记忆） |
| `hooks/` | ~80 个 React Hooks（TUI 业务逻辑） |
| `voice/` | 语音输入/TTS |
| `vim/` | Vim 模式输入 |
| `remote/` | 远程会话管理 |
| `daemon/` | 守护进程模式 |
| `bridge/` | IDE 桥接（VS Code 等） |
| `proactive/` | 主动式 Agent 能力 |

### 3.3 server/ — HTTP + WebSocket 服务

为 Desktop GUI 和远程控制提供 API：

```
src/server/
├── index.ts                # Bun.serve 启动（HTTP + WS）
├── server.ts               # 服务实例
├── router.ts               # REST API 路由分发
├── api/                    # API handlers (16 个)
│   ├── sessions.ts         # 会话 CRUD
│   ├── conversations.ts    # 对话（chat stream）
│   ├── settings.ts         # 设置管理
│   ├── models.ts           # 模型选择
│   ├── providers.ts        # Provider 管理
│   ├── agents.ts           # Agent/Task 管理
│   ├── teams.ts            # Teams 管理
│   ├── skills.ts           # Skills 管理
│   ├── scheduled-tasks.ts  # 定时任务
│   ├── search.ts           # 搜索
│   ├── filesystem.ts       # 文件系统
│   ├── adapters.ts         # IM 适配器
│   ├── computer-use.ts     # Computer Use
│   └── haha-oauth.ts       # OAuth
├── ws/                     # WebSocket 处理
│   ├── handler.ts          # WS 连接管理
│   └── events.ts           # 事件类型
├── middleware/              # 中间件（CORS、Auth）
├── proxy/                  # 代理
├── services/               # 服务端服务
│   ├── cronScheduler.ts    # 定时调度
│   ├── teamWatcher.ts      # Team 监控
│   └── providerService.ts  # Provider 管理
└── __tests__/              # 测试
```

**通信模型**：
- REST API：会话管理、设置、Agent 控制等 CRUD
- WebSocket `/ws/:sessionId`：实时推送 Agent 输出流、工具调用进度

### 3.4 desktop/ — 桌面端（Tauri 2 + React）

```
desktop/
├── src-tauri/              # Tauri 2 Rust Shell
├── src/                    # React SPA
│   ├── pages/              # 页面组件
│   │   ├── ActiveSession.tsx   # 活跃会话（主聊天界面）
│   │   ├── Settings.tsx        # 设置页
│   │   ├── AgentTeams.tsx      # Teams 管理
│   │   ├── ScheduledTasks.tsx  # 定时任务
│   │   └── ...
│   ├── components/         # UI 组件
│   │   ├── chat/           # 聊天组件
│   │   ├── controls/       # 控制组件
│   │   ├── layout/         # 布局
│   │   ├── markdown/       # Markdown 渲染
│   │   ├── settings/       # 设置组件
│   │   ├── skills/         # Skills 组件
│   │   ├── tasks/          # 任务组件
│   │   ├── teams/          # Teams 组件
│   │   └── shared/         # 共享组件
│   ├── stores/             # Zustand-like 状态管理 (17 个 store)
│   │   ├── chatStore.ts        # 聊天状态
│   │   ├── sessionStore.ts     # 会话状态
│   │   ├── settingsStore.ts    # 设置状态
│   │   ├── agentStore.ts       # Agent 状态
│   │   ├── teamStore.ts        # Team 状态
│   │   ├── taskStore.ts        # 任务状态
│   │   ├── skillStore.ts       # Skills 状态
│   │   ├── providerStore.ts    # Provider 状态
│   │   ├── tabStore.ts         # 多标签状态
│   │   └── ...
│   ├── api/                # API 客户端（对接 server/）
│   ├── hooks/              # React Hooks
│   ├── i18n/               # 国际化
│   └── types/              # 类型定义
├── scripts/                # 构建脚本
├── sidecars/               # Sidecar 进程
└── vite.config.ts          # Vite 构建
```

**Desktop 架构要点**：
- Tauri 2 作为原生壳，不承担业务逻辑
- React SPA 通过 HTTP/WS 与 `src/server/` 通信
- 17 个 Store 管理各领域状态
- 多标签多会话支持

### 3.5 adapters/ — IM Channel 适配器

```
adapters/
├── common/                 # 共享逻辑
├── telegram/               # Telegram Bot 适配器
└── feishu/                 # 飞书 Bot 适配器
```

通过 IM 消息远程驱动 Agent，实现不在电脑前也能用 Agent 编码。

---

## 四、关键数据流

### 4.1 对话请求生命周期

```
User Input
  → main.tsx (Commander 解析)
    → QueryEngine.ts (对话循环)
      → context.ts (构建 System Context: git status + CLAUDE.md + memory)
      → query.ts (API 调用)
        → services/api/ (Anthropic SDK / 第三方 API)
      ← Stream Response
      → Tool Call 分发 (tools.ts → 具体 Tool)
        → 权限检查 (hooks/useCanUseTool)
        → 执行 + 结果收集
      → 继续对话 / compact / 结束
```

### 4.2 Desktop 数据流

```
Desktop UI (React)
  → API Client (fetch/WebSocket)
    → src/server/router.ts
      → api/conversations.ts (聊天)
        → 内部创建 CLI 子进程 / 复用 session
          → QueryEngine 对话循环
      ← WebSocket 实时推送结果
    ← REST Response (CRUD)
  → stores/ 更新状态
  → React 渲染
```

---

## 五、核心设计模式与亮点

### 5.1 Feature Flag + DCE

```typescript
// bun:bundle 的 feature() 在编译期求值
// 外部构建中 VOICE_MODE=false → 整个分支被消除
const VoiceProvider = feature('VOICE_MODE') 
  ? require('../context/voice.js').VoiceProvider 
  : ({ children }) => children;
```

大量使用此模式区分内部版/外部版，控制功能开关。

### 5.2 极简 Store

```typescript
export function createStore<T>(initialState: T, onChange?: OnChange<T>): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState: (updater) => { /* ... */ },
    subscribe: (listener) => { /* ... */ },
  };
}
```

零依赖的发布-订阅模式，配合 React 18 的 `useSyncExternalStore` 实现高性能状态同步。

### 5.3 目录即模块的工具注册

每个工具一个目录，包含：
- `XxxTool.ts` — 工具实现
- `prompt.ts` — LLM prompt 片段
- `constants.ts` — 常量
- `toolName.ts` — 工具名（避免循环依赖）

### 5.4 Server-CLI 同构

Server 不是独立进程管理对话——而是**启动/复用 CLI 进程**来执行 Agent 任务。CLI 和 Desktop 共享同一套文件系统（session 存储、memory、config），数据天然互通。

### 5.5 多 Agent Coordinator-Worker 模式

主 Agent 作为 Coordinator：
1. 通过 `TeamCreateTool` 创建 Worker Agent Team
2. 通过 `AgentTool` 调度子 Agent
3. Worker 通过 `SendMessageTool` 向 Coordinator 汇报
4. Coordinator 整合结果

---

## 六、代码规模统计

| 模块 | 估算文件数 | 核心复杂度 |
|------|-----------|-----------|
| `src/` 根 | ~20 | main.tsx (~4700行), QueryEngine.ts (~1300行), Tool.ts (~793行) |
| `src/tools/` | ~60 目录, ~200+ 文件 | 50+ 工具实现 |
| `src/services/` | ~40+ 文件 | API/MCP/LSP/Memory/Compact |
| `src/commands/` | ~100+ 目录 | 100+ Slash 命令 |
| `src/components/` | ~150+ 文件 | Ink TUI 全套 UI |
| `src/hooks/` | ~80 文件 | 业务 Hooks |
| `src/server/` | ~30 文件 | HTTP+WS 服务 |
| `src/state/` | ~6 文件 | 状态管理核心 |
| `desktop/src/` | ~80+ 文件 | Desktop GUI |
| `adapters/` | ~15 文件 | TG/飞书适配 |
| **总计** | **~700+ 文件** | **大型工程** |

---

## 七、总结

cc-haha 是目前开源社区中**最完整的 Claude Code 本地化实现**，其架构设计体现了以下思想：

1. **CLI First**：以 TUI 为核心，Desktop/Channel 都是 CLI 的视图层延伸
2. **可组合的工具系统**：50+ 工具 + Skills + MCP，覆盖开发全场景
3. **多 Agent 原生支持**：Coordinator-Worker + Teams 协作，不是后加的补丁
4. **编译期优化**：Feature Flag DCE 确保外部构建精简
5. **全栈一体**：从 CLI 到 Desktop 到 IM 到 Computer Use，一个代码库搞定

对 Equality 项目而言，cc-haha 的工具系统组织方式、记忆系统设计、多 Agent 编排模式和 Server-CLI 同构架构都具有很高的参考价值。
