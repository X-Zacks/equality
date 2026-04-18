# Equality 工具体系补强规划

> 基于 Hermes Agent 源码扫描 + Equality 现有实现分析  
> 日期：2026-04-18  
> **定位修正**：Equality 是**办公智能体**（Office AI Agent），覆盖软件开发、文档处理、数据分析、浏览器操作、IoT 控制等全场景，而非仅限于开发者工具。

---

## 一、定位对比

| 维度 | Hermes | Equality | 差距方向 |
|------|--------|----------|---------|
| 产品形态 | Python CLI + 14 网关（Telegram/Discord/…） | Tauri 桌面应用（未来可扩展 Web/CLI） | 桌面优势 |
| 核心用户 | DevOps/研究者/IoT 玩家 | **办公全场景用户**：开发、运营、管理、创意 | 覆盖面更广 |
| 工具设计哲学 | 每个子操作独立工具（browser 拆 10 个） | 单工具多 action（browser 合 1 个） | Equality 更紧凑 |
| 基础设施 | 20+ 独立模块，深度防御 | 7 层安全，但精细程度不足 | 需补强 |

---

## 二、工具补强清单

### Phase Y1 — 立即实施（低成本高收益）

#### Y1.1 `todo` — 结构化任务列表 🆕

**为什么需要**：办公场景下的任务分解和进度跟踪是高频需求。Hermes 的 todo 工具在上下文压缩后能自动恢复，防止长对话中任务丢失。

**Equality 改进方案**（不照搬 Hermes）：
- Hermes：纯内存 JSON 列表，仅会话级
- **Equality**：绑定 Session 持久化（SQLite），跨会话保留；关联 `purpose`（会话目标）系统
- 操作：`write`（替换/合并）、`read`、`clear`
- 状态：`pending` | `in_progress` | `completed` | `blocked`
- 上下文压缩后自动注入当前 todo 列表到 System Prompt
- 前端展示：Chat 侧边栏显示当前任务进度条

```typescript
// 核心数据结构
interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  createdAt: number
}
```

**实现文件**：
- `packages/core/src/tools/builtins/todo.ts` — 工具实现
- `packages/core/src/session/types.ts` — 扩展 SessionState 加 `todos` 字段
- `packages/desktop/src/Chat.tsx` — 侧边栏任务面板

---

#### Y1.2 `memory` 工具增强 — 补全 delete/list

**为什么需要**：当前 Equality 只有 `memory_save` + `memory_search`，用户无法管理已有记忆。MemoryTab UI 有管理界面，但 Agent 自身不能程序化清理记忆。

**改进方案**：合并为单一 `memory` 工具，通过 `action` 参数分发

```typescript
// 参数
{
  action: 'save' | 'search' | 'list' | 'delete',
  content?: string,    // save 时必需
  query?: string,      // search 时必需
  id?: string,         // delete 时必需
  category?: string,   // 可选分类
}
```

> Hermes 用双存储（MEMORY.md + PREFS.md），但 Equality 已有 Embedding 混合搜索 + SQLite，更优，不需照搬。

---

#### Y1.3 `read_image` 扩展 — 支持 URL 图像分析

**当前状况**：`read_image` 仅处理本地文件路径（用户附件）
**改进**：增加 `url` 参数，自动下载图片后调用 Vision LLM 分析

```typescript
// 参数扩展
{
  path?: string,     // 本地文件（现有）
  url?: string,      // 新增：URL 图像
  prompt?: string,   // 分析提示词
}
```

**安全**：复用现有 SSRF 检测（阻止 localhost/内网地址）

---

#### Y1.4 `web_crawl` — 深度网页爬取

**当前状况**：`web_fetch` 只能单页
**改进方案**：不依赖 Firecrawl（需 API key），利用现有 `browser` 工具 + 递归逻辑

```typescript
// 实现思路
{
  action: 'crawl',
  url: string,
  maxPages?: number,   // 默认 10，防止爬取失控
  urlPattern?: string, // 正则过滤 URL
  extractRule?: string // 提取规则（LLM 辅助）
}
```

**Equality 优势**：已有 Playwright browser 工具，可直接复用页面导航 + 内容提取，无需额外依赖。

---

### Phase Y2 — 浏览器增强

#### Y2.1 `browser` 工具增强 — Accessibility Tree 模式

**Hermes 做法**：`browser_snapshot` 返回 ariaSnapshot 文本表示（@e1, @e2 引用），不需要视觉模型
**Equality 现状**：`browser` 已有 `snapshot` action，但实现是截图 + 视觉分析

**改进方案**：`snapshot` action 增加 `mode` 参数
```typescript
{
  action: 'snapshot',
  mode: 'visual' | 'aria',  // 默认 visual（截图），aria 模式返回文本树
}
```

**收益**：aria 模式不消耗 Vision Token，对简单网页操作（填表单、点按钮）更快更省。

---

#### Y2.2 `browser` 扩展动作

Equality 的 browser 已支持：`navigate/screenshot/snapshot/act/console/tabs/open/focus/close`

对比 Hermes 的 10 个独立工具，Equality 缺少的功能：
- `get_images` — 提取页面所有图片链接（办公场景：批量下载图片）
- `wait` — 等待元素出现（动态页面）

**改进**：在现有 `browser` 工具中增加 `get_images` 和 `wait` action，而非拆成独立工具。

---

### Phase Y3 — 媒体能力

#### Y3.1 `image_generate` — AI 文生图 🆕

**办公场景**：PPT 配图、报告插图、社交媒体图片生成

**Equality 实现方案**（比 Hermes 更灵活）：
- Hermes：仅 FAL.ai FLUX 2 Pro（需 FAL_KEY）
- **Equality**：多 Provider 支持，优先利用现有 LLM Provider 的图像能力

```typescript
// Provider 优先级
1. DALL-E 3 (OpenAI API / Copilot 免费)  ← 零额外成本
2. FAL.ai FLUX 2 Pro (需 FAL_KEY)         ← 高质量
3. Replicate (需 REPLICATE_TOKEN)          ← 备选
```

**桌面优势**：生成的图片直接在 Chat 中内联显示；支持保存到本地目录

```typescript
{
  prompt: string,
  aspectRatio?: 'landscape' | 'square' | 'portrait',  // 默认 landscape
  quality?: 'standard' | 'hd',                         // 仅 DALL-E
  saveTo?: string,                                      // 可选：保存路径
}
```

---

#### Y3.2 `text_to_speech` — 文字转语音 🆕

**办公场景**：文档朗读、会议摘要播报、外语翻译发音

**Equality 实现方案**（桌面专属优势）：
- Hermes：输出音频文件（CLI 无法直接播放）
- **Equality**：Tauri 桌面端**直接播放音频**，无需文件中转

```typescript
// Provider 优先级
1. Edge TTS (免费，无需 API key)     ← 默认
2. OpenAI TTS (gpt-4o-mini-tts)     ← 高质量
3. 本地 piper-tts (离线)            ← 无网络场景

// 参数
{
  text: string,
  voice?: string,       // 默认中文女声
  speed?: number,       // 0.5-2.0
  saveTo?: string,      // 可选保存路径
  autoPlay?: boolean,   // 默认 true（桌面端直接播放）
}
```

**实现**：Edge TTS 是 npm 包 `edge-tts`，纯 HTTP 协议，零依赖。

---

#### Y3.3 `transcription` — 语音转文字 🆕

**办公场景**：会议录音转文字、语音输入

**Equality 实现方案**：
- Hermes：faster-whisper(本地)/Groq/OpenAI
- **Equality**：利用 Tauri 桌面端麦克风权限 + Whisper API

```typescript
// Provider 优先级
1. Groq Whisper (免费 tier, 超快)    ← 默认
2. OpenAI Whisper                    ← 高质量
3. 本地 whisper.cpp (离线)           ← 隐私场景

// 参数
{
  filePath?: string,   // 音频文件路径
  // 或由前端录音按钮直接传入 base64
}
```

**前端**：Chat 输入框旁增加🎤麦克风按钮，长按录音，松开发送。

---

### Phase Z1 — 基础设施补强

#### Z1.1 Checkpoint 文件快照回滚

**Hermes 做法**：Shadow git 仓库（`~/.hermes/checkpoints/`），每次写文件前自动 `git add + commit`
**为什么需要**：Agent 写错文件时用户能一键回滚，比 Diff 预览更强的安全网

**Equality 改进方案**：
- 不用 shadow git（Windows 下 git 性能差，且项目内通常已有 .git）
- **用 `.equality-bak` 后缀文件**：写文件前自动备份原文件到同目录
- 提供 `undo` API：`POST /undo` 恢复最近一次文件操作
- 前端：Diff 预览中增加「撤销」按钮

```typescript
// 实现位置
packages/core/src/tools/builtins/write-file.ts
packages/core/src/tools/builtins/edit-file.ts
// 写入前：fs.copyFile(path, `${path}.equality-bak`)
// undo API：fs.rename(`${path}.equality-bak`, path)
```

---

#### Z1.2 工具输出预算分层

**Hermes 三层防御**：
1. 工具内截断（每个工具自己的 maxOutput）
2. 单结果溢出存文件（>100K 存到 /tmp 并给 LLM 文件路径）
3. 单轮聚合预算（所有工具结果总和 >200K 时溢出最大的）

**Equality 现状**：只有第 1 层（各工具自行截断）

**改进方案**：
```typescript
// packages/core/src/tools/output-budget.ts
const SINGLE_RESULT_MAX = 100_000   // 单结果阈值
const TURN_BUDGET = 200_000          // 单轮总预算
const PREVIEW_SIZE = 1_500           // 溢出后的预览字符数

function maybePersistResult(toolName: string, content: string): string {
  if (content.length <= SINGLE_RESULT_MAX) return content
  const filePath = saveTempFile(content) // 存到 %TEMP%/equality-results/
  return `${content.slice(0, PREVIEW_SIZE)}\n\n[完整输出已保存到 ${filePath}，使用 read_file 查看]`
}
```

---

#### Z1.3 危险命令审批增强

**Hermes 做法**：正则检测 + LLM 自动审批低风险 + 持久化白名单
**Equality 现状**：有变更分类（读/写/执行），高风险需用户确认

**改进方案**：
- 增加**命令级白名单**持久化（`%APPDATA%/Equality/approved-commands.json`）
- 用户确认过的命令模式自动加入白名单，后续不再弹窗
- 命令模式匹配而非精确匹配：`npm install *` → 一次批准永久生效

---

#### Z1.4 同形字攻击检测

**Hermes 的 Tirith**：检测 Unicode 同形字（`е` ≠ `e`，`ℯ` ≠ `e`）防止命令注入
**Equality**：当前 14 种 Prompt Injection 模式中未包含此项

**改进**：在 bash 工具执行前增加同形字检测
```typescript
function hasHomoglyphs(text: string): boolean {
  // 检测 Cyrillic/Greek 字母混入 Latin 命令
  return /[\u0400-\u04FF\u0370-\u03FF\u2100-\u214F]/.test(text)
}
```

---

### Phase Z2 — 协作与集成

#### Z2.1 MCP 集成框架 🆕

**为什么必须做**：MCP 是 2025-2026 年 AI Agent 工具生态的事实标准。一旦支持 MCP，Equality 可即时接入：
- Filesystem MCP Server
- GitHub MCP Server
- Slack/Notion/Linear MCP Server
- 数据库 MCP Server（PostgreSQL/MySQL）
- 以及社区 200+ 个 MCP 工具

**Equality 实现方案**：
```typescript
// Settings → 工具 Tab 增加 MCP 配置区
// 配置格式
{
  "mcp_servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." }
    },
    "notion": {
      "url": "https://mcp.notion.so/v1",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

**实现文件**：
- `packages/core/src/mcp/client.ts` — MCP 客户端（stdio + HTTP 传输）
- `packages/core/src/mcp/registry.ts` — 动态工具注册到 catalog
- Settings UI — MCP 服务器管理界面

---

#### Z2.2 `ask_user` — 结构化用户澄清 🆕

**当前状况**：Equality 有 InteractivePayload（按钮/下拉），但需要模型构造 XML 标签才能触发
**Hermes 做法**：`clarify` 是一个专用工具，模型直接调用

**改进**：创建 `ask_user` 工具，内部生成 InteractivePayload
```typescript
{
  question: string,
  choices?: string[],  // 最多 4 个选项（可选）
}
// 返回值：用户选择的答案
```

**优势**：模型更容易触发用户交互，而非猜测用户意图。

---

#### Z2.3 Home Assistant 集成

**办公场景**：智能会议室控制（灯光/空调/投影）、办公环境自动化

**实现方案**：作为 Skill 或 MCP Server 接入（而非内置工具）
- 优先通过 MCP：社区已有 HA MCP Server
- 备选：内置 4 个 HA 工具（与 Hermes 对齐）

---

### Phase Z3 — 高级能力

#### Z3.1 `execute_code` — 隔离代码执行 🆕

**Hermes 做法**：Python 脚本通过 UDS RPC 调用 7 个核心工具，中间结果不进入上下文
**办公场景**：复杂数据处理（Excel 批处理）、批量文件操作

**Equality 改进方案**：
- 不限于 Python：支持 Node.js 脚本（Equality 是 Node.js 技术栈）
- 通过 `bash` 工具执行，但输出不回填到主对话上下文
- 设定执行超时和工具调用次数限制

---

#### Z3.2 `send_message` — 统一通知工具

**当前状况**：wechat-push/dingtalk 是 Skill
**改进**：提升为内置工具，统一接口

```typescript
{
  platform: 'wechat' | 'dingtalk' | 'email' | 'webhook',
  target: string,     // 群组 ID / 邮箱 / Webhook URL
  message: string,
  attachments?: string[],
}
```

---

## 三、实施路线图

```
Phase Y1（第 1 周）— 立即可做，成本最低
  ├── Y1.1 todo 工具                 ~150 行  ½天
  ├── Y1.2 memory 增强(delete/list)  ~80 行   ½天
  ├── Y1.3 read_image URL 扩展       ~50 行   2小时
  └── Y1.4 web_crawl                 ~120 行  ½天

Phase Y2（第 2 周）— 浏览器增强
  ├── Y2.1 browser aria snapshot     ~80 行   ½天
  └── Y2.2 browser get_images/wait   ~60 行   2小时

Phase Y3（第 2-3 周）— 媒体能力
  ├── Y3.1 image_generate (DALL-E)   ~200 行  1天
  ├── Y3.2 text_to_speech (Edge TTS) ~180 行  1天
  └── Y3.3 transcription (Groq)      ~150 行  ½天

Phase Z1（第 3-4 周）— 基础设施
  ├── Z1.1 Checkpoint 文件回滚       ~100 行  ½天
  ├── Z1.2 工具输出预算分层          ~120 行  ½天
  ├── Z1.3 危险命令白名单            ~80 行   2小时
  └── Z1.4 同形字攻击检测            ~30 行   1小时

Phase Z2（第 4-5 周）— 协作集成
  ├── Z2.1 MCP 集成框架              ~500 行  2天
  ├── Z2.2 ask_user 工具             ~100 行  ½天
  └── Z2.3 HA 通过 MCP 接入          配置即可

Phase Z3（长期）
  ├── Z3.1 execute_code 隔离执行     ~300 行  1天
  └── Z3.2 send_message 统一通知     ~150 行  ½天
```

---

## 四、实施后工具数对比

| 阶段 | Equality 工具数 | 说明 |
|------|---------------|------|
| 当前 | 33 | — |
| Phase Y 完成 | 39 | +todo, +web_crawl, +image_generate, +tts, +transcription, memory 增强 |
| Phase Z 完成 | 42 + N | +ask_user, +execute_code, +send_message, +MCP 动态工具(N个) |
| **最终** | **42 内置 + 无限 MCP** | MCP 接入后工具数不再是瓶颈 |

---

## 五、Equality 相对 Hermes 的持续优势

即使补齐以上差距，Equality 仍保持以下 Hermes 永远无法复制的优势：

| 能力 | 说明 |
|------|------|
| **LSP 代码智能** (4 个工具) | go-to-definition / references / hover / diagnostics — Hermes 仅有 terminal grep |
| **Diff 预览 + 用户确认** | 写文件前可视化差异 + 接受/拒绝 — Hermes 直接写入 |
| **Cost Ledger 三级汇总** | 按调用/会话/全局追踪费用 — Hermes 仅有 usage_pricing 估算 |
| **智能路由 Light/Standard/Heavy** | 自动选模型 + `@model` 强制指定 + 多 Key 轮换 — Hermes 仅关键词启发式 |
| **桌面原生体验** | Tauri 25MB 安装包 + 系统托盘 + 主题 + 缩放 — Hermes 纯 CLI |
| **Identifier Shield 上下文压缩** | 代码标识符保护不被摘要丢失 — Hermes 无此机制 |
| **Skill 自动沉淀** | 复杂任务完成后自动提议保存 — Hermes 需手动 |
| **7 层安全 + 14 种注入检测** | 最完善的安全管道 — Hermes 6 层 |

---

## 六、总结

本规划将 Equality 从 **33 个工具** 提升到 **42+ 内置 + MCP 无限扩展**，在以下关键维度追平或超越 Hermes：

- ✅ 办公全场景覆盖（文生图、语音、任务管理、IoT）
- ✅ 基础设施防御深度（Checkpoint、输出预算、同形字检测）
- ✅ 生态扩展能力（MCP 集成后不再受限于内置工具数）
- ✅ 保持 Equality 独有优势（LSP、桌面 UI、Cost Ledger、Diff 预览、智能路由）
