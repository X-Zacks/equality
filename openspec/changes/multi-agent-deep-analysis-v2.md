# Equality 多角色协作 + 竞品差距 + claw-code 借鉴 — 深度分析报告

> 分析日期：2026-04-07
> 上下文：基于 `multi-agent-capability-analysis.md` 的后续深化

---

## 一、Supervisor 对话流与界面可观测性

### 1.1 Supervisor 是否负责跟用户对话？

**推荐：是的，Supervisor 就是用户的主对话窗口。**

```
用户 ←→ Supervisor Agent（主对话，常驻）
              │
              ├─ 需求澄清阶段：Supervisor 直接与用户对话
              ├─ 派发阶段：Supervisor 调 subagent_spawn
              ├─ 监控阶段：Supervisor 轮询子任务 + 向用户汇报进度
              └─ 完成阶段：Supervisor 汇总报告给用户
```

**为什么不让用户直接跟每个角色 Agent 对话？**

| 方案 | 问题 |
|------|------|
| 用户直接切角色 | 用户需要理解内部分工，心智负担重 |
| 每个角色单独对话窗 | 用户需在 5 个窗口间切换，且无全局视角 |
| **Supervisor 代理** | 用户只跟一个人说话，其他角色在后台自动运行 ✅ |

Supervisor 的行为模式：

```
用户: "帮我开发一个 XX 系统"
Supervisor: "好的，我来帮你规划。先确认几个问题：1. 工程目录？2. 技术栈？..."
用户: "目录 D:\projects\xx，用 TypeScript + React"
Supervisor: "明白了。我现在开始分配任务：
  📐 架构师正在设计系统架构...
  （后台 spawn Architect Agent）"
...（过一会儿）
Supervisor: "✅ 架构设计完成。概要：[摘要]
  📝 开发者和测试者已开始并行工作...
  （后台 spawn Developer + Tester）"
...
Supervisor: "⚠️ 测试发现 2 个 bug，已通知开发者修复...
  📊 当前进度：Phase 2/5，开发 75%，测试 60%"
```

### 1.2 界面：子 Agent 对话的可观测性

**当前 UI 现状：**
- `SessionPanel.tsx` — 扁平的会话列表（按日期分组：今天/昨天/最近7天）
- 每个 session 是独立的 `SessionItem { key, title, messageCount }`
- 无父子关系概念
- 子 Agent 的 session key 格式：`{parentKey}::sub::{taskId}` — **已有层级信息，但 UI 未展示**

**需要的改造：**

```
SessionPanel（改造后）
├─ 📋 帮我开发 XX 系统 ← Supervisor 对话（主线程）
│   ├─ 📐 [架构] 系统架构设计 ← 子 Agent 对话（可展开查看）
│   ├─ 💻 [开发] Phase 1 实现 ← 子 Agent 对话
│   │   └─ 🔧 [子任务] 修复 auth 模块 ← 孙子任务（depth=2）
│   ├─ 🧪 [测试] Phase 1 测试 ← 子 Agent 对话
│   └─ 📝 [审查] 代码审查 ← 子 Agent 对话
├─ 💬 日常闲聊 ← 普通对话
└─ 🐛 修复登录 bug ← 普通对话
```

**具体 UI 改造点：**

| 改造 | 位置 | 工作量 |
|------|------|--------|
| session key 解析父子关系 | `SessionPanel.tsx` — 解析 `::sub::` | ~30 行 |
| 树形渲染 | `SessionPanel.tsx` — 缩进 + 展开/折叠 | ~80 行 |
| 角色图标/标签 | `SessionPanel.tsx` — 根据 agent ID 显示角色 | ~20 行 |
| 子对话状态指示 | 运行中🔄 / 完成✅ / 失败❌ | ~40 行 |
| 点击子对话可查看详情 | 复用现有 `Chat.tsx` + 只读模式 | ~30 行 |
| 进度条 | Supervisor 对话顶部显示整体进度 | ~50 行 |

**后端 API 改造：**

| API | 改动 |
|-----|------|
| `GET /sessions` | 返回新增 `parentSessionKey?` 字段（从 key 中解析） |
| `GET /tasks` （新增） | 返回 TaskRegistry 中所有任务的树状结构 |
| `GET /tasks/:id/status` （新增） | 返回单个任务的实时状态 |
| WebSocket `task:progress` 事件 | 推送子任务状态变化到前端 |

---

## 二、Equality vs Cursor / Copilot / Claude Code — 开发能力差距

### 2.1 差距矩阵

| 能力维度 | Cursor | Copilot (Agent) | Claude Code | **Equality** | 差距 |
|----------|--------|-----------------|-------------|-------------|------|
| **内嵌 IDE** | ✅ 自带 VSCode fork | ✅ VSCode 扩展 | ❌ 纯终端 | ✅ 桌面 App（但非 IDE） | 🟡 |
| **代码索引** | ✅ 全项目 embedding | ✅ 全项目索引 | ✅ CLAUDE.md + 文件搜索 | 🟡 grep/glob + memory | 🔴 |
| **LSP 集成** | ✅ 原生 | ✅ 原生 | ❌ 无 | 🟡 有工具但未集成 runtime | 🟡 |
| **多文件编辑** | ✅ Composer/Apply | ✅ Agent 模式 | ✅ bash+文件工具 | ✅ write_file+edit_file | 🟢 |
| **终端执行** | ✅ 集成终端 | ✅ Agent 终端 | ✅ bash 工具 | ✅ bash 工具 | 🟢 |
| **Git 操作** | ✅ 内嵌 | ✅ 内嵌 | ✅ bash | ✅ bash | 🟢 |
| **自动修复** | ✅ lint fix | ✅ /fix 命令 | ✅ 编译错误重试 | ✅ 编译错误重试 | 🟢 |
| **Context 管理** | ✅ @file/@codebase | ✅ #file | ✅ compaction | ✅ compaction+memory | 🟢 |
| **多 Agent** | ❌ | ❌ | ❌（但有 subagent） | ✅ SubagentManager | 🟢 独有 |
| **任务编排** | ❌ | ❌ | ❌ | 🟡 TaskRegistry（需 DAG） | 🟡 独有 |
| **跨 session 记忆** | 🟡 .cursorrules | 🟡 .github/copilot | ✅ CLAUDE.md 约定 | ✅ memory_save/search | 🟢 |
| **Diff 预览** | ✅ inline diff | ✅ inline diff | ❌ 纯文本 | ❌ 纯文本 | 🔴 |
| **文件树浏览** | ✅ IDE 原生 | ✅ IDE 原生 | ❌ | ❌ | 🔴 |
| **Apply 智能合并** | ✅ speculative edit | ✅ Agent apply | ✅ apply_patch | ✅ apply_patch | 🟢 |
| **Web 搜索** | ✅ @web | ❌ | ❌ | ✅ web_search | 🟢 独有 |
| **MCP** | ❌ | ✅ | ✅ | 🟡 类型定义已有 | 🟡 |
| **计费/用量** | ✅ 订阅制 | ✅ 订阅制 | ✅ API 计费 | ✅ 费用追踪 ledger | 🟢 |
| **并行编辑** | ✅ Cursor Background | ❌ | ❌ | ❌ 子 Agent 串行 | 🔴 |

### 2.2 关键差距分析

#### 🔴 差距 1：代码索引与语义搜索

**Cursor/Copilot 做法**：启动时对整个项目建立 embedding 索引，用户 @codebase 时做向量检索。

**Equality 现状**：只有 `grep`、`glob`、`read_file`。Agent 找代码靠猜+搜索，大项目中经常遗漏。

**影响**：这是**开发大型软件最大的瓶颈**。Equality 在 800+ 文件的项目中效率会显著下降。

**补齐方案**：
- Phase K2 已有 `memory/embeddings.ts`（SimpleEmbeddingProvider）
- 需要：项目文件索引器（启动时扫描 → 增量更新）+ `codebase_search` 工具

#### 🔴 差距 2：Diff 预览

**Cursor 做法**：write_file 前先展示 inline diff，用户可以 accept/reject 每个 hunk。

**Equality 现状**：直接写文件，用户看到的是 tool_result 中的"已写入 xxx.ts"文本。

**影响**：用户无法在写入前审查变更，信任度低。

**补齐方案**：前端 `Chat.tsx` 中检测 write_file/edit_file 的 tool args，渲染 Monaco diff 视图。

#### 🔴 差距 3：并行编辑（Background Agent）

**Cursor 做法**：Background Agent 在后台执行长任务，用户可以继续在 foreground 对话。

**Equality 现状**：SubagentManager.spawn() 是 await 的，主对话会等子任务完成。

**影响**：无法边聊天边让 Agent 后台干活。

**补齐方案**：`spawnParallel()` + 前端进度面板。

#### 🟡 差距 4：文件树浏览

**Cursor/Copilot 做法**：IDE 原生文件树，可以直接拖入文件给 Agent。

**Equality 现状**：无文件树。用户只能手动输入文件路径或靠 Agent 自己 list_dir。

**补齐方案**：桌面端左侧增加文件浏览器面板（Tauri 可读取文件系统）。

---

## 三、claw-code-main 借鉴分析

### 3.1 项目定位

claw-code-main 是 Claude Code 泄露源码的 **Python 清净室重写**（clean-room rewrite）。它不是一个可运行的 Agent，而是一个**架构还原 + 元数据镜像**项目。

### 3.2 值得借鉴的设计模式

| 模式 | claw-code 实现 | Equality 可借鉴 |
|------|---------------|----------------|
| **PortManifest** | `port_manifest.py` — 枚举所有模块 + 迁移状态 | 可用于 Equality 自身健康检查：列出所有模块 + 测试覆盖状态 |
| **ParityAudit** | `parity_audit.py` — 自动对比 TS 原版和 Python 版的模块覆盖率 | 可用于对比 Equality vs OpenClaw 的功能覆盖率（自动化 GAP 检测） |
| **ExecutionRegistry** | `execution_registry.py` — 命令和工具的统一注册 + 执行 | Equality 已有 `ToolRegistry`，但缺少 command 层面的统一 |
| **ToolPool** | `tool_pool.py` — 按 simple_mode/include_mcp/permission 动态组装工具集 | Equality 的 `ToolCatalog` + `ToolProfilePolicy` 已覆盖 |
| **BootstrapGraph** | `bootstrap_graph.py` — 启动阶段可视化 | Equality 启动流程不透明，可加启动阶段日志 |
| **ToolPermissionContext** | `permissions.py` — deny_names + deny_prefixes 黑名单 | Equality 有 `deny` 但未实现 prefix 匹配 |
| **TranscriptStore** | `transcript.py` — compact(keep_last) + replay + flush | Equality 的 session persist 类似，但无 compact(keep_last) |
| **RuntimeSession** | `runtime.py` — 完整的 session 上下文快照 | Equality 的 session store 是零散的，可借鉴结构化快照 |
| **DirectModes** | `direct_modes.py` — remote/ssh/teleport/direct-connect 模式 | Equality 无远程连接模式，但 Tauri 桌面可用 SSH 工具 |

### 3.3 claw-code 中 OmX 的 `$team` 和 `$ralph` 模式

README 中提到了 [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) 的两种模式：

| 模式 | 功能 | 对应 Equality |
|------|------|--------------|
| **`$team`** | 并行代码审查 + 架构反馈 | → 我们的 Reviewer Agent + 并行 spawn |
| **`$ralph`** | 持久执行循环 + 架构师级验证 | → 我们的 Supervisor Agent + 自动续接 |

**关键洞察**：OmX 证明了"多角色协作"模式在实际大型项目中是有效的。claw-code 的整个 Python 重写就是用这种模式完成的。

### 3.4 不值得借鉴的部分

- **reference_data 快照**：静态 JSON 镜像，不是动态运行时
- **Mirrored 命令/工具**：只是元数据 stub，无实际执行逻辑
- **大量空 `__init__.py`**：目录占位符，无实质内容
- **Python 选型**：Equality 是 TypeScript 生态，Python 重写无意义

---

## 四、综合改造优先级

结合三个维度（多角色协作、竞品差距、claw-code 借鉴），排出统一优先级：

### P0 — 必做（直接影响"Equality 自我迭代"能力）

| # | 改造项 | 来源 | 工作量 |
|---|--------|------|--------|
| 1 | **Plan DAG 编排器** | 多角色协作 | ~400 行 |
| 2 | **并行子 Agent + depth=2** | 多角色协作 + Background Agent 差距 | ~250 行 |
| 3 | **代码索引 + codebase_search 工具** | 竞品差距 | ~500 行 |
| 4 | **Session 树形 UI** | 界面可观测性 | ~250 行（前端） |

### P1 — 重要（提升开发体验）

| # | 改造项 | 来源 | 工作量 |
|---|--------|------|--------|
| 5 | **Diff 预览** | 竞品差距 | ~300 行（前端） |
| 6 | **Supervisor Skill** | 多角色协作 | ~200 行（Markdown） |
| 7 | **任务进度 API + WebSocket 推送** | 界面可观测性 | ~200 行 |
| 8 | **Parity Audit 自动化** | claw-code 借鉴 | ~150 行 |

### P2 — 增强（锦上添花）

| # | 改造项 | 来源 | 工作量 |
|---|--------|------|--------|
| 9 | 文件树浏览器 | 竞品差距 | ~400 行（前端） |
| 10 | 角色 Agent 配置模板 | 多角色协作 | ~100 行 |
| 11 | Bootstrap 阶段日志 | claw-code 借鉴 | ~80 行 |
| 12 | deny_prefix 工具黑名单 | claw-code 借鉴 | ~30 行 |

---

## 五、回答你的三个问题

### Q1：Supervisor 会负责跟用户对话澄清需求吗？

**是的。** Supervisor 是用户唯一的对话入口。它自己做需求澄清（复用 project-dev-workflow 的阶段 1 逻辑），然后把确认后的需求分派给各角色 Agent。用户不需要知道内部有多少个 Agent 在工作。

### Q2：子 Agent 任务会在界面新建对话吗？

**会的，但需要 UI 改造。** 目前：
- 后端已支持：子 Agent 的 session key 包含 `::sub::` 分隔符，天然有层级关系
- 前端未支持：`SessionPanel.tsx` 只做扁平列表，不识别父子关系

改造后的体验：
```
侧边栏
├─ 📋 XX 系统开发（正在进行 3/5）    ← Supervisor 对话
│   ├─ 📐 架构设计 ✅ 已完成           ← 可点击查看 Architect 对话记录
│   ├─ 💻 Phase 2 开发 🔄 进行中       ← 可点击查看 Developer 实时输出
│   ├─ 🧪 Phase 1 测试 ✅ 通过         ← 可点击查看测试结果
│   └─ 📝 待审查                       ← 灰色，等待中
├─ 💬 其他对话...
```

每个子 Agent 的对话**可查看但不可干预**（干预通过 Supervisor 的 steer 机制）。

### Q3：Equality 在开发方面比 Cursor/Copilot/Claude Code 还差在哪？

详见第二节矩阵。**关键差距 3 个**：

| 差距 | 影响程度 | 补齐难度 |
|------|----------|----------|
| 🔴 代码索引/语义搜索 | **致命** — 大项目找不到相关代码 | 中等（~500 行） |
| 🔴 Diff 预览 | **重要** — 用户不信任盲写 | 中等（~300 行前端） |
| 🔴 并行后台执行 | **重要** — 长任务阻塞对话 | 较低（~250 行） |

**但 Equality 有 3 个竞品都没有的独有优势**：

| 独有优势 | 说明 |
|----------|------|
| **多 Agent 编排** | Cursor/Copilot/Claude Code 都没有子 Agent + 任务注册中心 |
| **跨 session 记忆** | memory_save/search 比 .cursorrules 更结构化 |
| **伪执行文本检测** | 防止 Agent 虚构"已修改文件"的独有 guard |

---

## 六、下一步行动建议

```
Phase N1: Plan DAG 编排器 (orchestration/)        ← 最核心
Phase N2: 并行子 Agent + depth=2                   ← 解锁多角色
Phase N3: Session 树形 UI + 进度推送               ← 可观测性
Phase N4: 代码索引 + codebase_search               ← 弥补最大竞品差距
Phase N5: Supervisor Skill + 角色配置               ← 串联全流程
Phase N6: Diff 预览                                ← 体验提升
```

总工作量：~2500 行新代码 + ~500 行前端改造，预计 5-6 sessions。

完成后 Equality 将具备：
1. ✅ 多角色自动化软件开发
2. ✅ 树状对话可观测性
3. ✅ 代码索引能力接近 Cursor
4. ✅ 可以稳定地用自己迭代自己

---

*本报告由 Equality 分析自身代码库、竞品及 claw-code-main 后生成。*
