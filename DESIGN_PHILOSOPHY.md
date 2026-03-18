# Equality 项目设计文档
> 借鉴 OpenClaw 设计思想，构建一套面向中国大陆 Windows 用户的 AI 桌面智能助理

---

## 零、OpenClaw 已覆盖的 PRC 模型（现状摸底）

OpenClaw 已经对国内模型做了一定支持，但**不是重点，且存在明显空白**：

| Provider | 模型 | API 地址 | 状态 |
|---------|------|---------|------|
| `volcengine` (豆包) | doubao-seed-1-8、Kimi K2.5、GLM 4.7、DeepSeek V3.2 | `ark.cn-beijing.volces.com` | ✅ 已支持 |
| `byteplus` | ark-code-latest | `ark.cn-beijing.volces.com/api/coding` | ✅ 已支持（Coding Plan）|
| `minimax` | MiniMax-M2.5、MiniMax-VL-01 | `api.minimax.io` | ✅ 已支持（含视觉）|
| `moonshot` | kimi-k2.5 | `api.moonshot.ai` | ✅ 已支持 |
| `kimi-coding` | k2p5 | `api.kimi.com/coding` | ✅ 已支持（Coding Plan）|
| `modelstudio` (阿里云) | qwen3.5-plus、qwen3-coder-next/plus | `coding-intl.dashscope.aliyuncs.com` | ✅ 已支持 |
| `qianfan` (百度) | deepseek-v3.2 | `qianfan.baidubce.com` | ✅ 基础支持 |
| `xiaomi` (小米) | mimo-v2-flash | `api.xiaomimimo.com` | ✅ 已支持 |

**主要空白（equality 重点填补）：**
- ❌ **DeepSeek 直连**（api.deepseek.com）— 最重要的国内模型，OpenClaw 只通过第三方平台间接支持
- ❌ **智谱 GLM**（api.zhipuai.cn）— 国内主流，仅通过 volcengine 间接访问
- ❌ **通义千问直连**（dashscope.aliyuncs.com 国内端点）— 只支持 coding-intl 国际端点
- ❌ **百川 Baichuan** — 无支持
- ❌ **零一万物 Yi**（api.lingyiwanwu.com）— 无支持
- ❌ **国内 IM 渠道**：微信（企业微信/公众号）、钉钉、飞书 — 完全没有
- ❌ **本地化记忆索引**：embedding 主要依赖 OpenAI/Voyage（需要境外 API）

---

---

## 一、本质认知：它不是聊天机器人

OpenClaw 不是"把消息转发给 AI"的代理。它的本质是：

> **AI 代理的神经系统** —— 感知（多渠道输入）→ 记忆（Session 持久化）→ 思考（LLM + Skills）→ 行动（Tools）→ 表达（多渠道输出）

这个闭环才是核心。渠道（Telegram/Discord/WhatsApp）只是 I/O 外设，LLM 只是推理引擎，真正的价值在于**中间的编排层**。

---

## 二、三层架构

```
┌─────────────────────────────────────────────────────────┐
│                    GATEWAY LAYER                        │
│  WebSocket 控制平面 (ws://127.0.0.1:18789)              │
│  - 渠道适配器 (Telegram/Discord/WhatsApp/Slack)         │
│  - 消息路由 (routing/)                                  │
│  - 认证授权 (auth.ts / dmPolicy)                        │
│  - Cron 调度 (server-cron.ts)                           │
│  - HTTP API (server-methods.ts)                         │
└────────────────────┬────────────────────────────────────┘
                     │ ACP Protocol (@agentclientprotocol/sdk)
                     │ PromptRequest / PromptResponse
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  AGENT RUNTIME LAYER                    │
│  Pi Embedded Runner (src/agents/)                       │
│  - runEmbeddedPiAgent()                                 │
│  - Skills 加载与注入                                    │
│  - Tools 注册 (createOpenClawTools)                     │
│  - Compaction (超长上下文压缩)                          │
│  - Subagent 编排 (sessions_spawn / sessions_send)       │
│  - Sandbox 隔离 (Docker / 路径策略)                     │
└────────────────────┬────────────────────────────────────┘
                     │ Session Store API
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  SESSION MODEL LAYER                    │
│  InMemorySessionStore (src/acp/session.ts)              │
│  - maxSessions = 5000                                   │
│  - idleTtlMs = 24 * 60 * 60 * 1000 (24小时)            │
│  - reapIdleSessions() 定时清理                          │
│  - cancelActiveRun() 中止控制                           │
│  - UUID 会话标识 (session-id.ts)                        │
└─────────────────────────────────────────────────────────┘
```

---

## 三、ACP 协议：关键发现

**Agent Client Protocol** 是 Gateway 与代理运行时之间的标准化协议。

```typescript
import {
  PROTOCOL_VERSION,
  Agent,
  PromptRequest,
  PromptResponse,
  // ...
} from "@agentclientprotocol/sdk";
```

**重要意义：**
- 这是公开的 npm 包，不是私有实现
- 复刻时可以直接使用，或理解其数据结构后自行实现
- 解耦了"谁来处理消息"（Gateway）和"如何处理消息"（Agent）

**ACP 核心参数（来自 translator.ts）：**
```typescript
{
  thought_level: 0-3,      // 思维深度
  verbose_level: 0-3,      // 输出详细度
  reasoning_level: 0-3,    // 推理级别
  response_usage: bool,     // 是否返回 token 用量
  elevated_level: bool,     // 是否升级权限
  MAX_PROMPT_BYTES: 2MB,   // 防 DoS 限制
}
```

---

## 四、Tools 系统（硬编码能力）

Tools 是代理的"手"，是实际执行能力。来自 `createOpenClawTools()` 的完整工具清单：

| 工具 | 功能 |
|------|------|
| `bash` | 在沙箱中执行 Shell 命令 |
| `browser` | 控制无头浏览器，截图、点击、导航 |
| `canvas` | 图像生成和编辑画布 |
| `read/write` | 文件系统操作（受路径策略约束） |
| `sessions_send` | 向其他已有 Session 发送消息（跨代理通信） |
| `sessions_spawn` | 创建并运行新的子代理 Session |
| `sessions_list` | 列出活跃 Session |
| `sessions_history` | 查看 Session 历史 |
| `cron` | 注册定时任务 |
| `nodes` | 调用外部 HTTP 节点 |
| `web_fetch` | 抓取网页内容 |
| `web_search` | 网络搜索 |
| `message` | 向渠道发送消息（渠道路由） |
| `image` | 处理图片输入 |
| `tts` | 文字转语音 |
| `pdf` | PDF 文档处理 |
| `agents_list` | 列出可用代理 |
| `gateway` | 直接调用 Gateway API |
| `subagents` | 管理子代理 |

**关键设计原则：** Tools 具有 policy pipeline（策略管道），每个工具调用在执行前会经过 `tool-policy-pipeline.ts` 校验，可实现权限控制、审计日志、调用拦截。

---

## 五、Skills 系统（软编码知识）

Skills 是代理的"记忆和知识库"，以 `SKILL.md` 文件形式存在。

**文件结构（完整 frontmatter）：**
```markdown
---
name: github
description: Working with GitHub repositories, PRs, issues, and code reviews
tools: bash, read, write
user-invocable: true
disable-model-invocation: false
openclaw:
  always: false
  emoji: 🐙
  primaryEnv: GITHUB_TOKEN
  requires:
    bins: [gh]
    env: [GITHUB_TOKEN]
  install:
    - kind: brew
      formula: gh
---

# GitHub Skill
当你需要操作 GitHub 时...（详细指令）
```

**Skills 加载的六层优先级（低→高）：**
```
1. extra dirs      (config.skills.load.extraDirs)  —— 最低优先
2. bundled         (openclaw 内置 50+ skills)
3. managed         (~/.config/openclaw/skills/)
4. agents-personal (~/.agents/skills/)
5. agents-project  (<workspace>/.agents/skills/)
6. workspace       (<workspace>/skills/)           —— 最高优先（同名覆盖）
```

**实际加载逻辑（workspace.ts 源码发现）：**
- 按名称 Map 合并，后加载的覆盖先加载的（同名 Skill 由工作区版本胜出）
- 每个来源最多 200 个 Skills（`maxSkillsLoadedPerSource`）
- 注入 Prompt 上限：最多 150 个 + 30,000 字符（超出时二分法截断）
- 单个 SKILL.md 最大 256KB
- 路径用 `~` 替代 home 目录，节省 400-600 tokens

**SkillEntry 数据结构（types.ts）：**
```typescript
type SkillEntry = {
  skill: Skill;              // name, baseDir, filePath, content
  frontmatter: Record<string, string>;
  metadata?: OpenClawSkillMetadata;  // always, primaryEnv, requires, install
  invocation?: SkillInvocationPolicy; // userInvocable, disableModelInvocation
};
```

**Skills 的安装机制：**
Skill 可声明自己的依赖安装方式（`install` 字段），支持：
- `brew` - macOS Homebrew 公式
- `node` - npm 包
- `go` - Go 模块
- `uv` - Python uv 包
- `download` - 直接下载二进制

**Skill 热更新：**
`skills/refresh.ts` 通过 `registerSkillsChangeListener` 监听文件变化，变化后 30 秒防抖延迟再刷新远端节点缓存。

**Skills vs Tools 的本质区别：**
```
Tools  = 硬编码执行能力（JavaScript 函数，需要发版）
Skills = 软编码领域知识（Markdown 文档，随时修改）
```

这个解耦设计极为优雅——用户可以不写代码只写 Markdown 来扩展代理能力，而开发者只需维护核心工具集。

---

## 六、Session 模型与持久化

### Session 的生命周期

```
用户发消息
    │
    ▼
路由解析 (resolve-route.ts)
    │  根据 account-id / session-key 查找或创建 Session
    ▼
Session 获取 / 创建
    │  InMemorySessionStore.getOrCreate(sessionKey)
    ▼
加载历史消息 (transcript)
    │  从磁盘或内存读取对话历史
    ▼
注入 Skills + System Prompt
    ▼
runEmbeddedPiAgent() 执行
    │  流式返回，边生成边发送
    ▼
持久化 transcript
    │  session-write-lock.ts 防并发写入冲突
    ▼
回复渠道
```

### Session Key 设计

Session 通过 `session-key.ts` 唯一标识，格式大致为：

```
channel:accountId:targetId
例：telegram:group:12345:topic:67890
```

这使得同一个用户、同一个群组、同一个话题线程 → 对应同一个持久化 Session，上下文完全隔离且自动路由。

### Transcript 事件系统

来自 `src/sessions/transcript-events.ts`，Session 的每一次交互都是一个事件流：
- `user_message` → 用户输入
- `assistant_text` → AI 文本响应
- `tool_call` → 工具调用请求
- `tool_result` → 工具执行结果
- `compaction` → 上下文压缩事件

---

## 七、多代理编排

这是 OpenClaw 最强大的能力，也是最难复刻的部分。

### sessions_spawn（父子代理）

```typescript
// 父代理在对话中可以：
sessions_spawn({
  task: "分析这份报告并生成摘要",
  model: "claude-opus-4-5",
  skills: ["research", "writing"],
  timeout: 300000,
})
```

子代理在隔离的 Docker 沙箱中运行，有独立的文件系统、独立的 Session，完成后结果返回父代理。

### sessions_send（对等通信）

```typescript
// 代理 A 可以直接向代理 B 发消息：
sessions_send({
  sessionKey: "coding-agent:main",
  message: "请帮我 review 这段代码",
})
```

这实现了真正的**多代理网格**，代理之间可以协作、委托、专业化分工。

### 深度限制（subagent-depth.ts）

为防止无限递归，有最大嵌套深度限制，超限时自动返回错误。

---

## 八、安全模型

### 最小权限原则

```
主 Session (main)  →  完整工具权限
子 Session (spawned) →  受限工具集（默认无 bash）
Cron Session       →  只读工具（默认）
```

### 渐进授权（Progressive Trust）

```
1. 白名单 (allowFrom)      → 只有指定账户能触发代理
2. DM Policy (dmPolicy)    → 私聊配对机制，防止陌生人滥用
3. Elevated Level          → 用户可临时请求提升权限（需审批）
4. Tool Policy Pipeline    → 每个工具调用都可配置审批流
```

### 沙箱隔离

- 主 Session：宿主机访问（受路径策略约束）
- 子 Session：Docker 容器隔离，独立挂载点
- 工具执行路径：`bash-tools.exec-host-*.ts` 区分 Docker/Node 两种执行模式

---

## 九、路由系统

`src/routing/` 目录是消息路由的核心：

```
inbound message
    │
    ▼
resolve-route.ts
    │  输入：{channel, senderId, targetId, threadId}
    │  输出：{accountId, sessionKey, agentId}
    ▼
account-lookup.ts   → 查找或创建账户
session-key.ts      → 构造会话键
bindings.ts         → 将 senderId 绑定到 accountId
```

**连续性保证（session-key.continuity）**：用户在不同渠道（如 Telegram 私聊 → 群组）发消息时，Session Key 不同，上下文自动隔离，这是正确行为。

---

## 十、复刻路径规划

基于以上理解，**正确的复刻顺序**如下（避免典型错误路径）：

### ❌ 错误路径
```
接入渠道 → 转发消息给 Claude → 发现没有上下文 → 加内存 → 发现没有工具 → 加工具 → 越补越乱
```

### ✅ 正确路径

**阶段 1：Session + Memory 核心（最优先）**
```
- Session Store（内存，后期可换 Redis）
- Session Key 路由算法
- Transcript 存储（对话历史持久化）
- Compaction（超长上下文时自动压缩）
```

**阶段 2：Tools + Skills 加载**
```
- 基础工具注册（bash、read/write、web_fetch）
- Skills 目录扫描和注入
- Tool Policy（权限控制）
```

**阶段 3：渠道适配（只是 I/O）**
```
- Telegram 适配器（最简单，推荐第一个）
- 统一消息格式（ChannelMessage）
- 消息队列（防止并发覆盖）
```

**阶段 4：多代理编排（高级）**
```
- sessions_spawn（子代理）
- sessions_send（跨代理通信）
- Docker 沙箱
```

---

## 十一、技术栈选型（用 Claude 模型重新实现）

基于以上理解，推荐实现技术栈：

| 层 | OpenClaw 原版 | 建议替代方案 |
|----|--------------|-------------|
| 运行时 | Node.js ≥22, TypeScript | Node.js 22 + TypeScript (保持) |
| AI 接入 | ACP SDK + Pi Agent | `@anthropic-ai/sdk` 直接调用 |
| Session 存储 | InMemory + 磁盘 | 初期 Map，后期 SQLite/Redis |
| 多代理 | sessions_spawn | 独立进程 / Worker Thread |
| Telegram | grammY | grammY (保持) |
| 安全沙箱 | Docker | Docker (保持) 或 VM2 |
| 配置格式 | YAML + SKILL.md | OpenSpec 规范驱动 |

---

## 十二、与 OpenSpec 的结合方式

OpenSpec 倡导"先写规格再实现"，这与我们的复刻策略完美契合：

```
1. 写 SPEC.md 描述 Session 数据结构
2. 写 SPEC.md 描述工具接口契约
3. 写 SPEC.md 描述 Skills 加载规则
4. 让 Claude 根据 Spec 生成实现代码
5. 实现与 Spec 绑定，AI 可自行验证一致性
```

---

## 十四、Gateway 启动序列（深度解析）

`startGatewayServer()` 是整个系统的入口，启动顺序揭示了系统的依赖关系：

```
1. 读取并迁移配置 (config.ts)
   │  旧版配置自动迁移，验证失败则拒绝启动
   ▼
2. 处理 Secrets（API 密钥等）
   │  prepareSecretsRuntimeSnapshot() → activateSecretsRuntimeSnapshot()
   │  失败则硬中断（startup 阶段）；运行时失败则保持上次已知好的快照
   ▼
3. 认证 Bootstrap
   │  ensureGatewayStartupAuth() → 若无 token 自动生成
   ▼
4. 初始化子代理注册表
   │  initSubagentRegistry()
   ▼
5. 加载插件 (server-plugins.ts)
   │  loadGatewayPlugins() → pluginRegistry
   ▼
6. 解析运行时配置
   │  bindHost, port, controlUiEnabled, TLS, auth 合并
   ▼
7. 创建运行时状态 (server-runtime-state.ts)
   │  HTTP Server + WebSocket Server + 各种状态 Map 初始化
   ▼
8. 注册 WebSocket 处理器 (server-ws-runtime.ts)
   │  attachGatewayWsHandlers() → 所有 Gateway 方法绑定
   ▼
9. 启动渠道 (server-channels.ts)
   │  startChannels() → Telegram/Discord/WhatsApp 等
   ▼
10. 启动 Cron 服务 (server-cron.ts)
    ▼
11. 启动 Discovery（mDNS + 广域发现）
    ▼
12. 启动维护定时器 (server-maintenance.ts)
    │  health check / dedupe cleanup / media cleanup
    ▼
13. 注册 Skills 变更监听器
    │  文件变化 → 30s 防抖 → 刷新远端节点
    ▼
14. 恢复待发送消息 (delivery-queue.ts)
    │  从上次崩溃/重启中恢复未完成的出站消息
    ▼
Gateway 就绪，开始处理请求
```

**关键架构决策：**
- Gateway 是**单进程**，所有状态（WebSocket clients、chat runs、cron）都在同一进程内存中
- 配置变更通过 `config-reload.ts` 热更新，无需重启
- `setFallbackGatewayContext()` 为非 WebSocket 路径（Telegram 轮询等）提供上下文回退

---

## 十五、流式输出系统（server-chat.ts）

流式输出是 AI 对话的核心体验。`createAgentEventHandler()` 处理所有 AI 输出事件：

```
Agent 运行时产生输出
    │
    ▼
AgentEvent（delta / final / tool_call / error）
    │
    ▼
createAgentEventHandler()
    │
    ├── emitChatDelta()      ← 增量文本（限速：最快 150ms/次）
    │       │  stripInlineDirectiveTagsForDisplay()  过滤内部指令标签
    │       │  resolveMergedAssistantText()           合并增量避免重复
    │       └─► broadcast("chat", delta)  → 所有 WS 客户端
    │           nodeSendToSession()       → 移动端节点
    │
    ├── flushBufferedChatDeltaIfNeeded()  ← 工具调用前刷新缓冲区
    │
    └── emitChatFinal()      ← 最终完整文本
```

**特殊输出控制机制：**
- `SILENT_REPLY_TOKEN` → 以特定 token 开头的回复不会推送给用户（静默执行）
- `heartbeat` 过滤 → 健康检查回复默认隐藏（可配置 `heartbeat.ackMaxChars`）
- `directive tags` → 内部指令标签（`<openclaw:...>`）在展示前被剥离

**ChatRunState 数据结构：**
```typescript
{
  registry: ChatRunRegistry,     // sessionId → [clientRunId队列]
  buffers: Map<runId, string>,   // 每个 run 的文本累积缓冲
  deltaSentAt: Map<runId, ts>,   // 上次发送时间（限速用）
  abortedRuns: Map<runId, ts>,   // 已中止的 run 记录
}
```

---

## 十六、Compaction 压缩机制（compaction.ts）

当对话历史超过模型上下文窗口时，Compaction 自动压缩历史记录：

**核心算法：**
```
长对话历史（超过上下文 50% 时触发）
    │
    ├── pruneHistoryForContextShare()
    │       按 token 份额分块，丢弃最旧的块
    │       修复孤立的 tool_result（防止 API 报错）
    │
    └── summarizeInStages()
            │
            ├── 单次可处理：summarizeWithFallback()
            │       完整摘要 → 失败 → 跳过超大消息 → 最终兜底文本
            │
            └── 超大历史：分 N 块并行摘要 → 合并摘要
                    MERGE_SUMMARIES_INSTRUCTIONS 保证：
                    - 保留进行中的任务状态
                    - 保留批量操作进度（如 "5/17 items done"）
                    - 保留最后请求和当前动作
                    - 保留所有不透明标识符（UUID/hash/token等，原样保留）
```

**关键常数：**
```typescript
BASE_CHUNK_RATIO = 0.4       // 历史最多占上下文 40%
MIN_CHUNK_RATIO = 0.15       // 最小保留比例
SAFETY_MARGIN = 1.2           // token 估算 20% 安全余量
SUMMARIZATION_OVERHEAD = 4096 // 为摘要 prompt 本身预留的 token
```

**防 API 错误修复：**
`repairToolUseResultPairing()` 在丢弃旧历史时，自动修复"孤立的 tool_result"（其对应的 tool_use 已被丢弃），避免 Anthropic API 返回 `unexpected tool_use_id` 错误。

---

## 十七、两个关键的第三方依赖

深读源码发现了两个意料之外的底层依赖：

### `@mariozechner/pi-coding-agent`
```typescript
import { formatSkillsForPrompt, loadSkillsFromDir, generateSummary, estimateTokens } from "@mariozechner/pi-coding-agent";
```
Skills 的加载、Prompt 格式化、以及 Compaction 的摘要生成（`generateSummary`）都委托给这个包。

### `@mariozechner/pi-agent-core`
```typescript
import type { AgentMessage } from "@mariozechner/pi-agent-core";
```
Agent 消息的基础类型定义来自这个包。

### `@agentclientprotocol/sdk`
Gateway ↔ Agent 之间的标准化协议 SDK。

**真实依赖图：**
```
openclaw（本项目）
    ├── @agentclientprotocol/sdk（ACP 协议层）
    └── @mariozechner/pi-coding-agent（Skills + Compaction + Agent 运行时）
            └── @mariozechner/pi-agent-core（消息类型）
                    └── Claude API（Anthropic）
```

**复刻含义：**
- Skills 加载逻辑已完全读懂，可以自行实现（约 300 行核心代码）
- Compaction 算法已完全读懂，可以自行实现（`generateSummary` 本质是调用 Claude 做摘要）
- 不需要依赖任何私有包，全部可用 `@anthropic-ai/sdk` 直接实现

---

## 十三、尚待深入研究的部分（已完成）

> 以下 5 项已全部深入阅读源码并完成研究。研究结论见下方。

- [x] `src/gateway/server-channels.ts` - 渠道管理器（458 行，已全文阅读）
- [x] `src/gateway/auth.ts` - Gateway WebSocket 认证机制（504 行，已全文阅读）
- [x] `packages/clawdbot/` - Bot 封装（已全文阅读，仅为兼容性 shim）
- [x] `@agentclientprotocol/sdk` - ACP 协议 SDK（通过 `src/acp/` 模块 1075 行全文阅读）
- [x] `@mariozechner/pi-coding-agent` - Skills `formatSkillsForPrompt()` 模板格式（已确认）

### 研究结论

#### 1. `server-channels.ts` — 渠道生命周期管理器

**核心架构**：`createChannelManager()` 工厂函数返回 `ChannelManager` 对象，管理所有渠道插件账户的生命周期。

**关键机制**：
- **ChannelRuntimeStore**：三个 Map（`aborts`/`tasks`/`runtimes`）管理每账户的 AbortController、任务 Promise 和运行时状态
- **指数退避重启**：`BackoffPolicy` — 初始 5s、最大 5min、因子 2、抖动 0.1，最多重启 10 次（`MAX_RESTART_ATTEMPTS`）
- **手动停止集合**：`manuallyStopped` Set 防止用户主动停止的渠道被自动重启
- **启动流程**：遍历每个渠道插件 → 获取账户列表 → 检查 enabled/configured → 创建 AbortController → 调用 `plugin.gateway.startAccount()` → 崩溃时自动重启
- **UI 状态快照**：`getRuntimeSnapshot()` 组合渠道 + 账户 + 运行时状态，供前端实时展示

**对 Equality 的启示**：我们 Phase 4（飞书/钉钉）需要类似的渠道管理器，但复杂度远低于 OpenClaw（OpenClaw 有 20+ 渠道插件，每个有 20+ adapter 插槽）。我们可以做一个简化版：2-3 个渠道、无 QR 登录、无 heartbeat。

#### 2. `auth.ts` — Gateway 认证四模式

**核心架构**：4 种认证模式 `"none" | "token" | "password" | "trusted-proxy"`，外加 Tailscale VPN 集成。

**关键机制**：
- **认证流程**：`authorizeGatewayConnect()` → trusted-proxy 检查 → none 放行 → rate-limit 检查 → Tailscale whois → token/password 验证
- **速率限制**：按 IP + scope 限流认证失败次数（缺少凭据不计入，仅错误凭据计入）
- **时序安全**：`safeEqualSecret()` 防止时序侧信道攻击
- **本地直连检测**：`isLocalDirectRequest()` — loopback + 无 forwarded headers = 本地直连
- **认证面区分**：`http`（REST API）vs `ws-control-ui`（WebSocket 控制面）

**对 Equality 的启示**：我们的桌面应用是 localhost-only 的 Fastify 服务，**不需要这套复杂认证**。当前 Phase 0-1 的无认证方案已足够。但如果未来要暴露远程访问（如手机端连桌面），可参考 token 模式 + rate-limit 模式。

#### 3. `packages/clawdbot/` — 纯兼容性重定向

**核心发现**：`index.js` 只有一行 `export * from "openclaw"`，`package.json` 将 `clawdbot` CLI 指向 `openclaw` 包。这只是一个历史兼容的包名重定向。

**对 Equality 的启示**：**零参考价值**。忽略。

#### 4. `@agentclientprotocol/sdk` — ACP 协议桥接

通过完整阅读 `src/acp/translator.ts`（1075 行）、`server.ts`、`event-mapper.ts` 理解。

**核心架构**：`AcpGatewayAgent` 类实现 ACP SDK 的 `Agent` 接口，桥接 ACP 标准协议 ↔ OpenClaw Gateway WebSocket。

**关键机制**：
- **会话管理**：`newSession()`/`loadSession()`/`unstable_listSessions()` 映射到 Gateway 的 session key 体系
- **5 个配置选项**：`thought_level`、`verbose_level`、`reasoning_level`、`response_usage`、`elevated_level`
- **prompt() 流程**：提取 text + attachments → 前缀 `[Working directory: ~/path]` → `gateway.request("chat.send", ...)` → 等待事件 → 映射为 `PromptResponse`
- **事件映射**：Gateway 事件 `chat/agent` → `handleChatEvent()` / `handleAgentEvent()` → ACP 内容块
  - **工具调用三阶段**：`start`（创建 toolCall + 推送 in_progress）→ `update`（partial result 增量推送）→ `result`（完成/失败）
  - **文本增量**：`handleDeltaEvent()` 跟踪 `sentTextLength`，只推送新增文本（差量）
  - **终止映射**：`final` → `end_turn`、`aborted` → `cancelled`、`error` → `end_turn`（不暴露内部错误类型）
- **安全保护**：会话创建速率限制 120/10s、prompt 最大 2MB（DoS 防护）
- **Tool 事件提取**：`event-mapper.ts` 从 tool args 中提取文件路径定位（`TOOL_LOCATION_PATH_KEYS`），推断工具类型（`inferToolKind`）

**对 Equality 的启示**：我们不使用 ACP 协议（我们是直连 Fastify HTTP/SSE），但以下模式值得借鉴：
1. **Tool 三阶段事件**（start/update/result）→ 我们的 SSE `tool_start`/`tool_result` 设计已覆盖，但可考虑增加 `tool_update` 增量推送
2. **差量文本推送**（只发新增文本）→ 我们的 SSE delta 已采用此模式
3. **Working directory 前缀**→ 可在 System Prompt 中注入当前工作目录
4. **速率限制**→ 可在 tool loop 中添加简单防刷

#### 5. `formatSkillsForPrompt` — XML 懒加载模板

**核心发现**（通过 docs + `workspace.ts` 确认）：

**模板格式**：
```xml
<available_skills>
  <skill>
    <name>git</name>
    <description>使用 Git 进行版本控制</description>
    <location>~/.agents/skills/git/SKILL.md</location>
  </skill>
  ...
</available_skills>
```

**Token 成本**：
- 基础开销：195 字符（XML 骨架，当 ≥1 个 skill 时）
- 每个 skill：97 字符 + name + description + location ≈ **24 tokens**
- `compactSkillPaths()`：home 目录替换为 `~`，全局节省 400-600 tokens

**⚠️ 关键发现 — 懒加载模式**：
- **System Prompt 中 NOT 注入 Skills 全文**！只注入 name + description + location（索引信息）
- 模型在需要某个 Skill 的详细内容时，使用 `read` 工具读取 `<location>` 指向的 SKILL.md 文件
- 这是一个**极其高效的设计**：150 个 Skills 只消耗 ~3,600 tokens（150 × 24），而非注入全文可能的数万 tokens

**限制控制**：
- `applySkillsPromptLimits()`：二分搜索找到在字符预算内的最大 skills 前缀
- 最多 150 个 skills、30K 字符

### 对之前 Spec 设计的评估

基于以上研究，对之前设计的 Phase 2 spec 和相关文档进行合理性评估：

#### ✅ 合理的设计决策

1. **Tool Registry + 容错匹配** — 与 OpenClaw 一致，设计合理
2. **Tool Result 截断 400K 字符** — 与 OpenClaw 完全一致
3. **全局断路器 30 次** — 与 OpenClaw 完全一致
4. **Skills 6 级加载优先级** — 合理，与 OpenClaw 类似
5. **PRC 镜像安装命令** — 有效的本土化差异化
6. **30 秒防抖热更新** — 与 OpenClaw 一致
7. **5 个内置工具** — bash/read_file/write_file/glob/web_fetch 是合理的最小集

#### ⚠️ 需要修正的设计问题

1. **Skills System Prompt 注入方式（严重）**：
   - **当前 spec 设计**（`design.md` B4）：将 Skills 的 **完整 body 文本**注入 System Prompt
   - **OpenClaw 实际做法**：只注入 **name + description + location 索引**，模型按需用 `read` 工具懒加载
   - **影响**：全文注入会浪费大量 tokens（可能 10-50K），而索引注入只需 ~3.6K tokens
   - **建议**：改为 OpenClaw 的 XML 索引 + `read` 工具懒加载模式

2. **缺少 Tool 中间态 update 事件**：
   - **当前 spec 设计**（`design.md` D2）：只有 `tool_start` + `tool_result` 两个 SSE 事件
   - **OpenClaw ACP 实际做法**：三阶段 `start` → `update`（partial result 增量）→ `result`
   - **影响**：长时间运行的工具（如 bash 执行编译）没有中间进度反馈
   - **建议**：增加 `tool_update` SSE 事件，传递 partial result

3. **Context Guard 和 Loop Detection 划分到 Phase 3 值得商榷**：
   - **当前 proposal**：Context Guard 和 4 种循环检测器放在 Phase 3
   - **问题**：没有 Loop Detection 的 Tool Loop 在实际使用中很容易卡死
   - **建议**：至少将 `generic_repeat` 检测器和 `global_circuit_breaker` 提前到 Phase 2（后者 spec 中已有但标记为 Phase 3）
   - **注意**：spec 的 `tools/spec.md` 中已定义 4 种检测器，但 proposal 说 Phase 2 "不做"循环检测，只做全局断路器。这是矛盾的。实际 Phase 2 tasks 中已包含全局断路器（30 次限制），建议 spec 统一描述。

4. **Working Directory 前缀缺失**：
   - **OpenClaw ACP 做法**：每次 prompt 前缀 `[Working directory: ~/path]`
   - **当前 spec**：未提及
   - **建议**：在 System Prompt 或用户消息中注入当前工作目录信息

5. **Skills prompt 格式不够明确**：
   - **当前 design.md B4**：用 Markdown heading 格式 `## Skill: {name}\n{body}`
   - **OpenClaw 实际做法**：用 XML 格式 `<available_skills><skill>...</skill></available_skills>`
   - **建议**：如果改为懒加载索引模式（上面第 1 点），则应采用 XML 格式，与模型对 XML 结构化数据的解析能力更匹配

#### 🔍 无需修改但需注意

1. **Channel Plugin 系统复杂度远超 Equality 需要**：OpenClaw 有 20+ adapter 插槽、~40 字段的 AccountSnapshot。我们 Phase 4 只需 2-3 个渠道，做极简版即可。当前设计未涉及 Phase 4，无需现在调整。
2. **ACP 协议不适用于 Equality**：我们用直连 HTTP/SSE，不需要 ACP 桥接层。但 ACP 的会话配置选项模式（5 个 config options）可以启发我们的前端设置设计。
3. **Auth 认证对桌面应用非必要**：localhost-only 场景无需认证。未来如需远程访问再参考。

---

## 十八、Token 消耗分析（现有问题）

深读 `system-prompt.ts`、`run.ts`、`compaction.ts`、`tool-result-truncation.ts` 后，发现 OpenClaw 在 token 方面的核心开销和已有的优化手段：

### System Prompt 的 Token 构成

每次对话，System Prompt 固定包含以下部分：

```
1. Safety 声明（约 100 tokens）
2. 当前时间 + 时区（约 20 tokens）
3. Authorized Senders 白名单（约 30 tokens）
4. Tooling 清单（17 个工具 × 每条约 15 tokens ≈ 250 tokens）
5. Skills Prompt（最多 30,000 字符 ≈ 7,500 tokens）  ← 最大开销
6. Memory Recall 指引（约 50 tokens）
7. Messaging 指引（约 150 tokens）
8. Reply Tags 指引（约 80 tokens）
9. Runtime Info（os/arch/node/model/channel ≈ 50 tokens）
10. Bootstrap files（工作区上下文文件，可截断）
```

**现有的 token 节省手段（原版已做）：**
- Skills 路径用 `~` 替代 home，节省 400-600 tokens
- 子代理用 `promptMode: "minimal"`，只保留 Tooling/Workspace/Runtime，节省约 70% System Prompt
- Bootstrap 文件有字符预算上限，超出自动截断并警告

### Tool Result 截断

`tool-result-truncation.ts` 发现的核心设计：
- 单个 Tool Result 最多占上下文 **30%**（`MAX_TOOL_RESULT_CONTEXT_SHARE`）
- 绝对上限：**400,000 字符**（约 10 万 tokens）
- 截断策略：优先保留头部；若尾部含 error/JSON结构/summary 则用**头+尾**截断，保留重要信息
- 截断时附加明显提示，告知模型内容被截断

### Usage 追踪的精妙之处

`run.ts` 中 `UsageAccumulator` 的设计非常精细：
```typescript
// 问题：多轮 tool-call 时 cacheRead 会被重复累加
// 因为每轮 API 调用都报告 cacheRead ≈ 当前上下文大小
// 如果累加，得到 N × context_size，显示会虚高
//
// 解决：只取最后一次调用的 cacheRead/cacheWrite/input
// 但累加所有轮次的 output（生成的总文本）
target.lastCacheRead = usage.cacheRead ?? 0;  // 覆盖，不累加
target.output += usage.output ?? 0;           // 累加
```

### Cache 控制（Anthropic Prompt Caching）

`cache-ttl.ts` 显示 OpenClaw 已支持 Anthropic 的 Prompt Cache：
- 支持提供商：anthropic、moonshot、zai，以及 openrouter 下的 anthropic/moonshot 模型
- 追踪 `cacheRead` 和 `cacheWrite` token 数量，用于成本计算

---

## 十九、我们可以做得更好的地方

基于上述深度分析，如果从头重新实现，以下是**可以超越原版**的改进点：

### 1. Skills 按需加载（最高优先级）

**现有问题：** 所有匹配的 Skills 全部注入 System Prompt，即使本次对话用不到。150 个 Skills 上限 × 平均 200 tokens = 30,000 tokens 的固定开销。

**改进方案：懒加载 + 语义路由**
```
用户消息 → embedding 向量化 → 与所有 Skill description 做相似度计算
         → 只注入 Top-K（如 3-5 个）最相关的 Skills
         → 其余 Skills 只提供 name + description 摘要列表
```
预期节省：**60-80% 的 Skills token 开销**（从 7500 tokens → 1500 tokens）

### 2. 分层 System Prompt + Prompt Cache 深度利用

**现有问题：** System Prompt 每轮都完整发送，缓存命中率依赖 Anthropic 自动 prefix caching。

**改进方案：显式 Cache Breakpoint 分层**
```
[Layer 1：永久不变层] cache_control: {type: "ephemeral", ttl: "1 hour"}
  - Safety 声明
  - 核心工具描述
  - 静态 Skills

[Layer 2：会话级缓存] cache_control: {type: "ephemeral", ttl: "5 minutes"}  
  - 用户时区/时间
  - 动态 Skills（本次选中的）
  - Memory 摘要

[Layer 3：每轮重新发送]
  - 当前对话历史
  - 最新 Tool Results
```
预期节省：**40-60% 的 input token 费用**（cacheRead 比 input 便宜 90%）

### 3. Memory 向量化替代全文注入

**现有问题：** `memory_search` 工具需要模型主动调用，且搜索结果靠关键词匹配。大量历史记忆如果直接注入会占用大量 token。

**改进方案：**
- 结构化存储（SQLite + embedding），而非 Markdown 文件
- 每次请求前自动做语义检索，只注入相关片段（Top-3 memory blocks）
- 无需模型手动调用 `memory_search`，完全透明

### 4. Compaction 触发更智能

**现有问题：** 超过 50% 上下文即触发压缩，策略固定（BASE_CHUNK_RATIO = 0.4）。摘要生成本身消耗 LLM 计算资源（`generateSummary` 调用 API）。

**改进方案：**
- **差异化压缩阈值**：工具密集型对话（大量 bash 输出）更早压缩；纯文本对话更晚压缩
- **增量摘要**：每轮结束后立即生成该轮摘要并缓存，不等到临界点才批量压缩（消除压缩延迟）
- **Tool Result 不进摘要**：工具调用结果通常是临时数据，可直接丢弃而非摘要化，节省摘要质量和 token

### 5. 渠道适配层更薄

**现有问题：** 渠道适配器深度集成在 Gateway 中，添加新渠道需要大量代码。

**改进方案：Webhook Adapter 规范**
```typescript
// 任何渠道只需实现 3 个函数：
interface ChannelAdapter {
  parseInbound(raw: unknown): NormalizedMessage;
  sendMessage(msg: NormalizedMessage): Promise<void>;
  getCapabilities(): ChannelCapabilities;
}
```
渠道适配器完全解耦，可作为独立插件加载，甚至通过 HTTP 远程调用（适合微服务部署）。

### 6. Session 持久化升级

**现有问题：** InMemorySessionStore 在进程重启后丢失所有会话状态（24h TTL）。虽然 transcript 写磁盘，但恢复时需要重新读取文件。

**改进方案：SQLite WAL 模式**
```
Sessions 表：sessionKey, agentId, lastActive, metadata (JSON)
Messages 表：sessionKey, role, content, toolCalls (JSON), timestamp
Memory 表：sessionKey, content, embedding (BLOB), createdAt
```
- 进程重启后立即恢复会话
- 支持跨多设备查询历史（若通过 API 暴露）
- 比纯文件系统快 10x

### 7. 并发控制更细粒度

**现有问题：** 当前使用全局 Lane 队列（`command-queue.ts`），同一 Session 的请求串行执行。

**改进方案：** Session 级别信号量，允许同一用户的不同 Session 并发，但同一 Session 内串行。同时对子代理（spawned）和主代理分开限速。

---

## 二十、巧妙的工程设计（值得学习）

### 1. Tool Result Context Guard — 就地变异而非重建

`tool-result-context-guard.ts` 的核心设计：通过**猴子补丁（Monkey Patch）**拦截 Agent 内部的 `transformContext` 私有方法：

```typescript
// 私有方法被声明为 private，但 TypeScript 擦除后是普通属性
// 通过 runtime view 安全地拦截而不破坏类型系统
const mutableAgent = params.agent as GuardableAgentRecord;
const originalTransformContext = mutableAgent.transformContext;
mutableAgent.transformContext = async (messages, signal) => {
  // 先调用原始方法
  const transformed = await originalTransformContext?.(messages, signal);
  // 再就地修改消息数组（不重建，节省内存）
  enforceToolResultContextBudgetInPlace({ messages: transformed, ... });
  return transformed;
};
// 返回恢复函数（RAII 模式）
return () => { mutableAgent.transformContext = originalTransformContext; };
```

**设计精妙之处：**
- 不修改第三方库源码，通过运行时拦截实现功能注入
- 就地变异（in-place mutation）避免大消息数组的内存复制
- 返回清理函数（RAII 模式），自动恢复原始状态

**上下文预算计算（75% 安全余量）：**
```
contextBudgetChars = contextWindowTokens × CHARS_PER_TOKEN × 0.75
// 预留 25% 给 System Prompt + 生成输出
```

---

### 2. 工具调用循环检测 — 三重探测器

`tool-loop-detection.ts` 实现了三种循环检测算法，防止 AI 陷入死循环：

```
探测器1: generic_repeat
  → 检测同一工具调用（相同参数 + 相同结果）连续出现 N 次
  → 阈值：warning=10, critical=20

探测器2: known_poll_no_progress  
  → 专门针对轮询类工具（process:poll, process:log, command_status）
  → 检测相同参数但结果无变化（相同 resultHash）
  → 比通用探测器更早触发

探测器3: ping_pong
  → 检测 A→B→A→B 交替循环模式（不同工具互相调用）
  → 通过观察调用序列的交替尾部来识别
  
全局断路器: global_circuit_breaker
  → 任意工具调用总次数 > 30 时触发
```

**Hash 算法：**
- 工具调用参数 → SHA-256（稳定序列化，键名排序）→ hex[:8]
- Tool Result 智能哈希：对轮询工具提取关键字段（status/exitCode/totalLines），对普通工具哈希 details + text

---

### 3. Session File 预热 — OS Page Cache 利用

`session-manager-cache.ts` 发现的小技巧：

```typescript
// 读取 4KB 来"预热" OS 页面缓存
const buffer = Buffer.alloc(4096);
await handle.read(buffer, 0, buffer.length, 0);
// 下次 SessionManager 读同一文件时，命中页面缓存，延迟从 ms 降到 μs 级
```

**为什么有效：** Node.js 的 `fs.readFile` 会触发 OS 将文件内容加载到内存页面缓存，后续读取直接从内存返回，不需要磁盘 I/O。Session 文件通常在每轮对话都要读写，预热可显著降低首次访问延迟。

---

### 4. Tool Call Name 标准化 — 容错模糊匹配

`attempt.ts` 的 `normalizeToolCallNameForDispatch()` 非常有意思：

```typescript
// 模型有时会输出带命名空间的工具名：
// "mcp.github.create_issue" → 尝试匹配 "create_issue"
// "claude/bash" → 尝试匹配 "bash"

// 匹配策略：
// 1. 精确匹配（大小写敏感）
// 2. 标准化后精确匹配（下划线/中划线）
// 3. 命名空间剥离后匹配（取最后一段）
// 4. 大小写不敏感匹配（最后兜底）
```

**意义：** 防止模型因输出带前缀的工具名而导致工具调用失败。这是对 LLM 输出不可靠性的防御性编程。

---

### 5. Model Fallback — 多模型自动降级

`model-fallback.ts` 实现了完整的模型降级链：

```
主模型调用失败
    │
    ├── shouldRethrowAbort()：用户主动取消 → 立即抛出（不降级）
    ├── isTimeoutError()：超时 → 允许降级（超时可能是模型过载）
    │
    ▼
检查备用模型候选列表
    │  从配置的 fallbacks 中按顺序尝试
    ├── Auth profile 冷却中 → 跳过该 profile
    ├── ContextOverflow → 尝试更大上下文窗口的模型
    ├── RateLimit → 等待 cooldown 后重试
    │
    ▼
所有候选都失败 → throwFallbackFailureSummary()
    "All X failed: provider1/model1 (reason) | provider2/model2 (reason)"
```

**设计原则：** AbortError（用户取消）和 TimeoutError（模型过载）被刻意区分——超时**可以**降级，用户取消**不能**降级。

---

### 6. 等待 Idle 后 Flush — 防止工具结果丢失

`wait-for-idle-before-flush.ts` 解决了一个细微的 race condition：

**问题：** 工具执行完成后，Agent 可能还在处理上一个流式输出。如果立即 flush pending tool results，可能与正在进行的流式写入冲突，导致数据竞争。

**解决：**
```
工具执行完毕
    │
    ▼
waitForAgentIdle(30s timeout)  // 等待 Agent 空闲
    │
    ├── 成功空闲 → flushPendingToolResults()
    └── 超时 → clearPendingToolResults()（主动丢弃，防止永久挂起）
```

---

## 二十一、现有缺点（可改进点续）

### 缺点 1：Session 文件是单一 JSON 文件，并发写入用文件锁

`session-write-lock.ts` 的实现是**进程级文件锁**——整个 Session 的历史记录存在一个 JSON 文件里。

**问题：**
- 每次对话结束都要全量写入（不是追加），文件越来越大
- 多个请求到同一 Session 时完全串行（锁等待）
- 进程崩溃时文件锁可能残留

**影响：** 长时间对话（数百轮）的 Session 文件可能达到几十 MB，每次读写都是完整 JSON 解析。

---

### 缺点 2：Skills Prompt 是全量注入，不基于语义相关性

虽然已知（见第十八章），但更具体的数字：每个 Skill 平均约 100-300 tokens，50 个 Skills 全量注入 = 5,000-15,000 tokens 固定开销，**每次对话都要付这个费用**。

对于一个只是闲聊或做数学计算的用户来说，这些 Skills 完全是噪音，却每轮都消耗。

---

### 缺点 3：Compaction 是同步阻塞式的

当触发 Compaction 时，系统会：
1. 调用 Claude API 生成摘要（3-30 秒）
2. 在此期间用户的新消息进入等待队列
3. 用户感知到明显卡顿

`compaction-safety-timeout.ts` 设置了最长等待时间，但超时后只是跳过压缩（历史继续增长），没有优雅的降级方案。

---

### 缺点 4：Tool Result Details 从不进入摘要，但占用大量上下文

`compaction.ts` 中：
```typescript
// SECURITY: toolResult.details can contain untrusted/verbose payloads;
// never include in LLM-facing compaction.
const safe = stripToolResultDetails(messages);
```

安全考量是对的（防止注入攻击），但副作用是工具结果的详细信息（如 bash 执行的完整输出、文件内容）不会被摘要化，而是直接被丢弃。这意味着如果早期执行的工具产生了重要的中间结果，压缩后可能完全丢失。

---

### 缺点 5：单进程架构，无水平扩展能力

整个 Gateway 是单进程，所有会话、渠道、Agent 运行都在同一个 Node.js 事件循环中。

- 无法横向扩展（多机器部署）
- CPU 密集任务（大量并发对话）会阻塞事件循环
- 内存泄漏会影响所有用户

这是自托管方案的合理取舍，但对于高并发场景是硬伤。

---

## 二十二、attempt.ts 完整执行流程（核心引擎）

`runEmbeddedAttempt()` 是整个系统的主执行引擎，2097 行，负责单次 Agent 运行的全生命周期。理解它等于理解整个系统。

### 执行流程（按顺序）

```
1. 解析工作目录、沙箱上下文
2. 加载 Skills（从快照或当前文件系统）
3. 解析 Bootstrap 文件（注入上下文预算）
4. 构建 System Prompt（assembles appendPrompt）
5. 创建工具集（createOpenClawCodingTools）
6. 获取 Session 写锁（acquireSessionWriteLock）
7. 修复 Session 文件（repairSessionFileIfNeeded）
8. 预热 Session 文件（prewarmSessionFile）
9. 创建 SessionManager（SessionManager.open）
10. 创建 Agent Session（createAgentSession）
11. 安装 Tool Result Context Guard（installToolResultContextGuard）
12. 注册 Stream 包装器（xAI HTML 解码 / Ollama num_ctx / 思考块剥离...）
13. 净化历史消息（sanitizeSessionHistory）
14. 运行 before_prompt_build 钩子（插件注入）
15. 执行 prompt（activeSession.prompt()）
16. 等待 Compaction 完成（waitForCompactionRetryWithAggregateTimeout）
17. 等待 Idle 后 Flush（flushPendingToolResultsAfterIdle）
18. 释放 Session 写锁
19. 返回结果（含 usage、messages、tool metas）
```

### 多层 Stream 包装（Decorator 模式）

`attempt.ts` 中 `streamFn` 被层层包装（**洋葱模型**），每层负责一个职责：

| 包装层 | 功能 |
|--------|------|
| `wrapStreamFnTrimToolCallNames` | 去除 LLM 输出的工具名中的空格 |
| `wrapStreamFnDecodeXaiToolCallArguments` | 解码 xAI/Grok 的 HTML 实体工具参数 |
| `wrapStreamDropThinkingBlocks` | Copilot/Claude 的推理块剥离 |
| `wrapStreamSanitizeToolCallIds` | Mistral 工具调用 ID 格式化 |
| `wrapStreamDowngradeOpenAI` | OpenAI Responses API 降级 |
| `cacheTrace.wrapStreamFn` | 缓存诊断追踪 |
| `anthropicPayloadLogger.wrapStreamFn` | Anthropic 请求日志 |

每一层是纯函数 wrapper，通过链式调用组合，互不侵入。**复刻时应采用相同的 Decorator 模式**。

### 孤立用户消息修复

```typescript
// 检测到 Session 末尾存在孤立的 user 消息时（上次被中断？）
const leafEntry = sessionManager.getLeafEntry();
if (leafEntry?.type === "message" && leafEntry.message.role === "user") {
  if (leafEntry.parentId) {
    sessionManager.branch(leafEntry.parentId);  // 回退到父节点
  } else {
    sessionManager.resetLeaf();
  }
  // 重新从 Session 重建消息列表
  const sessionContext = sessionManager.buildSessionContext();
  activeSession.agent.replaceMessages(sessionContext.messages);
}
```

**背景：** 如果上次对话被超时中断，用户消息已写入 Session 但 Assistant 未回复。下次请求进来时，Session 末尾是 `user` 消息，再追加新的 `user` 消息会触发"连续两条 user 消息"错误（大多数 LLM Provider 不允许）。通过检测并回退来修复。

### 压缩超时快照保护

```typescript
// 问题：压缩（Compaction）期间被超时，Session 状态可能只完成了一半
const wasCompactingBefore = activeSession.isCompacting;
const snapshot = activeSession.messages.slice();
const wasCompactingAfter = activeSession.isCompacting;
// 只有压缩未进行中，快照才可信
const preCompactionSnapshot = wasCompactingBefore || wasCompactingAfter ? null : snapshot;
```

**超时恢复策略：** 优先使用压缩前快照（不完整的压缩结果可能导致消息乱序），次选当前快照。

### Ollama 特殊处理

```typescript
// Ollama API 不使用标准 streamSimple，改用直接 /api/chat 调用
if (params.model.api === "ollama") {
  const ollamaStreamFn = createConfiguredOllamaStreamFn({ ... });
  activeSession.agent.streamFn = ollamaStreamFn;
}
// Ollama OpenAI 兼容模式需要注入 num_ctx 参数，否则默认只有 4096 token 上下文
if (shouldInjectNumCtx) {
  activeSession.agent.streamFn = wrapOllamaCompatNumCtx(
    activeSession.agent.streamFn, numCtx
  );
}
```

---

## 二十三、Tool Loop Detection 算法细节

### Ping-Pong 检测算法

```
历史: [A, B, A, B, A, B]  ← 当前调用是 B
                                         
算法：
1. 找到最近一次 A 的 argsHash（称为 otherSignature）
2. 从尾部向前扫描，验证是否符合 A-B-A-B 交替模式
3. 计算 alternatingTailCount
4. 检查两侧 resultHash 是否都稳定（无进展）
5. 需要 A 和 B 各有 ≥1 次稳定结果才判为 noProgressEvidence
```

**精妙之处：** ping-pong 必须满足两个条件才触发 critical：
1. 交替次数 ≥ 20（criticalThreshold）
2. 双方 resultHash 都稳定（证明真的没有进展）

单独满足其中一条只触发 warning，避免误杀。

### 工具调用历史记录（Sliding Window）

```typescript
// 滑动窗口：只保留最近 N 条调用记录
if (state.toolCallHistory.length > resolvedConfig.historySize) {
  state.toolCallHistory.shift();  // 移除最旧的
}

// 结果回填：工具执行完成后，回溯历史补充 resultHash
for (let i = state.toolCallHistory.length - 1; i >= 0; i -= 1) {
  // 找到对应的 toolCallId 并回填 resultHash
}
```

**两阶段设计：** 工具调用时先记录 `argsHash`，工具结果回来后再回填 `resultHash`。这是因为工具执行是异步的，调用和结果之间可能有其他调用插入（并发工具）。

---

## 二十四、架构缺陷完整清单

| 序号 | 缺陷描述 | 影响 | 建议改进 |
|------|---------|------|---------|
| 1 | `attempt.ts` 2097 行单文件 | 可维护性差，CodeReview 困难 | 按职责拆分：session setup / stream wrappers / prompt execution / result assembly |
| 2 | `compact.ts` 与 `attempt.ts` 约 100 行重复导入 | DRY 违反，依赖更新需两处同步 | 提取公共基础层 `run-base.ts` |
| 3 | System Prompt 每次全量重建 | 每轮消耗 5-10K tokens 固定开销 | 缓存未变化部分，仅重建动态字段 |
| 4 | Skills 全量注入（非语义检索） | 不相关 Skills 的 tokens 浪费 | 接入向量检索，按 relevance 截取 Top-K |
| 5 | Session 存储为单一 JSON 文件 | 长对话写入慢（全量序列化），并发串行 | 追加式日志 + 内存缓存 + 定期快照 |
| 6 | 单进程架构 | 无法水平扩展，内存泄漏影响全局 | Worker Pool 隔离，Gateway 无状态化 |
| 7 | Tool Result Details 不进入 Compaction 摘要 | 早期工具输出在压缩后永久丢失 | 安全摘要策略（提取关键字段而非全部丢弃）|
| 8 | Loop Detection 默认关闭 | 生产环境需手动开启，容易遗漏 | 默认开启，仅允许关闭 verbose 日志 |
| 9 | 图像在 compaction 后被清理（`pruneProcessedHistoryImages`）| 视觉模型的多轮图像讨论能力受限 | 保留最近 N 轮的图像数据 |

---

## 二十五、Model Fallback 完整降级策略

### Auth Profile 冷却探测机制

这是 `model-fallback.ts` 最精妙的部分。当所有 Auth Profile 都处于冷却期时，并非直接跳过，而是实施**概率探测**：

```
所有 Profile 冷却中
    │
    ├── 错误类型判断：
    │   ├── auth / auth_permanent → 永久跳过（不探测）
    │   ├── billing               → 单 Provider 无降级时探测；有降级时按 margin 探测
    │   └── rate_limit / overloaded → 按探测节流（30s 间隔）探测
    │
    └── 探测节流（Probe Throttle）：
        ├── 每个 Provider 最少 30s 才探测一次（MIN_PROBE_INTERVAL_MS）
        ├── 只在冷却到期前 2 分钟内才探测（PROBE_MARGIN_MS）
        └── 同一次 Fallback Run 内，每个 Provider 只探测一次
```

**设计精妙之处：** 不让系统"死等"冷却结束，但也不让系统无限地用率限模型轰炸 API，通过 30s 最小间隔和"临近到期才探测"策略，实现最小代价的恢复检测。

### Context Overflow 不触发 Fallback

```typescript
if (isLikelyContextOverflowError(errMessage)) {
  throw err;  // 直接抛出，不降级
}
```

**原因：** Context Overflow 应由内层的 Compaction 机制处理（压缩→重试）。如果降级到另一个模型，对方可能上下文窗口更小，反而更快溢出。这个判断体现了对错误类型的精准分层处理。

### 冷却探测状态上限

```typescript
const MAX_PROBE_KEYS = 256;  // 防止探测状态无限增长
const PROBE_STATE_TTL_MS = 24 * 60 * 60 * 1000;  // 24小时自动清理
```

**内存安全设计：** 探测状态用 `Map<key, timestamp>` 存储，有上限（256 条）和 TTL（24h），防止长期运行后内存泄漏。

---

## 二十六、Context Engine — 可插拔上下文管理接口

`src/context-engine/types.ts` 定义了一个完整的 **Context Engine 插件接口**（约 169 行），这是整个架构中最值得复刻的抽象之一：

```typescript
interface ContextEngine {
  readonly info: ContextEngineInfo;
  
  // 生命周期
  bootstrap?(params): Promise<BootstrapResult>;      // Session 初始化
  ingest(params): Promise<IngestResult>;             // 单条消息摄入
  ingestBatch?(params): Promise<IngestBatchResult>;  // 批量消息摄入
  afterTurn?(params): Promise<void>;                 // 每轮对话完成后
  
  // 核心功能
  assemble(params): Promise<AssembleResult>;         // 在 token 预算内组装上下文
  compact(params): Promise<CompactResult>;           // 压缩（摘要/剪枝）
  
  // 多 Agent 协作
  prepareSubagentSpawn?(params): Promise<SubagentSpawnPreparation>;  // 子代理启动前准备
  onSubagentEnded?(params): Promise<void>;            // 子代理结束通知
  
  // 资源管理
  dispose?(): Promise<void>;
}
```

**`assemble()` 的职责：** 在给定 token 预算内，返回**准备好给模型的有序消息列表**。这是语义检索、RAG、记忆系统的接入点——Context Engine 可以在这里做任意的上下文选择策略，而 `attempt.ts` 只是无差别地接受返回的消息。

**`afterTurn()` 的职责：** 每轮对话结束后被调用，可以：
- 持久化对话轮次到外部存储
- 触发后台 Compaction 决策
- 更新向量索引（如果实现了 RAG）

**RAII 风格：** `prepareSubagentSpawn` 返回 `{ rollback }` 对象——如果子代理启动失败，调用 `rollback()` 撤销已准备的状态。

**复刻建议：** 直接采用这个接口设计，默认实现使用内存+文件，高级实现可接 Postgres、向量库（pgvector）。

---

## 二十七、clawdbot — 兼容性垫片包

`packages/clawdbot/` 是一个极简的兼容性包：

```javascript
// index.js — 全部内容
export * from "openclaw";
```

**设计意图：** `openclaw`（新名称）从 `pi`（旧名称）更名后，`clawdbot` 作为过渡垫片保持 API 兼容性，使旧用户无需更改代码。这是典型的**向后兼容垫片模式（Shim/Compat Package）**。

**复刻教训：** 早期命名要谨慎，或者从一开始就设计好版本兼容层。

---

## 二十八、路由系统 — Session Key 的完整编码规则

`src/routing/` 是整个系统中**最被低估的模块**。Session Key 不只是一个字符串 ID，它编码了路由的全部上下文。

### Session Key 结构

```
格式：agent:<agentId>:<channel>:<accountId>:<peerKind>:<peerId>[:<dmScope>]
示例：agent:main:telegram:default:direct:123456789

字段含义：
- agentId:   处理该对话的 Agent（"main"、"assistant"、"coder"等）
- channel:   渠道（telegram/discord/whatsapp/slack/signal/api）
- accountId: 多账号时区分哪个账号（default 表示单账号）
- peerKind:  会话类型（direct/group/channel/thread）
- peerId:    对端唯一标识（用户 ID / 群组 ID）
- dmScope:   DM 隔离策略（main / per-peer / per-channel-peer）
```

**特殊 Session Key：**
- `agent:main:cron:...` — Cron 定时任务
- `agent:main:acp:...` — ACP 协议子代理
- `agent:main:subagent:...` — 嵌套子代理（深度追踪）

### 路由绑定（Bindings）优先级

```
优先级（高→低）：
1. binding.peer          — 精确匹配 peerKind + peerId
2. binding.peer.parent   — 匹配线程的父群组
3. binding.guild+roles   — Discord 服务器 + 角色组合
4. binding.guild         — Discord 服务器
5. binding.team          — Slack 工作区
6. binding.account       — 特定账号
7. binding.channel       — 渠道级别
8. default               — 兜底
```

**WeakMap 缓存：**
```typescript
const agentLookupCacheByCfg = new WeakMap<OpenClawConfig, AgentLookupCache>();
```
用 `WeakMap` 以 config 对象为键缓存解析结果，config 对象被 GC 时缓存自动释放——**零手动清理的内存安全缓存**。

---

## 二十九、Memory（RAG）子系统 — 混合检索架构

`src/memory/` 是一个完整的**向量 + 全文检索混合 RAG 系统**，约 80 个文件，是整个项目中技术含量最高的模块之一。

### 存储架构

```
SQLite 数据库（单文件）
├── chunks            — 文本块原始内容（行号范围 + snippet）
├── chunks_vec        — 向量索引（sqlite-vec 扩展）
├── chunks_fts        — 全文索引（FTS5）
└── embedding_cache   — 嵌入向量缓存（避免重复计算）
```

### 混合检索策略（Hybrid Search）

```
query
  ├── 向量检索（embedding similarity）→ 余弦相似度分数
  ├── 全文检索（BM25）→ BM25 分数标准化
  └── mergeHybridResults() → 融合排序（RRF 或加权融合）
```

### Embedding Provider 降级链

```
配置的 provider（openai/gemini/voyage/mistral/ollama）
    │
    ├── 失败次数 > BATCH_FAILURE_LIMIT(2) → 自动降级到 local provider
    └── fallbackFrom / fallbackReason 记录降级原因
```

### 文件监听增量同步

```typescript
// chokidar 监听工作区文件变更
protected watcher: FSWatcher | null = null;
// Session 文件单独追踪增量更新（避免全量重建）
protected sessionDeltas = new Map<string, {
  lastSize: number;
  pendingBytes: number;
  pendingMessages: number;
}>();
```

**设计精妙之处：** Session 对话历史也会被索引（`sources: Set<MemorySource>`，支持 `"memory"` 和 `"sessions"` 两种源），使得 Agent 可以用自然语言检索历史对话——**这是长期记忆的实现基础**。

### MMR（Maximal Marginal Relevance）去重

`src/memory/mmr.ts`：在相关性和多样性之间平衡，防止检索结果都是同一主题的重复内容：
$$\text{MMR} = \arg\max_{d_i \notin R}\left[\lambda \cdot \text{sim}(d_i, q) - (1-\lambda) \cdot \max_{d_j \in R} \text{sim}(d_i, d_j)\right]$$

---

## 三十、Hooks 系统 — 插件事件总线

`src/hooks/` 实现了一个**内部事件总线**，允许插件在关键生命周期节点注入逻辑。

### Hook 事件类型

| 事件类型 | 动作 | 触发时机 |
|---------|------|---------|
| `gateway` | `startup` | Gateway 启动完成 |
| `agent` | `bootstrap` | Agent 首次初始化工作区 |
| `message` | `received` | 收到用户消息（渠道层） |
| `message` | `transcribed` | 音频转文字完成 |
| `message` | `preprocessed` | 消息预处理完成（含转录）|
| `message` | `sent` | 消息发送完成 |

### Hook 加载优先级（与 Skills 类似的 6 层）

```
Hook 来源（优先级高→低）：
1. openclaw-bundled    — 内置 Hooks（代码中）
2. openclaw-managed    — 用户通过 CLI 安装（~/.openclaw/hooks/）
3. openclaw-workspace  — 工作区本地（.openclaw/hooks/）
4. openclaw-plugin     — 插件包提供的 Hooks
```

### Hook 元数据（HOOK.md frontmatter）

```yaml
---
events: ["message:received", "agent:bootstrap"]
always: true          # 不受 enabled 配置影响，始终运行
emoji: "📬"
requires:
  bins: ["ffmpeg"]    # 依赖外部工具
  env: ["OPENAI_API_KEY"]
install:
  - kind: brew
    package: ffmpeg
---
```

**与 Skills 的对比：** Skills 是注入给 LLM 的工具说明（影响 AI 行为），Hooks 是在特定事件触发时执行的代码（影响系统行为）。两者共用相同的 frontmatter 设计风格，但职责完全不同。

---

## 三十一、复刻路线图（完整版）

基于全部代码的深度解读，制定以下分阶段复刻计划：

### Phase 1：核心骨架（1-2周）
```
目标：能用 Claude API 跑通单轮对话

1. Session Store（内存版）
   - SessionKey 编码规则
   - InMemorySessionStore（5000上限，24h TTL）

2. Agent Runner（极简版）
   - runAttempt()：prompt → Claude API → response
   - Session 文件持久化（JSON）
   - Stream 输出

3. Gateway（WebSocket 版）
   - ACP 协议消息解析
   - PromptRequest → runAttempt → PromptResponse
```

### Phase 2：Tools + Skills（1周）
```
4. Tool 注册框架
   - bash / read_file / write_file / glob 基础工具
   - Tool Result 截断（head+tail，400K 上限）

5. Skills 加载
   - SKILL.md 解析（frontmatter + body）
   - 注入上限（150个 / 30K字符）
   - System Prompt 组装
```

### Phase 3：上下文管理（1-2周）
```
6. Compaction（对话压缩）
   - 触发条件（剩余 < 32K tokens）
   - Claude 摘要 + 新 Session
   - 压缩超时保护

7. Tool Result Context Guard
   - 75% 预算比率
   - 原地截断（最旧优先）
   - 猴子补丁注入

8. Loop Detection
   - 4种检测器（generic/poll/ping-pong/circuit-breaker）
   - SHA-256 稳定哈希
```

### Phase 4：多渠道 + 多 Agent（2周）
```
9. 渠道适配器
   - Telegram Bot（首选，API 简单）
   - WebSocket/HTTP API（自定义客户端）

10. 子代理编排
    - sessions_spawn：启动子代理
    - sessions_send：向子代理发消息
    - Lane 隔离（NESTED vs SUBAGENT）

11. 路由系统
    - Session Key 完整编码
    - Binding 优先级匹配
```

### Phase 5：记忆 + 插件（2-3周）
```
12. RAG 记忆系统（简化版）
    - SQLite + sqlite-vec
    - 向量 + BM25 混合检索
    - 文件监听增量同步

13. ContextEngine 接口实现
    - DefaultContextEngine（文件 + 内存）
    - assemble() 在 token 预算内选择消息
    - afterTurn() 持久化 + 触发压缩

14. Hooks / Plugin 系统
    - HookRunner 接口
    - before_prompt_build / agent_end 钩子
```

### 关键技术选型（复刻）

| 组件 | 原版 | 复刻建议 |
|------|------|---------|
| LLM SDK | `@mariozechner/pi-coding-agent` | `@anthropic-ai/sdk` 直接调用 |
| 协议 | `@agentclientprotocol/sdk` | 直接使用（公开 npm 包）|
| Session 存储 | JSON 文件 | JSON 文件（一致）或 SQLite |
| 记忆索引 | SQLite + sqlite-vec + FTS5 | 同左，或 pgvector |
| 文件监听 | chokidar | chokidar（同）|
| 进程通信 | WebSocket | WebSocket（同）|
| 嵌入模型 | openai/gemini/voyage 等 | openai/Claude 3 haiku |

---

## 三十二、Equality 项目定位

### 核心差异化

OpenClaw 是一个**面向全球开发者**的通用 AI Agent 框架，默认假设用户能访问 Anthropic/OpenAI/Gemini。

**Equality** 的定位：

> 一款**面向中国大陆用户**的 AI Agent 框架：网络全程在境内，模型全程用国产，渠道首选微信/钉钉/飞书，数据不出境。

| 维度 | OpenClaw | Equality |
|------|---------|---------|
| 默认模型 | Claude Sonnet | DeepSeek / Qwen3 |
| 网络假设 | 境外 API 可直连 | 全部走国内端点 |
| 主力渠道 | Telegram / Discord / Signal | 企业微信 / 钉钉 / 飞书 / 微信公众号 |
| Skills API | GitHub / npm / brew（境外）| pip/国内镜像/conda/本地 |
| Embedding | OpenAI text-embedding / Voyage | 通义 text-embedding / BGE 本地 |
| 部署方式 | 个人服务器（Linux/macOS）| K8s / 阿里云 / 腾讯云一键部署 |
| 代码许可 | 原始许可证 | 自主设计，参考而非抄袭 |

---

## 三十三、PRC 模型接入优先级

### Tier 1 — 立即支持（Day 1）

```
DeepSeek V3 / R1
  endpoint: https://api.deepseek.com/v1
  auth: DEEPSEEK_API_KEY
  特点: 目前国内最强代码模型，价格极低（¥0.14/M input tokens）
  context: 64K tokens
  
通义千问 Qwen3（国内直连）
  endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1
  auth: DASHSCOPE_API_KEY
  特点: 阿里云，国内延迟低，100万上下文窗口
  模型: qwen3-coder-plus / qwen3.5-plus / qwen-long

豆包（字节跳动 VolcEngine）
  endpoint: https://ark.cn-beijing.volces.com/api/v3
  auth: VOLC_API_KEY
  特点: OpenClaw 已有基础，可直接复用逻辑
```

### Tier 2 — 第二阶段

```
智谱 GLM-4
  endpoint: https://open.bigmodel.cn/api/paas/v4
  auth: ZHIPUAI_API_KEY
  特点: 工具调用稳定，支持 Function Calling

Moonshot Kimi K2
  endpoint: https://api.moonshot.cn/v1
  auth: MOONSHOT_API_KEY
  特点: 长文本（128K），适合文档分析场景
  
百度千帆（Qianfan）
  endpoint: https://qianfan.baidubce.com/v2
  auth: QIANFAN_API_KEY
  特点: 国企合规需求首选，DeepSeek 托管版
```

### Tier 3 — 按需接入

```
百川 Baichuan-4
  endpoint: https://api.baichuan-ai.com/v1
  
零一万物 Yi-Large
  endpoint: https://api.lingyiwanwu.com/v1
  
MiniMax（已有基础）
  endpoint: https://api.minimax.chat/v1

本地模型（Ollama）
  特点: OpenClaw 已支持，直接复用
```

---

## 三十四、国内渠道接入策略

### 优先级排序

```
1. 飞书（Lark）★★★★★
   - 企业用户最多，Bot API 成熟
   - 支持卡片消息、富文本、文件
   - 有 Webhook + 长连接两种模式
   - SDK: @larksuiteoapi/node-sdk

2. 钉钉 ★★★★
   - 阿里系，中小企业渗透率高
   - Stream 模式（类 WebSocket，国内延迟低）
   - SDK: dingtalk-stream

3. 企业微信 ★★★★
   - 腾讯系，大企业必备
   - 消息加密复杂，但 SDK 完善
   - SDK: @wecom/robot-sdk

4. 微信公众号 ★★★
   - 个人/小B用户场景
   - 被动回复（5秒超时）是最大限制 → 需要异步回调设计
   - 需要服务器验证

5. 微信群机器人（Webhook）★★
   - 仅支持发消息，不能接收
   - 适合单向通知场景
```

### 异步回调设计（针对微信5秒超时）

微信公众号被动回复有 **5 秒超时**，AI 推理往往超过这个时间。解决方案：

```
收到消息
  ├── 立即返回空响应（< 1s）
  ├── 后台启动 Agent 运行
  └── 完成后通过客服消息接口主动推送结果

实现：
  - Redis 队列存储待处理消息
  - Worker 异步处理
  - 客服消息 API 回推（需认证服务号）
```

---

## 三十五、PRC 化 Skills 设计

OpenClaw 的 Skills 默认使用的安装工具和包源都是境外的。Equality 需要完整替换：

### 安装指令 PRC 化

| OpenClaw | Equality PRC 替换 |
|---------|------------------|
| `brew install ffmpeg` | `apt install ffmpeg` / conda（国内镜像）|
| `npm install -g xxx` | `npm install --registry https://registry.npmmirror.com -g xxx` |
| `pip install xxx` | `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple xxx` |
| `go install xxx` | `GOPROXY=https://goproxy.cn go install xxx` |

### PRC 专属 Built-in Skills

```
skill: 微信推送
描述: 通过企业微信/公众号发送消息
install: 无需安装（HTTP API）

skill: 阿里云 OSS
描述: 上传/下载文件到 OSS
install: pip install oss2 -i <清华镜像>

skill: 钉钉通知
描述: 发送钉钉群消息
install: 无需安装

skill: 百度OCR
描述: 识别图片中的文字
install: pip install baidu-aip

skill: 腾讯云 COS
描述: 腾讯云对象存储
install: pip install cos-python-sdk-v5

skill: 高德地图
描述: 地址解析/路线规划
install: 无需安装（HTTP API）
```

---

## 三十六、Embedding 本地化方案

OpenClaw 的 Memory 系统默认用 OpenAI `text-embedding-3-small`（境外 API）。Equality 方案：

### 方案 A：通义 Embedding（推荐）

```
provider: dashscope
model: text-embedding-v3
endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
auth: DASHSCOPE_API_KEY
dims: 1024
价格: ¥0.0007/1K tokens（极低）
```

### 方案 B：BGE 本地（零成本）

```
provider: ollama (local)
model: bge-m3 (中英双语，1024 dims)
endpoint: http://localhost:11434
价格: 免费（需要本地 GPU 或 CPU 推理）
支持语言: 中英混合检索效果极佳
```

### 方案 C：智谱 Embedding

```
provider: zhipuai
model: embedding-3
endpoint: https://open.bigmodel.cn/api/paas/v4/embeddings
dims: 2048
```

**推荐策略：** 默认 BGE-M3（本地），有 Dashscope key 时自动升级为通义 Embedding，与 OpenClaw 的"auto"策略一致。

---

## 三十七、技术架构调整（equality vs openclaw）

### 保留的设计
- ✅ Session Key 编码规则（agentId:channel:accountId:peer）
- ✅ Skills / Hooks 双轨插件系统
- ✅ Tool Result Context Guard（75% 预算 + 原地压缩）
- ✅ Loop Detection 四种探测器
- ✅ Model Fallback 降级链
- ✅ ContextEngine 可插拔接口
- ✅ Stream Decorator 洋葱模型（每层 wrapper 职责单一）
- ✅ Compaction 摘要压缩机制

### 调整的设计

| 模块 | OpenClaw | Equality 调整 |
|------|---------|--------------|
| LLM SDK | `@mariozechner/pi-*`（私有）| `@anthropic-ai/sdk` + OpenAI SDK（二者都支持 DeepSeek 协议）|
| 默认模型 | claude-sonnet | deepseek-v3 / qwen3-coder-plus |
| 主力渠道 | Telegram | 飞书 + 钉钉 |
| Embedding | OpenAI / Voyage | BGE-M3（本地）/ 通义 |
| Skills 安装 | brew/npm/go/uv | pip国内镜像/conda/apt |
| Session 存储 | JSON 文件（单进程）| JSON 文件起步，后期 SQLite WAL（并发更好）|
| 部署目标 | Linux 个人服务器 | Windows 桌面（Tauri 打包，8MB 安装包）|

### 新增的设计

| 新增模块 | 说明 |
|---------|------|
| 异步消息回调 | 微信5秒超时的通用解决方案，所有渠道统一异步化 |
| 国内镜像加速 | Skills 安装全程走国内镜像，首次安装 < 30s |
| 合规审计日志 | 企业客户需要，所有对话存入不可篡改日志 |
| 多租户隔离 | 企业微信/钉钉场景下，不同企业数据完全隔离 |
| **智能模型路由** | 按任务复杂度自动选模型，详见第三十八章 |
| **成本追踪系统** | 精确到每个 step 的 token 消耗和人民币费用，详见第三十九章 |

---

## 三十八、智能模型路由（Task-Aware Model Routing）

### 设计动机

不同任务的复杂度差异巨大，用同一个模型处理所有任务既浪费又不灵活：
- 「帮我把这段话翻译成英文」→ Qwen3-7B 足够，成本极低
- 「分析这份财务报表并给出建议」→ 需要 Qwen3-Plus 或 DeepSeek V3
- 「帮我写一个 FastAPI 服务并加单测」→ DeepSeek Coder / Qwen3-Coder
- 「多步骤、需要调用十几个工具的复杂研究任务」→ 最强模型 + 长上下文

### 任务复杂度评估器（Task Complexity Estimator）

每次收到用户消息时，在正式运行 Agent 之前，先用**轻量级分类模型**快速判断任务复杂度：

```typescript
type TaskComplexity = "nano" | "micro" | "standard" | "advanced" | "expert";

interface TaskProfile {
  complexity: TaskComplexity;
  taskType: "chat" | "translate" | "summarize" | "analyze" | "code" | "research" | "multi-step";
  estimatedSteps: number;        // 预估需要多少步工具调用
  requiresCode: boolean;
  requiresLongContext: boolean;  // 预计上下文 > 32K tokens
  requiresReasoning: boolean;    // 需要深度推理
  confidence: number;            // 0-1，分类置信度
}
```

**分类方式（两级）：**

1. **规则级（零成本，< 1ms）**：先用关键词/正则做快速判断
   ```
   包含"翻译"/"转换"/"改写" + 内容 < 500字 → nano
   包含"写代码"/"实现"/"调试" → code 类型
   包含"分析"/"报告"/"研究" + 多个问题 → advanced
   消息长度 > 2000字 → 强制 standard 以上
   ```

2. **LLM 级（微成本，~50 tokens）**：规则无法确定时，用最小模型做一次 classify 调用
   ```
   用 Qwen3-1.7B（本地）或 DeepSeek V3（5 token 回答）判断复杂度等级
   成本：< ¥0.000001/次
   ```

### 模型路由表（可配置）

```yaml
# equality.config.yaml
routing:
  strategy: "cost-aware"   # cost-aware | quality-first | manual
  
  tiers:
    nano:           # 极简任务：打招呼、简单问答、短翻译
      primary: "deepseek/deepseek-v3"          # ¥0.14/M
      fallback: "qwen/qwen3-8b-instruct"       # ¥0.05/M（本地 Ollama）
      maxTokens: 4096
      
    micro:          # 轻量任务：摘要、格式化、单步问答
      primary: "qwen/qwen3-plus"               # ¥0.8/M
      fallback: "deepseek/deepseek-v3"
      maxTokens: 8192
      
    standard:       # 常规任务：文档分析、多轮对话、简单代码
      primary: "deepseek/deepseek-v3"          # ¥0.14/M input
      fallback: "qwen/qwen3-coder-plus"
      maxTokens: 32768
      
    advanced:       # 复杂任务：多步骤工具链、代码生成+测试
      primary: "qwen/qwen3-coder-plus"         # ¥3.5/M
      fallback: "zhipu/glm-4-plus"
      maxTokens: 65536
      
    expert:         # 专家任务：复杂研究、大型代码重构、长文档
      primary: "moonshot/kimi-k2-thinking"     # 长上下文
      fallback: "qwen/qwen3-coder-plus"
      maxTokens: 131072

  # 任务类型强制覆盖（优先级高于复杂度）
  taskOverrides:
    code:
      primary: "deepseek/deepseek-v3"    # 代码任务首选 DeepSeek
    translate:
      primary: "qwen/qwen3-plus"         # 翻译任务首选通义（中英互译最佳）
    research:
      primary: "moonshot/kimi-k2.5"      # 研究任务首选 Kimi 长上下文
```

### 运行时路由决策流程

```
用户消息到达
    │
    ▼
① 规则快速分类（< 1ms）
    │ 无法确定
    ▼
② 轻量 LLM 分类（~100ms，~50 tokens）
    │
    ▼
③ 查路由表 → 确定主模型 + 备用模型
    │
    ▼
④ 检查模型可用性（API key、冷却状态）
    │ 不可用
    ▼
⑤ Fallback 到备用模型
    │
    ▼
⑥ 运行 Agent（携带路由决策元数据）
    │
    ▼
⑦ 记录实际成本到 CostLedger
```

### 动态调整（运行中升级）

Agent 运行中途可以**升级模型**。当 Tool Result Context Guard 检测到上下文接近上限时：

```typescript
// 当前模型上下文窗口不足，动态升级
if (remainingTokens < UPGRADE_THRESHOLD) {
  const upgraded = routingEngine.upgradeModel(currentModel, {
    reason: "context_overflow",
    minContextWindow: requiredTokens * 1.5,
  });
  if (upgraded) {
    // 热切换：保留当前对话历史，更换模型
    session.switchModel(upgraded);
    costLedger.recordModelSwitch(currentModel, upgraded, "upgrade");
  }
}
```

---

## 三十九、成本追踪系统（Cost Ledger）

### 设计目标

> 复杂任务结束后，能看到每一步花了多少 token、花了多少钱、哪个环节最贵。

### 核心数据结构

```typescript
// 每一步工具调用或 LLM 调用的成本记录
interface CostEntry {
  entryId: string;
  sessionId: string;
  runId: string;
  
  // 时间
  timestamp: number;
  durationMs: number;
  
  // 模型信息
  provider: string;          // "deepseek" | "qwen" | "zhipu" ...
  model: string;             // "deepseek-v3" | "qwen3-coder-plus"
  modelTier: TaskComplexity; // 路由决定的层级
  
  // Token 消耗
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;   // Prompt Cache 命中（部分模型支持）
    cacheWriteTokens: number;
    thinkingTokens?: number;   // 推理模型的 thinking tokens
    totalTokens: number;
  };
  
  // 人民币费用（精确到分）
  cost: {
    inputCny: number;        // 输入费用（元）
    outputCny: number;       // 输出费用（元）
    cacheReadCny: number;    // 缓存读取费用
    cacheWriteCny: number;   // 缓存写入费用
    totalCny: number;        // 合计（元）
  };
  
  // 上下文
  phase: "classify" | "prompt" | "compact" | "subagent" | "embedding";
  toolCallsInStep: number;   // 本步骤发出了几个工具调用
  wasUpgraded: boolean;      // 是否触发了模型升级
  wasCompacted: boolean;     // 是否触发了 Compaction
}

// Session 级别的汇总账本
interface SessionCostSummary {
  sessionId: string;
  sessionKey: string;
  startTime: number;
  endTime?: number;
  
  // 按模型汇总
  byModel: Record<string, {
    calls: number;
    totalTokens: number;
    totalCny: number;
  }>;
  
  // 按阶段汇总
  byPhase: Record<CostEntry["phase"], {
    calls: number;
    totalTokens: number;
    totalCny: number;
  }>;
  
  // 总计
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    totalTokens: number;
    totalCny: number;
    avgCnyPerCall: number;
  };
  
  // 路由效果评估
  routing: {
    upgradeCount: number;      // 触发了几次模型升级
    compactionCount: number;   // 触发了几次 Compaction
    classifyCost: number;      // 分类器本身花了多少钱
  };
}
```

### 费率表（可更新）

```typescript
// src/cost/pricing.ts
// 单位：元/1M tokens（人民币）
const PRICING: Record<string, ModelPricing> = {
  "deepseek/deepseek-v3": {
    input: 0.14,
    output: 0.28,
    cacheRead: 0.014,   // 缓存命中打一折
    cacheWrite: 0.14,
  },
  "deepseek/deepseek-r1": {
    input: 1.0,
    output: 16.0,
    thinkingIncluded: true,
  },
  "qwen/qwen3-coder-plus": {
    input: 3.5,
    output: 14.0,
    cacheRead: 0.35,
  },
  "qwen/qwen3-plus": {
    input: 0.8,
    output: 3.2,
  },
  "zhipu/glm-4-plus": {
    input: 50.0,    // 按调用次数计费，此处为等效值
    output: 50.0,
  },
  "moonshot/kimi-k2.5": {
    input: 8.0,
    output: 32.0,
  },
  // ... 持续维护
};

export function calculateCost(
  provider: string,
  model: string,
  usage: TokenUsage,
): { totalCny: number; breakdown: CostBreakdown } {
  const key = `${provider}/${model}`;
  const pricing = PRICING[key] ?? PRICING["default"];
  // 费用 = tokens / 1_000_000 * 单价
  const inputCny = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCny = (usage.outputTokens / 1_000_000) * pricing.output;
  const cacheReadCny = ((usage.cacheReadTokens ?? 0) / 1_000_000) * (pricing.cacheRead ?? 0);
  return {
    totalCny: inputCny + outputCny + cacheReadCny,
    breakdown: { inputCny, outputCny, cacheReadCny },
  };
}
```

### 成本报告（任务结束后）

```
════════════════════════════════════════════════
任务成本报告  [sessionId: agent:main:feishu:...]
执行时间: 2026-03-11 14:23 ~ 14:31 (8分12秒)
════════════════════════════════════════════════

按阶段明细：
  分类评估    1次   nano        132 tokens    ¥0.000019
  主对话      4次   standard    8,234 tokens  ¥0.0012
  工具执行    -     -           -             ¥0.00（本地）
  子代理      2次   advanced    31,022 tokens ¥0.109
  摘要压缩    1次   micro       4,891 tokens  ¥0.0039
────────────────────────────────────────────────
合计                            44,279 tokens ¥0.1141

按模型明细：
  deepseek-v3      3次   12,455 tokens  ¥0.0017  (12%)
  qwen3-coder-plus 4次   31,824 tokens  ¥0.1115  (98%)
  qwen3-plus       1次      132 tokens  ¥0.0001  ( 0%)

优化建议：
  ⚠ 子代理消耗了总成本的 95%，考虑将子代理降级至 standard 模型
  ✓ Prompt Cache 命中率 67%（节省了约 ¥0.031）
  ✓ 模型路由准确，未发生意外升级
════════════════════════════════════════════════
```

### 持久化与查询

```typescript
// 成本数据写入 SQLite（与 Memory 复用同一数据库）
// 表结构：cost_entries, session_cost_summaries

// 查询接口
costLedger.getSessionSummary(sessionId): SessionCostSummary
costLedger.getTopCostSessions(days: 7): SessionCostSummary[]
costLedger.getModelEfficiency(): ModelEfficiencyReport  // 各模型性价比排行
costLedger.exportCsv(dateRange): string                 // 导出 CSV 供 Excel 分析
```

### 与路由系统的闭环优化

成本追踪数据会反向影响路由决策：

```
积累足够的历史数据（> 100 次任务）
    │
    ▼
分析：哪类任务实际需要高端模型？
（例：发现"代码审查"任务用 standard 模型也能完成）
    │
    ▼
自动调整路由表建议（输出 diff，人工审核后生效）
    │
    ▼
新的路由配置 → 下一轮任务成本降低
```

这形成了一个**可持续优化的成本飞轮**：用数据驱动模型选择，而不是靠经验猜测。

---

*文档完成：equality 项目定位、PRC 模型接入、国内渠道、Skills 本地化、架构差异均已覆盖*  
*第三十八、三十九章：智能模型路由 + 成本追踪系统设计完成*  
*第四十章：Windows 桌面客户端架构*  
*第四十一～四十五章：设计漏洞修补与遗漏补充*  
*下一步：开始 Phase 0 骨架实现*

---

## 四十、Windows 桌面客户端架构

### 先搞清楚：OpenClaw 的 Windows 支持现状

OpenClaw **已经能在 Windows 上运行**，但体验很原始：

```
安装方式：npm install -g openclaw
后台服务：Windows Task Scheduler（计划任务）注册为 gateway.cmd 定时任务
交互方式：Terminal TUI（文字界面，类似 vim 风格）
官方建议：Windows 用户"强烈推荐用 WSL2"
图形界面：❌ 没有
系统托盘：❌ 没有
全局快捷键：❌ 没有
```

OpenClaw 的 `src/daemon/schtasks.ts` 负责 Windows 服务注册（`schtasks /Create`），`src/tui/` 是终端 TUI 界面，甚至有专门处理 Windows Git Bash 粘贴兼容问题的代码。但整体而言，**Windows 是二等公民**——所有文档示例都基于 macOS/Linux，Windows 用 WSL2 凑合。

**这正是 equality 的差异化机会：** 把同样的 Agent Core 封装成真正的 Windows 原生桌面应用。

---

### 产品形态定位

OpenClaw 的模式是"装在服务器上，通过 IM 软件遥控 AI"。equality 可以支持这个模式，同时**额外提供**桌面端直接交互：

```
模式 A（继承 OpenClaw）：通过飞书/钉钉/企微与 AI 对话
  → Agent Core 在本机后台运行（Windows 服务）
  → 用户在手机 App 或企业 IM 里发消息

模式 B（equality 新增）：桌面直接交互
  → 系统托盘图标 + 全局快捷键呼出
  → 悬浮输入框，不切换应用直接问 AI
  → 任务结束桌面通知
```

两个模式共用同一个 Agent Core，只是 UI 层不同。

---

### 技术选型：Tauri（Rust + WebView2）

| 方案 | 安装包大小 | 内存占用 | 原生能力 | 说明 |
|------|---------|---------|---------|------|
| **Tauri** | ~8MB | ~30MB | ✅ 全局热键/托盘/通知 | 推荐 |
| Electron | ~150MB | ~200MB | ✅ | 过重 |
| WPF/.NET | ~50MB | ~80MB | ✅ 最强 | 纯 Windows，不跨平台 |
| 纯 Node.js CLI | ~0MB（已有）| ~80MB | ❌ 无 GUI | OpenClaw 现状 |

**选 Tauri 的理由：**
- 安装包仅 8MB（vs Electron 150MB），一键安装体验极佳
- 使用系统自带 WebView2（Win10/11 内置），无需捆绑 Chromium
- 前端用 React，UI 开发效率高
- Rust 后端处理系统级 API（全局热键、剪贴板、系统通知）
- 支持自动更新（`tauri-plugin-updater`）

---

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                  Windows 系统层                          │
│  全局热键监听  文件系统监听  剪贴板  系统通知 / 托盘    │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri IPC（Rust ↔ WebView2）
┌────────────────────▼────────────────────────────────────┐
│                  Tauri 主进程（Rust）                    │
│  - 系统托盘管理                                         │
│  - 全局快捷键注册（Alt+Space）                          │
│  - 悬浮窗 / 设置面板 / 历史面板 生命周期管理            │
│  - 启动并守护 Agent Core 子进程                         │
│  - 自动更新                                             │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / WebSocket（localhost:18790）
┌────────────────────▼────────────────────────────────────┐
│              Equality Agent Core（Node.js）              │
│  - 对标 OpenClaw Gateway + Agent Runner                 │
│  - Session 文件存于 %APPDATA%\Equality\sessions\        │
│  - Skills / Tools / Compaction / 成本追踪               │
│  - 同时支持飞书/钉钉 IM 渠道（模式 A）                  │
│  - 打包为 Node.js SEA 单文件可执行                      │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS（国内 API）
┌────────────────────▼────────────────────────────────────┐
│              PRC LLM Provider（云端）                    │
│  DeepSeek / 通义 / 智谱 / Kimi ...                      │
└─────────────────────────────────────────────────────────┘
```

**为什么 Agent Core 继续用 Node.js？**
- 继承 OpenClaw 的全部 TypeScript 设计（Session/Skills/Compaction/路由）
- Node.js 22 支持 Single Executable Application（SEA），打包成一个 `.exe`，用户无感
- Rust 层只负责系统集成，Node.js 层负责 AI 逻辑，职责分离

---

### 窗口设计

#### 悬浮输入框（主入口，Alt+Space 呼出）

```
┌─────────────────────────────────────┐
│  ✦  问点什么...                   ⚙ │  ← 全屏居中，半透明毛玻璃背景
│  ─────────────────────────────────  │
│  📎 附件   🖼 截图   📋 剪贴板     │
└─────────────────────────────────────┘
  输入时实时流式显示回复（内联展开，不另开窗口）
  Esc 收起，Ctrl+H 打开历史
```

#### 历史面板

```
  今天
  ▶ 帮我分析了 Q1 财务报表   14:23   ¥0.023
  ▶ 写了一段 Python 爬虫     11:05   ¥0.011
  昨天
  ▶ 翻译了一份英文合同       16:44   ¥0.003
```

每条历史直接显示成本，配合第三十九章的 Cost Ledger。

---

### 一键安装方案

#### 安装包结构

```
EqualitySetup-1.0.0-x64.exe   (~25MB)
  ├── equality.exe              ← Tauri 主程序
  ├── equality-core.exe         ← Node.js SEA（Agent Core，无需安装 Node）
  └── resources\
      ├── app\                  ← 前端打包产物
      └── skills\               ← 内置 Skills
```

#### 安装流程（用户视角，< 60 秒）

```
双击 EqualitySetup.exe
  │
  ▼
① 检测 WebView2（Win10/11 已内置，极少数情况才需下载）
  │
  ▼
② 解压到 C:\Program Files\Equality\
  │
  ▼
③ 注册开机自启动（HKCU Run）
  │
  ▼
④ 首次启动 → 引导页：输入 API Key，选择默认模型
  │
  ▼
完成！托盘出现图标，按 Alt+Space 立即可用
```

#### Windows 服务注册（模式 A，IM 渠道）

对于需要 24 小时运行飞书/钉钉 Bot 的用户，Agent Core 同样支持注册为 Windows 服务：

```powershell
# 效仿 OpenClaw 的 schtasks 方案，但包装成 GUI 操作
# 设置面板 → "开机自动运行 IM Bot" → 自动调用 sc.exe 注册服务
```

---

### Windows 特有能力（差异化）

| 能力 | 实现方式 | OpenClaw 有？ |
|------|---------|-------------|
| 全局快捷键 Alt+Space | `tauri-plugin-global-shortcut` | ❌ |
| 系统托盘常驻 | `tauri-plugin-system-tray` | ❌ |
| 选中文字直接问 AI | Windows UI Automation API | ❌ |
| 文件右键"用 Equality 分析" | 注册 Shell 扩展（注册表）| ❌ |
| 截图分析 | `tauri-plugin-screenshot` + 多模态模型 | ❌ |
| API Key DPAPI 加密 | Windows Data Protection API | ❌（明文 .env）|
| 桌面通知 | `tauri-plugin-notification` | ❌ |
| 自动更新 | `tauri-plugin-updater` | ❌（手动 npm update）|

---

### 数据存储路径（Windows 规范）

```
%APPDATA%\Equality\
  ├── config.json       ← API Keys（DPAPI 加密）
  ├── sessions\         ← 对话历史
  ├── memory\           ← RAG 索引（SQLite）
  ├── cost-ledger.db    ← 成本账本
  ├── skills\           ← 用户自定义 Skills
  └── logs\             ← 运行日志（按天滚动）
```

---

### Phase 0：Windows 客户端脚手架（新增阶段）

在原有 Phase 1-5 之前，先搭建骨架：

```
Phase 0（1周）：Tauri 骨架
  ✓ Tauri + React 项目初始化
  ✓ 系统托盘 + Alt+Space 全局快捷键
  ✓ 悬浮窗显示/隐藏动画
  ✓ Tauri 启动 Node.js 子进程（Agent Core）
  ✓ IPC 通信：前端 ↔ Tauri ↔ Agent Core
  ✓ NSIS 安装包打包脚本

Phase 1（原有）：Agent Core 骨架
  ✓ Session Store + 单轮 Agent Runner
  ✓ DeepSeek API 直连 + 流式输出到前端

...后续 Phase 2-5 不变
```

---

## 四十一、漏洞：微信公众号5秒超时方案不完整

第三十四章提到了异步回调设计，但**只给了方向，没给出具体实现**。这是最难的渠道，需要补齐。

### 问题根源

微信公众号被动回复有严格的 **5 秒响应超时**，超时返回空则微信重试（最多 3 次），重试后仍无响应则向用户显示"该公众号暂时无法提供服务"。

AI 推理通常需要 3-30 秒，直接在请求处理函数里跑推理必然超时。

### 完整解决方案

```
微信 POST → 服务器
           │
           ├── ① < 500ms：立即返回 "success"（微信要求的空回包）
           │              OR 立即返回"🤔 正在思考，请稍候..."（客服消息接口支持先回小字）
           │
           └── ② 后台：taskQueue.enqueue({ openid, content, msgId })
                           │
                           ▼
                    Worker 拿到任务
                           │
                    ③ 检查去重（msgId 防重投）
                           │
                    ④ 运行 Agent（3-30s）
                           │
                    ⑤ 调用微信客服消息接口（customerService.send）
                           向用户主动推送 AI 回复

```

**关键细节：**

1. **去重防重投**：微信在 5s 无响应时会重试同一条消息（最多3次），`msgId` 必须去重
   ```typescript
   const dedupKey = `wx:msg:${msgId}`;
   if (await redis.exists(dedupKey)) return; // 已处理，忽略重试
   await redis.setex(dedupKey, 3600, "1");   // 1小时内去重
   ```

2. **客服消息接口**：需要公众号有客服权限（认证订阅号/服务号），或使用模板消息接口
   ```typescript
   POST https://api.weixin.qq.com/cgi-bin/message/custom/send
   {
     "touser": openid,
     "msgtype": "text",
     "text": { "content": agentReply }
   }
   ```

3. **超长回复分段**：微信单条文本消息上限 2048 字节，超长回复需分段发送（1.5s 间隔，避免顺序错乱）

4. **Access Token 缓存**：微信 Access Token 有效期 7200s，必须缓存（Redis），不能每次请求都获取

5. **任务队列选型**：
   - 轻量（< 100 并发）：`better-queue`（内存）
   - 中等（< 1000 并发）：`bullmq`（Redis）
   - 生产（> 1000 并发）：腾讯云 CMQ / 阿里云 MNS

---

## 四十二、漏洞：费率表的时效性问题

第三十九章的费率表是**硬编码在代码里的**，这会导致：

- 模型降价（DeepSeek 经常降价）后，成本报告数字仍是旧价格，误导优化决策
- 新上线模型需要发版才能用
- 运营不懂代码，没法自己维护价格

### 解决方案：远程可更新的费率配置

```typescript
// src/cost/pricing-registry.ts

interface PricingRegistry {
  // 1. 读取顺序：本地覆盖 > 远程拉取 > 内置兜底
  load(): Promise<void>;
  
  // 2. 远程端点（equality 官方维护）
  // GET https://config.equality.ai/pricing/latest.json
  
  // 3. 本地覆盖（用户自定义，优先级最高）
  // %APPDATA%\Equality\pricing-override.yaml
  
  // 4. 缓存：24小时更新一次，离线时用缓存
}
```

**费率文件格式（JSON，可放 CDN）：**
```json
{
  "version": "2026-03-11",
  "currency": "CNY",
  "models": {
    "deepseek/deepseek-v3": {
      "input": 0.14,
      "output": 0.28,
      "cacheRead": 0.014,
      "cacheWrite": 0.14,
      "contextWindow": 65536,
      "updatedAt": "2026-02-01"
    }
  }
}
```

这样模型降价后，只需更新 CDN 上的 JSON 文件，所有用户 24 小时内自动生效，**无需发版**。

---

## 四十三、漏洞：Node.js SEA（单文件可执行）的实际限制

第四十章提到"打包为 Node.js SEA 单文件可执行"，但 **Node.js 22 SEA 有若干关键限制**没有明确说明，会影响实现方案：

### 已知限制

| 限制 | 影响 | 对策 |
|------|------|------|
| 不支持原生 `.node` 模块（`nan` / `napi`）| `better-sqlite3`、`sqlite-vec` 等原生模块无法打包进 SEA | 改用纯 JS 替代（`sql.js`），或在安装时单独存放 `.node` 文件 |
| 不支持动态 `require()`（代码里的动态路径）| Skills 动态加载可能依赖 `require(variable)` | 改用 `import.meta.resolve()` + 白名单 |
| Worker Thread 文件路径问题 | `new Worker('./worker.js')` 在 SEA 内找不到文件 | 用 `Worker(code, {eval: true})` 或提取到临时文件 |
| 文件大小上限约 1GB | 基本没问题 | - |

### 推荐实施方案（修正）

```
equality-core/
  ├── equality-core.exe     ← Node.js SEA（纯 JS 部分）
  └── native/
      ├── better_sqlite3.node  ← 原生模块，单独存放
      └── sqlite_vec.node
```

安装时 SEA 和 native/ 目录一起复制到 `C:\Program Files\Equality\`，SEA 启动时从固定相对路径加载 native 模块：

```typescript
// 在 SEA 内部加载原生模块
const nativeDir = path.join(path.dirname(process.execPath), "native");
const Database = require(path.join(nativeDir, "better_sqlite3.node"));
```

---

## 四十四、遗漏：并发安全与 Race Condition 设计

前文（第二十一章缺点3、缺点5）分析了 OpenClaw 的并发问题，但**equality 的解决方案没有具体到实现层**。补充：

### 场景：飞书群里多人同时 @机器人

```
t=0ms   用户A 发消息，Agent 开始处理
t=200ms 用户B 发消息，同一 Session，排队
t=500ms 用户C 发消息，同一 Session，排队
```

**设计原则（OpenClaw 的 Lane 系统）：**
- 同一 Session：**严格串行**（队列等待，前一个完成才处理下一个）
- 不同 Session：**完全并发**（各自独立处理）

**equality 的实现方案：**

```typescript
// src/concurrency/session-queue.ts
class SessionQueue {
  // Key: sessionKey → 当前运行中的 Promise
  private running = new Map<string, Promise<void>>();
  
  async enqueue(sessionKey: string, task: () => Promise<void>): Promise<void> {
    // 等待前一个任务完成后，再执行本任务
    const prev = this.running.get(sessionKey) ?? Promise.resolve();
    const next = prev.then(task).finally(() => {
      // 只清理自己（避免清掉后续已入队的）
      if (this.running.get(sessionKey) === next) {
        this.running.delete(sessionKey);
      }
    });
    this.running.set(sessionKey, next);
    return next;
  }
}
```

**与 OpenClaw `command-queue.ts` 的区别：**
- OpenClaw 是 per-Lane 队列（Lane = channel:peer 维度）
- equality 简化为 per-SessionKey 队列（更细粒度，不同 Agent 的同一用户可以并发）

### 场景：文件写入 Race Condition

Session 持久化和 Compaction 都要写同一个 Session 文件。equality 使用 **async-mutex** 实现 per-file 写锁：

```typescript
import { Mutex } from "async-mutex";
const fileLocks = new Map<string, Mutex>();

async function writeSession(sessionKey: string, data: SessionData) {
  if (!fileLocks.has(sessionKey)) fileLocks.set(sessionKey, new Mutex());
  const release = await fileLocks.get(sessionKey)!.acquire();
  try {
    await fs.writeFile(sessionPath(sessionKey), JSON.stringify(data));
  } finally {
    release();
  }
}
```

---

## 四十五、遗漏：错误边界与用户体感降级

OpenClaw 的错误处理是运维视角（日志、重启守护进程），但用户在消息渠道里看到的是"沉默"——出错了什么都没有，用户不知道发生了什么。

**equality 必须设计明确的用户侧错误提示：**

### 错误分级与用户消息

```typescript
type UserFacingErrorLevel = "retry" | "degraded" | "failed" | "budget";

const USER_ERROR_MESSAGES: Record<UserFacingErrorLevel, string> = {
  retry:    "⏳ 网络波动，正在重试...",
  degraded: "⚠️ 主模型繁忙，已切换至备用模型，功能略有降低",
  failed:   "❌ 请求失败，请稍后再试。如持续出现请检查 API Key 配置",
  budget:   "💰 今日费用预算已用完（¥{limit}），请在设置中调整限额",
};
```

### API Key 无效 vs 余额不足 的区别

这两种错误现象相同（都是 401/402），但解决方式完全不同：

```typescript
function classifyApiError(err: ApiError): UserFacingErrorLevel {
  if (err.status === 401) {
    if (err.message.includes("invalid_api_key")) {
      // API Key 本身错误 → 提示用户检查配置，不重试
      return "failed";
    }
  }
  if (err.status === 402 || err.message.includes("insufficient_quota")) {
    // 余额不足 → 提示充值，不重试
    return "budget";  
  }
  if (err.status === 429) {
    // 限流 → 等待重试（model-fallback 机制处理）
    return "retry";
  }
  if (err.status >= 500) {
    // 服务端错误 → 降级到备用模型
    return "degraded";
  }
  return "failed";
}
```

### 心跳检测（Keepalive）

对于长时间运行的任务（> 30s），需要定期向用户发送"心跳"，防止用户以为机器人挂了：

```typescript
// 每 30s 如果任务还在运行，发送进度提示
const heartbeat = setInterval(() => {
  if (session.isRunning) {
    channel.sendEphemeral("⏳ 任务进行中，请稍候...");
  }
}, 30_000);
// 任务结束后清理
session.onEnd(() => clearInterval(heartbeat));
```

---

## 四十六、遗漏：多租户与数据隔离（企业场景）

第三十七章提到"多租户隔离"但没有展开。企业微信/钉钉/飞书场景下，**同一个 equality 实例可能服务多个企业**，数据绝对不能混。

### 租户识别

```
飞书：  app_id（每个企业有唯一 app_id）
钉钉：  corpid（企业唯一 ID）
企业微信：corpid（企业唯一 ID）
```

### 数据隔离策略

```
存储路径隔离（推荐，最简单）：
  %APPDATA%\Equality\tenants\{tenantId}\
    ├── sessions\    ← 该企业的所有 Session
    ├── memory\      ← 该企业的 RAG 索引
    └── cost.db      ← 该企业的成本账本

Session Key 隔离（已覆盖）：
  Session Key 里含 channel（飞书）+ accountId（appId）
  不同企业的 session key 天然不重叠

API Key 隔离：
  不同企业可配置不同的 LLM API Key 和费用配额
  config: tenants.{tenantId}.llm.apiKey
```

### 租户配额管理

```yaml
# equality.config.yaml
tenants:
  tenant_a:
    name: "A公司"
    channels:
      feishu: { appId: "cli_xxx", appSecret: "xxx" }
    llm:
      apiKey: "sk-xxx"      # 单独 API Key（成本计入该企业）
    limits:
      dailyBudgetCny: 50    # 每日预算 50 元
      maxSessions: 100      # 最多并发 Session
  
  tenant_b:
    name: "B公司"
    channels:
      dingtalk: { appKey: "xxx", appSecret: "xxx" }
    llm:
      apiKey: "sk-yyy"
    limits:
      dailyBudgetCny: 20
```

---

*设计漏洞补充完成（第四十一～四十六章）*  
*主要修补：微信异步回调完整实现、费率表时效性、Node.js SEA 限制、并发安全、错误边界、多租户隔离*

---

## 四十七、任务编排与工作流复用（核心差异化）

> 📄 详细提案：`openspec/changes/task-orchestration/proposal.md`

### 问题

现实中的任务往往是复杂的：通过 Teams 收到的任务可能需要"写一个 Web 应用"或"修改一个 PPT"。这类任务需要多步骤、多技能协调，且会反复出现。

### OpenClaw 的做法

OpenClaw **没有工作流引擎**。任务拆分完全靠 LLM 涌现式推理（通过 `sessions_spawn` 创建子代理）。这意味着：
- 每次遇到相似任务都要重新推理拆分策略（浪费 token）
- 同样的任务两次拆分可能完全不同（不可预测）
- 没有机制保存成功的执行方案（无法复用）

### Equality 的差异化设计

```
用户输入 → TemplateMatch(语义匹配) ──hit──→ 直接按模板执行
                                   │
                                   └─miss──→ TaskPlanner(LLM拆分)
                                                  │
                                                  ▼
                                             StepRunner(逐步执行)
                                                  │
                                                  ▼
                                             保存为 WorkflowTemplate
```

**核心创新点**：

1. **首次推理，永久复用** — 成功执行后自动抽象为参数化模板
2. **二阶段模板匹配** — 向量粗筛（cosine > 0.75）+ LLM 精排（确认 + 参数绑定）
3. **步骤级隔离** — 每步独立 session（`plan:{id}:step:{id}`），互不污染
4. **摘要传递** — 前步结果以摘要形式注入后步 prompt，避免全量上下文传递
5. **断点续执** — 步骤粒度持久化，崩溃后从失败步骤恢复

### Token 节约

对于重复出现的 5 步任务：
- 无模板：~6,250 tokens（含拆分推理 2,000）
- 有模板：~4,750 tokens（跳过拆分，增加匹配 500）
- **节约 ~24%**，重复性越高节约越多

### Phase 归属

- Phase 2：TaskClassifier + 单步进度 SSE（低成本预做）
- Phase 3：Compaction 多步集成 + Context Guard 步骤级 + 高级 Loop Detection（多步编排的前置基础设施）
- Phase 4：TaskPlanner + StepRunner（依赖多 agent 角色 + session 层级）
- Phase 5：WorkflowTemplate 保存/匹配（依赖 embedding + 向量检索）

### 与多 Agent 的关系

任务编排 ≠ 多 Agent。编排层在 runner **之上**，是对 `runAttempt()` 的多次调用编排。多 Agent（Phase 4 的 session 层级 + agent 角色）是编排层的**基础设施**，但编排层本身的价值在于结构化执行 + 模板复用。
