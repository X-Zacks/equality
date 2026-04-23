# cc-haha vs Equality 深度对比分析

> 分析日期：2026-04-23  
> 基于：cc-haha 全部源码 + Equality openspec 全部 389 个 MD 文件（11 领域 spec + 25+ Phase 变更设计 + 467 项断言 + Phase J-W 规划）

---

## 〇、定位差异：写代码 vs 做任务

**cc-haha 是 Coding Agent**——围绕 `IDE → 代码仓库 → Git → PR` 的开发工作流设计。50+ 工具中超过一半是代码编辑专属（`FileEditTool` diff patch、`LSPTool`、`NotebookEditTool`、`ReviewArtifactTool`、`SubscribePRTool`、Worktree 管理），100+ Slash 命令中大量面向开发场景。

**Equality 是通用桌面 AI 助理**——DESIGN_PHILOSOPHY.md 定义其为"感知→记忆→思考→行动→表达"的闭环 Agent 系统。面向中国大陆 Windows 用户的日常工作场景，覆盖文件操作、Shell、网页搜索、图像/PDF/音频理解、通用开发辅助。

**但**——Equality 的设计野心远不止"简单助理"。从 Phase A 到 Phase W 的完整路线图来看，它的目标是一个**具备自我进化能力的多角色编排引擎**，涵盖：
- 多 Agent DAG 编排（Phase N — PlanDAG + PlanExecutor + 5 种角色）
- 自我进化闭环（Phase O — 冻结记忆 + 上下文压缩 + Skill 自动沉淀 + 会话搜索）
- 模型自适应护栏（Phase S — 三层证据校验架构）
- 插件 SDK（Phase K — provider/tool/hook 三类插件）
- 代码索引（Phase N — CodeIndexer 增量扫描 + 向量检索）

---

## 一、架构级对比

| 维度 | cc-haha | Equality | 深度点评 |
|------|---------|----------|---------|
| 进程模型 | CLI 独立 + Server 可选 | Tauri 壳 → Gateway 子进程（一体） | Equality 更简洁但不支持 headless；cc-haha 支持 `--print` CI 场景 |
| 前后端通信 | HTTP + WebSocket | HTTP + SSE（WebSocket 在路线图中） | SSE 足够流式场景；Phase N 新增 WS task:progress 推送 |
| 状态管理 | 自研 createStore (30行) + Desktop 17 个 Store | Gateway 内存 Session + React 前端状态 | Equality 用 per-Session Promise 队列做并发控制，更严谨 |
| 编译期优化 | `bun:bundle` feature() DCE | 无 | cc-haha 通过编译期特性裁剪控制包体积，Equality 全运行时 |
| 启动序列 | `cli.tsx` → `main.tsx` (~4700行) | 9 步 Gateway 启动序列（spec 明确定义每步失败行为） | Equality 的启动序列有 spec 约束，每步失败都有明确处理；cc-haha 靠代码约定 |

---

## 二、核心引擎深度对比

### 2.1 对话循环与工具执行

| | cc-haha | Equality |
|-|---------|----------|
| 核心 | `QueryEngine.ts` (~1300行) 内部 turn loop | `runAttempt()` + toolLoop + Stream Decorator Pipeline |
| Stream 处理 | Ink render 管道 | **5 层纯函数装饰器链**（trimToolCallNames → dropThinkingBlocks → sanitizeToolCallIds → decodeHtmlEntities → costTrace） |
| 自动修复 | 无 | **Phase A：编译错误自动重试**——检测 bash 输出中的编译/测试错误模式，注入修复提示 |
| 伪执行护栏 | 无 | **Phase S/X：Tool Execution Proof Guard**——4 条校验规则（零工具成功宣称 / 无写能力却宣称改文件 / 未调 bash 却输出命令 / 自动纠偏重试） |
| 流式恢复 | 无 | **Session Stream Restore**——每次 tool_result 后立即 persist，切换会话再切回能看到中间状态 |

**Equality 亮点**：
- **Tool Execution Proof Guard** 是 Equality 独有的创新——从框架层面判断"模型是否真的执行了工具"，而不是靠模型自觉。这在使用国内中等模型时尤为关键
- **编译错误自动重试** + **伪执行检测 + 自动纠偏重试**形成双重兜底
- **Stream Decorator Pipeline** 专为多 Provider 差异设计，cc-haha 只适配 Anthropic 一家

### 2.2 工具系统

| | cc-haha | Equality |
|-|---------|----------|
| 工具数量 | 50+（大量编码专属） | ~15 内置 + MCP 扩展（通用场景） |
| 工具注册 | 目录即模块 + `feature()` | 统一注册 + **Phase I：Tool Catalog/Profile** 系统 |
| 循环检测 | 继承官方逻辑 | **4 级自研检测器** + Phase A 滑动窗口优化 |
| 名称容错 | 无 | **4 级匹配策略**（完全匹配→别名→Levenshtein→前缀） |
| 结果截断 | 无 | **400K 上限 + head-tail 策略** |
| Context Guard | 无 | **每次 LLM 调用前检查 token 预算，超出就地移除最旧结果** |
| 策略管道 | 基础权限 | **Phase C/D：7 层工具策略管道**（写操作精确识别 → 路径沙箱 → 策略解析 → 审计日志） |
| MCP 集成 | 原生支持 | Phase D2 设计完成 |

**Equality 亮点**：
- **Tool Catalog/Profile** 按场景定义工具集（minimal/coding/messaging/full），不同 Agent 角色加载不同工具
- **写操作精确识别**（`classifyMutation`）：cc-haha 靠静态工具名列表判断，Equality 动态分析 bash 命令词（`ls -la` → READ，`rm foo` → WRITE）

### 2.3 多 Agent 编排

| | cc-haha | Equality（已实现 + 规划） |
|-|---------|--------------------------|
| 架构 | Coordinator-Worker + Teams | **已实现**：SubagentManager（Phase E）+ **规划**：PlanDAG 编排引擎（Phase N） |
| 任务模型 | 7 种 TaskType | TaskRegistry + 7 种 TaskState + 3 种 Runtime + **Phase N：PlanNode 5 种角色**（supervisor/architect/developer/tester/reviewer） |
| 并行 | Team 并行 | Phase N：DAG 拓扑排序 + maxConcurrent=3 并行调度 |
| 孤儿恢复 | 无 | **Phase H：子 Agent 孤儿恢复**（进程崩溃后自动恢复 lost 任务） |
| 持久化 | 无 | **Phase H：SQLite 任务存储**（node:sqlite） |

**Equality Phase N 的规划**远超 cc-haha 现有实现：
- **PlanDAG** 支持环检测、关键路径计算、级联取消、节点跳过/重试
- **5 种 Agent 角色**（supervisor/architect/developer/tester/reviewer）vs cc-haha 的无角色分工
- **PlanExecutor** 支持 pause/resume/cancel/steerNode 等全生命周期管理

### 2.4 Session 与 Context

| | cc-haha | Equality |
|-|---------|----------|
| Session ID | UUID | **结构化 SessionKey**（`agent:{id}:{channel}:{accountId}:{peerKind}:{peerId}`） |
| 并发控制 | 无 | **per-SessionKey Promise 队列** |
| 孤立消息 | 无 | **自动检测回退** |
| Purpose | 无 | **Session Purpose System**——自动推断会话意图，注入 System Prompt |
| Context Engine | 单一实现 | **可插拔 ContextEngine 接口** + Phase 5 RagContextEngine 规划 |
| 冻结记忆 | 无 | **Phase O：首轮冻结记忆快照**——防止中途 memory_save 导致 prompt 不稳定 |
| 上下文压缩 | 基础 compact | **Compaction spec**（50% 阈值 + 分段并行摘要 + 标识符保护 + 图像保留 3 轮 + 超时保护） |

### 2.5 LLM Provider

| | cc-haha | Equality |
|-|---------|----------|
| 抽象层 | 自定义端点（env 配置） | **统一 LLMProvider 接口** + 5+ 实现（Copilot/Custom/DeepSeek/Qwen/Volc） |
| Fallback | 无 | **分级降级链**（abort→overflow→retry→fallback→all_failed） |
| 意图判断 | 无 | **Phase R：Intent Judge**——可配置独立的轻量模型做意图分类 |
| 配额管理 | 无 | **Phase U：Request Quota**——Copilot 倍率表 + 月度配额 + 自动降级 |
| 费用追踪 | 无 | **CostLedger** SQLite + CNY 费率 + 每日预算 + CSV 导出 |
| API Key | .env 明文 | **Windows DPAPI 加密**（`config.enc`） |

### 2.6 Skills

| | cc-haha | Equality |
|-|---------|----------|
| 基础 | SKILL.md + XML 索引 + 懒加载 | 几乎一致 |
| 安全扫描 | 无 | **8 规则安全扫描**（eval/exec/env-harvesting/crypto-mining 等，critical 直接 block） |
| 自动沉淀 | 无 | **对话→Skill 闭环**（强模型完成 → 固化为 SKILL.md → 弱模型复用 = "技能平权"） |
| 渐进披露 | 全量注入 | **Phase T：Skills 渐进式披露**——非 active 只注入元数据，active 才全文注入 |
| Skill 分类 | 无 | **Phase W：按任务目的分类**（开发/数据处理/文档处理/通信/工作流） |
| PRC 适配 | 无 | 全部内置 Skills 走国内镜像源 |
| Skill Creator | 无 | **Skills V2：内置 skill-creator Skill**——教 Agent 如何创建高质量 Skill |

### 2.7 安全体系

| | cc-haha | Equality |
|-|---------|----------|
| 路径沙箱 | 继承官方 | **path-guard + bash-sandbox + 引号剥离修复 + 全局 toggle** |
| 写操作识别 | 静态工具名 | **动态 classifyMutation**（分析 bash 命令词） |
| 策略管道 | 基础权限 | **7 层工具策略管道**（Phase C/D） |
| 安全审计 | 无 | **GET /security-audit 端点**（实时安全状态） |
| CORS | 自实现 | **白名单 Origin 过滤**（tauri://localhost 等） |
| 证据校验 | 无 | **Tool Execution Proof Guard**（4 规则 + 自动纠偏重试） |
| 模型自适应 | 无 | **Phase S：三层护栏**（Prompt 软约束 → 后置证据校验 → 高风险授权） |

---

## 三、Equality 独有的设计深度

这些是 cc-haha 没有、甚至没有对应概念的设计：

### 3.1 模型自适应工具护栏（Phase S）

> 不压制强模型的自然规划能力，同时为关键断言提供最小护栏。

三层架构：
1. **Prompt 软约束**——告诉模型"没有 tool_result 不要宣称已完成"
2. **后置证据校验**——最终回答生成后检查是否有未经工具核验的事实断言
3. **高风险动作显式授权**——"推到 git 了么？"→ 先检查，不自动 push

这是 cc-haha 完全没有的理念——它假设用 Claude/GPT 等强模型，模型自己会做对。Equality 面向国内中等模型，**必须从框架层面提供可靠性兜底**。

### 3.2 任务感知系统（Task Awareness）

通过 System Prompt 注入 3 条规则：
1. **执行前澄清**——关键信息缺失时先问，但可以用工具查的不问
2. **执行前计划**——≥3 步工具调用时先输出 📋 执行计划
3. **执行后摘要**——≥2 个工具调用后结构化摘要（✅ 做了什么 / 结果 / 注意事项）

设计决策选了"方案 A（System Prompt 追加规则）"而非硬编码 runner 逻辑或额外 LLM 调用，体现了 Equality 的务实风格。

### 3.3 交互式 UI 载荷（Phase F）

Agent 回复中可以嵌入 `:::interactive` 块，包含按钮、下拉选择器等 UI 元素。用户点击后回传 `__interactive_reply__:{actionId}:{value}`。

cc-haha 的 TUI 是纯文本渲染，没有结构化交互能力。

### 3.4 自我进化闭环（Phase O）

```
assemble() → 冻结记忆快照 → 迭代预算压力警告(70%/90%)
toolLoop → Skill 自动沉淀 → session_search 工具（跨会话检索）
afterTurn() → FTS5 索引写入
```

特别是**迭代预算压力警告**——在工具结果中注入"你已使用 70%/90% 预算"，让 LLM 知道该收尾了，而不是硬截断。cc-haha 没有这种预算感知设计。

### 3.5 多角色编排引擎（Phase N）

5 种 Agent 角色 + DAG 图 + 拓扑排序 + 关键路径 + 级联取消 + pause/resume：

```typescript
type AgentRole = 'supervisor' | 'architect' | 'developer' | 'tester' | 'reviewer'
```

这超越了 cc-haha 的 Coordinator-Worker 模式——cc-haha 的 Worker 是同质的，Equality 的角色是异质的（不同角色有不同的工具集和系统提示）。

### 3.6 Config Schema Validation + Migration（Phase L）

自研轻量 validator + 版本迁移框架，类似 SQLite migration 模式。cc-haha 用 .env 文件，无迁移机制。

### 3.7 Chat Commands（Phase Q）

`/status`、`/new`、`/reset`、`/compact`、`/usage`、`/model`、`/help`——不走 LLM，即时返回 <100ms。可通过 `chatCommandRegistry.register()` 扩展。

### 3.8 Process Supervision（Phase L）

命令队列 + 信号量（并发上限 5）+ Windows `taskkill /F /T` kill tree + 定期扫描 stale 进程。桌面单机环境的进程管理，cc-haha 没有对应设计。

---

## 四、cc-haha 值得 Equality 借鉴的设计

### 4.1 CLI / Headless 模式
`--print` 无头模式用于 CI/CD、脚本场景。Equality 只有 GUI 入口。

### 4.2 工具目录结构
每工具一目录（`XxxTool.ts` + `prompt.ts` + `constants.ts` + `toolName.ts`），避免循环依赖。Equality 的 `builtins/` 平铺可能在工具增长后需重构。

### 4.3 IDE Bridge
与 VS Code 双向通信（选中内容→Agent、Agent→打开文件）。Equality 无 IDE 集成。

### 4.4 记忆系统 (memdir)
跨会话持久化记忆。Equality 的 Phase 12 Memory 已有 SQLite+FTS5，Phase K 规划了 embeddings + hybrid search，但 cc-haha 的 memdir 已在生产中运行。

### 4.5 Voice 集成
cc-haha 集成了语音输入（STT）和 voice 关键词检测。Equality 的 Phase M 规划了 TTS + Whisper 转录，但尚未实现。

### 4.6 Daemon 后台模式
Agent 作为守护进程持续运行。Equality 的 Agent 只在用户发消息时触发。

### 4.7 Computer Use
Python helper 控制 macOS/Windows 桌面（截屏、鼠标、键盘）。Equality 无对应能力。

---

## 五、设计哲学总结

| 维度 | cc-haha | Equality |
|------|---------|----------|
| **核心理念** | "让开发者在终端里有个 AI 搭档" | "AI 代理的神经系统——感知→记忆→思考→行动→表达" |
| **信任模型** | 信任 Claude/GPT 强模型的自然能力 | **不信任任何模型**——从框架层面提供证据校验、循环检测、策略管道 |
| **扩展方式** | Skills + MCP（静态） | Skills 自动沉淀 + Plugin SDK + MCP（动态生长） |
| **用户画像** | 英文开发者 | 中国大陆 Windows 用户（中文 i18n、CNY 费率、国内镜像） |
| **复杂度管理** | 4700 行 main.tsx 单文件 | **SDD（Spec-Driven Development）**——389 个 spec MD + 467 项断言 |
| **演进路径** | 社区驱动 feature 堆叠 | **Phase A→W 有序路线图**（可靠性→安全→多 Agent→自我进化） |

**一句话**：cc-haha 把 Claude Code 从云端拉到本地，Equality 在重新思考"桌面 AI Agent 应该是什么样的"。

---

## 六、覆盖矩阵速查

| 能力 | cc-haha | Equality 现状 | Equality 路线图 |
|------|---------|--------------|----------------|
| 基础对话 + 流式 | ✅ | ✅ | — |
| 文件操作工具 | ✅ 50+ | ✅ ~15 | Phase D: MCP 扩展 |
| 工具循环检测 | 继承官方 | ✅ 4 级自研 | Phase A: 滑动窗口 |
| 上下文压缩 | ✅ | ✅ | — |
| 多 Provider | 自定义端点 | ✅ 5+ Provider | — |
| Model Fallback | ❌ | ✅ 降级链 | — |
| 费用追踪 | ❌ | ✅ CostLedger | Phase U: 配额管理 |
| Skills | ✅ | ✅ | Phase T/W: 渐进披露+分类 |
| Skill 安全扫描 | ❌ | ✅ 8 规则 | — |
| Skill 自动沉淀 | ❌ | ✅ | Phase O: 增强 |
| 多 Agent | ✅ Teams | ✅ SubagentManager | Phase N: DAG 编排 |
| 后台任务 | ✅ | ✅ TaskRegistry | Phase H: SQLite |
| 孤儿恢复 | ❌ | ✅ | — |
| 证据校验 | ❌ | ✅ Proof Guard | Phase S: 三层护栏 |
| 交互式 UI | ❌ | Phase F 设计完成 | Phase F |
| Chat Commands | ✅ 100+ Slash | Phase Q 设计完成 | Phase Q |
| IDE Bridge | ✅ VS Code | ❌ | 未规划 |
| CLI/Headless | ✅ --print | ❌ | 未规划 |
| Daemon 后台 | ✅ | ❌ | 未规划 |
| Computer Use | ✅ Python | ❌ | 未规划 |
| Voice | ✅ STT | ❌ | Phase M 规划 |
| TTS | ❌ | ❌ | Phase M 规划 |
| 记忆系统 | ✅ memdir | ✅ SQLite+FTS5 | Phase K: embeddings |
| 插件系统 | ❌ | ❌ | Phase K: Plugin SDK |
| 安全审计 | ❌ | ✅ /security-audit | — |
| 代码索引 | ❌ | ❌ | Phase N: CodeIndexer |
| Config 迁移 | ❌ | ❌ | Phase L: Schema+Migrate |
| 渠道路由 | ✅ TG/飞书 | Spec 完成 | Phase 13 |
| LSP 语义 | ✅ 内置 | Phase B 设计完成 | Phase B |
| 主题系统 | ❌ | ✅ purple/dark | Phase V |
| i18n | ❌ | ✅ zh-CN/en | — |
