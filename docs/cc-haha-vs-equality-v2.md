# cc-haha vs Equality 深度对比分析 V2

> 分析日期：2026-04-23  
> 基于：cc-haha 全部源码 + Equality openspec **全量** MD 文件（11 领域 spec + Phase A-W + Phase X/Y/Z/Z2/Z3/Z4/Z5 + 20+ 独立变更设计）  
> V1→V2 增量：补充 Phase X-Z5 及全部独立变更设计的深度理解

---

## 〇、定位差异：开发工具 vs 认知引擎

**cc-haha 是一个 Coding Agent**——围绕 `IDE → 代码仓库 → Git → PR` 的工作流，50+ 工具中过半是编码专属。

**Equality 正在从"通用桌面 AI 助理"进化为"可编排、可进化、可自适应的认知引擎"**。从 Phase A→Z5 的完整路线图（50+ 个变更设计），展现出四层渐进式架构演进：

```
Layer 4: 自我进化 — Phase O (冻结记忆/budget pressure/skill 自沉淀/session 搜索)
Layer 3: 多角色编排 — Phase N (PlanDAG/5 角色) + Phase E (SubtaskManager) + chat-crew-dual-mode (Crew 模板)
Layer 2: 安全与自适应 — Phase C/S/X/Y (7 层策略管道/3 层证据校验/bash 沙箱增强/SSRF 防护)
Layer 1: 可靠基础 — Phase A/H/L (自动重试/孤儿恢复/SQLite 持久化/config 迁移/进程监管)
```

cc-haha 停留在 Layer 1-2（基础工具 + 基本安全），Equality 的设计覆盖了全部 4 层。

---

## 一、架构级对比

| 维度 | cc-haha | Equality | V2 新洞察 |
|------|---------|----------|----------|
| 进程模型 | CLI + Server | Tauri 壳 → Gateway 子进程 | Equality 从浮窗→标准窗口（standard-window-redesign），UI 成熟度在快速迭代 |
| 前后端通信 | HTTP + WebSocket | HTTP + SSE | **多会话隔离**（multi-session-isolation）：SSE 事件自动注入 sessionKey，每个 Chat 实例独立过滤 |
| 工具并行 | 无 | **agent-loop-pi-improvements**：`Promise.allSettled` 并发执行同一轮多个工具调用 |
| 启动引导 | 无 | **onboarding-guide**：WelcomeGuide 组件 + BOOTSTRAP.md 功能导览 + getting-started Skill |
| 窗口模型 | 终端 TUI / Tauri 窗口 | 从浮窗→标准窗口 + Zoom 50%-200% + 关闭拦截→托盘 |

---

## 二、核心引擎深度对比（V2 增补）

### 2.1 对话循环

| | cc-haha | Equality |
|-|---------|----------|
| 核心 | QueryEngine turn loop | runAttempt + toolLoop + **工具并行执行** |
| Stream 处理 | Ink render | 5 层装饰器 + **MiniMax Thinking 双保险**（reasoning_split API 层分离 + dropThinkingBlocks 装饰器兜底） |
| 暂停/重定向 | 无 | **task-pause-and-redirect**：pauseIntent 状态机，在 tool_result 后干净暂停（不中断当前工具），用户可注入重定向指令 |
| 自动修复 | 无 | Phase A 编译错误自动重试 |
| 伪执行护栏 | 无 | Phase S/X 三层证据校验 + 4 规则 Proof Guard |
| 流式恢复 | 无 | session-stream-restore（tool_result 后即 persist） |
| Hook 系统 | 无 | **beforeToolCall / afterToolCall Hook**（agent-loop-pi-improvements）：可拦截/改写工具调用 |

**V2 新发现**：
- **任务暂停与重定向**是 Equality 独有设计——cc-haha 只能 abort（丢弃上下文），Equality 可以在工具边界"干净暂停"然后注入新指令继续
- **beforeToolCall Hook** 让外部逻辑（安全策略、审计、缓存）可以在工具执行前拦截，这是插件系统的基础设施

### 2.2 工具体系（Phase Y 补强后）

| | cc-haha | Equality |
|-|---------|----------|
| 工具数量 | 50+（编码专属） | ~15 内置 + **Phase Y 新增**：todo/memory(合并)/image_generate(MiniMax)/read_image(URL) |
| Bash 沙箱 | 继承官方 | **Phase Y0 双层防御**：解释器命令限制（python/node/curl 内联脚本路径扫描）+ 环境变量泄露防护（ENV_DENYLIST） |
| Bash 超时 | 固定值 | **bash-timeout-streaming**：双超时架构（idle 120s + overall 5min）+ 流式输出（500ms 节流推送最后 500 字符） |
| URL 安全 | 无 | **Phase Z5-security**：统一 URL 验证层（SSRF 防护 + 协议白名单 + 内网 IP 检测） |
| 会话隔离 | 无 | **tool-session-isolation**：ToolContext 注入 sessionKey，Browser/Cron/Process 按 session 隔离资源 |
| 分类展示 | 无 | **Phase Z4.2**：工具分类 Tab（文件/搜索/浏览器/系统/记忆/计划）+ 搜索 + 分页 |
| 循环检测 | 继承官方 | 4 级自研 + **agent-loop-config**：运行时可配 maxToolCalls/maxLlmTurns，热更新不需重启 |

**V2 新发现**：
- Equality 的 **Bash 沙箱**已经进化到**解释器级别**——不仅检查 `rm/cat` 等命令的路径参数，还扫描 `python -c "..."` 内联脚本中的敏感路径。cc-haha 没有这个层次
- **环境变量泄露防护**（`ENV_DENYLIST`）确保 Agent 调用 `echo $API_KEY` 时子进程环境中没有敏感 Key
- **工具 Session 隔离**参考了 OpenClaw（cc-haha 的前身）的 Session-Tab-Registry 模式，但选择了更轻量的 ToolContext 方案

### 2.3 Crew 模式（Chat/Crew 双模态）

cc-haha **没有**对应概念。这是 Equality 独有设计：

```
Chat 模式（默认）: 通用对话，Skills 按需懒加载（skill_search 工具检索）
       ↕  一键转换（≥3 轮对话后出现 "🚀 创建 Crew" 按钮）
Crew 模式: 预设角色模板，绑定特定 Skills + 工具白/黑名单 + 模型偏好
```

**CrewTemplate** 数据模型：
- `systemPromptExtra`：追加系统提示
- `skillNames[]`：绑定的 Skill
- `toolAllow[] / toolDeny[]`：工具过滤
- `preferredModel`：模型偏好
- `source: 'builtin' | 'user-created' | 'gallery-downloaded' | 'chat-generated'`

**Briefing 机制**：从 Chat 历史 LLM 生成摘要，注入 Crew Session 的 `<briefing>` 块——实现"对话→角色"的上下文传递。

这比 cc-haha 的静态 Teams 更灵活——Crew 可以从对话中动态生成，Skills 按需绑定。

### 2.4 多 Agent 编排

| | cc-haha | Equality |
|-|---------|----------|
| 架构 | Coordinator-Worker + Teams | SubtaskManager + **Phase N PlanDAG** + **Crew 模板** |
| 命名 | Agent | **subtask**（subtask-rename-skills-sync：从 subagent 重命名） |
| 并发模型 | 多进程 | 单线程 async/await + `Promise.allSettled` + 信号量（maxConcurrent=5） |
| Skills 同步 | 无 | **SkillsSyncer**：bundled skills 按 mtime 同步到 workspace，支持用户自定义覆盖 |

### 2.5 LLM Provider（V2 增补）

| | cc-haha | Equality |
|-|---------|----------|
| Provider 管理 UI | .env 文件 | **settings-model-tab-redesign**：Provider 列表 + 右侧抽屉面板 + 状态标签（激活/已配置/未配置） |
| Thinking 处理 | 原生 Claude | **minimax-thinking-config**：双保险（API reasoning_split + 装饰器兜底）+ 可选"显示思考过程" |
| 配额 UI | 无 | **Phase Z/Z2**：Provider 抽屉内嵌配额管理（进度条 + 编辑表单 + 删除） |

### 2.6 Skills（V2 增补）

| | cc-haha | Equality |
|-|---------|----------|
| @ 选取 | 无 | **chat-mention-picker**：`@` 触发浮层 + 键盘导航 + chip 显示 |
| 多 Skill 选取 | 无 | **multi-skill-mention**：`skillTags[]` 数组 + ≤3 推荐 / >3 警告 + LLM 编排指引 |
| Skill 搜索工具 | 无 | **skill_search**：BM25 索引 + name/category/description 三级匹配 |
| 同步机制 | 无 | **SkillsSyncer**：mtime 对比 + manifest 记录 |
| Crew 绑定 | 无 | CrewTemplate.skillNames 精确绑定 |

### 2.7 安全体系（V2 增补）

| | cc-haha | Equality |
|-|---------|----------|
| 路径沙箱 | 继承官方 | path-guard + **realpathSync 规范化**（Z5-bugfixes B3） |
| Bash 沙箱 | 基础 | **Y0 双层**：解释器限制 + 环境变量泄露防护 |
| URL 安全 | 无 | **Z5-security S1**：统一 validateUrl（SSRF/协议/内网 IP） |
| Browser 审计 | 无 | **Z5-security S4**：navigate/click/type 结构化审计日志 |
| 证据校验 | 无 | Phase S/X 三层护栏 + Proof Guard |
| 写操作识别 | 静态 | 动态 classifyMutation |

---

## 三、Equality V2 新增的独有深度

### 3.1 Chat/Crew 双模态 + Skill 按需分发

这是 V1 完全没有覆盖的维度。Equality 正在构建一个**"对话→角色→团队"的渐进式 AI 使用范式**：

1. **Chat 模式**：轻量对话，只加载 always=true 的 Skills，其余通过 `skill_search` 工具按需检索
2. **Crew 模式**：专家角色，预绑定 Skills + 工具 + 模型偏好，System Prompt 追加角色定义
3. **Briefing 转换**：Chat ≥3 轮 → 一键创建 Crew，LLM 生成上下文摘要自动注入

cc-haha 的 "Teams" 是静态的 Worker 组，没有角色定义、没有 Skill 绑定、没有对话→角色的动态转换。

### 3.2 任务暂停与重定向

cc-haha 只能 abort（取消），Equality 实现了**精确的"干净暂停"**：

```
streaming → 点暂停 → pauseIntent=true → 等下一个 tool_result → abort → paused
paused → 用户输入重定向指令 → streaming（继续执行，保留上下文）
```

关键设计：暂停在 tool_result 后触发，确保当前工具完整执行、下一轮 LLM 不启动。这避免了中间状态不一致。

### 3.3 工具并行执行 + Hook 系统

**并行执行**：同一轮多个 tool_call 用 `Promise.allSettled` 并发，结果按原始顺序写入 messages。

**Hook 系统**：
```typescript
beforeToolCall → 可 block（返回 { block: true, reason }）
afterToolCall → 可改写结果（返回 { result: newResult }）
```

这为安全策略、审计日志、缓存命中等横切关注点提供了统一插入点。cc-haha 没有 Hook 机制。

### 3.4 多会话隔离架构

**每个 Chat 实例完全独立**：
- 独立 messages/activeToolCalls/streamingText state
- SSE 事件按 sessionKey 过滤
- 工具通过 ToolContext.sessionKey 隔离（Browser Context、Cron Job、Process 各自按 session 归属）
- 最多 10 个并发打开的 session

cc-haha 的 Desktop 版也支持多 session，但工具侧没有 session 隔离——Browser、文件操作、进程管理是全局共享的。

### 3.5 语音输入 + TTS 播报

**Phase Z/Z2/Z3/Z4** 构建了完整的语音交互链：

```
Z2: Web Speech API 识别（STT）→ 填入输入框
Z4: MediaRecorder 持续录音 + 实时转文字 + 时长显示
Z2.2: SpeechSynthesis TTS 播报（按句分割，自然停顿）
Z3.2: TTS 自动播报（回复完成自动朗读，全局开关）
Z3.3: TTS 内容过滤（去 markdown/emoji/token 统计）
```

cc-haha 有 STT 但没有 TTS；Equality 两者都有，且 TTS 有内容过滤和自动播报策略。

### 3.6 i18n 国际化

**Phase Z5-i18n**：react-i18next 全栈国际化：
- `en.json` / `zh-CN.json` 双语言包
- 所有 UI 文本通过 `t()` 函数引用
- 设置页一键切换，`localStorage` 持久化
- Core System Prompt 根据前端 language 参数切换模板

cc-haha 只有英文界面。

### 3.7 UI 主题系统（Dark / Purple / Black）

**Phase Z4.3**：三套主题 + OLED 纯黑主题：

| 主题 | 背景色 | 定位 |
|------|--------|------|
| dark | `#0d1424` | 默认深蓝 |
| purple | Phase V | 紫色特色 |
| black | `#000000` | OLED 省电 |

cc-haha 只有单一深色主题。

### 3.8 剪贴板粘贴附件

**clipboard-paste-attachment**：
- Ctrl+V 自动检测图片/文件
- 图片→Tauri Rust 端写入临时文件→附件
- 文件→`File.path`（Tauri WebView2 扩展属性）→附件
- 降级处理：非 Tauri 环境静默跳过

cc-haha 的 Desktop 也支持文件拖放，但没有 Ctrl+V 粘贴图片的快捷方式。

### 3.9 @ Mention Picker

**chat-mention-picker + multi-skill-mention**：

```
@ → Skill 浮层（模块级缓存 + useMemo 实时过滤 + ↑↓Enter 键盘导航）
# → Tool 浮层
多 Skill：skillTags[] 数组 + chip 渲染 + ≤3 推荐 / >3 警告
消息构建：[@skill-a,@skill-b] [#bash,#write_file] 用户消息
```

cc-haha 有 `/` Slash 命令但没有 `@`/`#` Mention 选取机制。

---

## 四、cc-haha 仍然领先的领域

### 4.1 CLI / Headless / CI
`--print` 无头模式。Equality 无。

### 4.2 IDE Bridge
VS Code 双向通信。Equality 无。

### 4.3 Daemon 后台模式
Agent 守护进程持续运行。Equality 只在用户交互时激活。

### 4.4 Computer Use
Python 控制桌面（截屏/鼠标/键盘）。Equality 无。

### 4.5 Notebook 编辑
`NotebookEditTool` 操作 Jupyter notebook cell。Equality 无。

### 4.6 LSP 工具（已实现）
内置 LSP Client 做代码跳转/引用/诊断。Equality 的 Phase B 仍在规划。

### 4.7 PR / Code Review 流
`ReviewArtifactTool`、`SubscribePRTool`、Worktree 管理。Equality 面向通用场景，没有 PR 流。

### 4.8 编译期特性裁剪
`bun:bundle` 的 `feature()` DCE。Equality 全运行时。

---

## 五、设计哲学终极对比

| 维度 | cc-haha | Equality |
|------|---------|----------|
| **核心理念** | "开发者的终端 AI 搭档" | "可编排、可进化、可自适应的认知引擎" |
| **信任模型** | 信任 Claude/GPT 强模型 | **不信任任何模型**——3 层证据校验 + 伪执行检测 + 预算压力 |
| **交互范式** | 命令行 + Slash | **渐进式**：Chat → @Mention → Crew → PlanDAG |
| **扩展方式** | Skills + MCP | Skills 自沉淀 + Plugin SDK + MCP + Crew 模板 + beforeToolCall Hook |
| **用户画像** | 英文开发者 | PRC Windows 用户（i18n + CNY + 国内镜像 + DPAPI 加密） |
| **复杂度管理** | 4700 行单文件 | **SDD**：50+ spec MD + 467 项断言 |
| **演进策略** | 社区 feature 堆叠 | **Phase A→Z5 有序路线图**：可靠性→安全→编排→自进化→打磨 |
| **语音交互** | STT 输入 | STT + TTS 自动播报 + 内容过滤 |
| **角色系统** | 无 | Chat/Crew 双模态 + 5 种 Agent 角色 |
| **暂停能力** | 只能 abort | **干净暂停** + 重定向继续 |

**一句话（V2）**：cc-haha 是一把锋利的瑞士军刀（面向开发者的即战力工具），Equality 是一个正在生长的有机系统（面向普通用户的认知引擎，从对话到编排到自进化）。

---

## 六、覆盖矩阵速查（V2 完整版）

| 能力 | cc-haha | Equality 现状 | Equality 路线图 |
|------|---------|--------------|----------------|
| 基础对话 + 流式 | ✅ | ✅ | — |
| 文件操作工具 | ✅ 50+ | ✅ ~15 | Phase D: MCP 扩展 |
| **工具并行执行** | ❌ | ✅ allSettled | — |
| **beforeToolCall Hook** | ❌ | ✅ | — |
| 工具循环检测 | 继承官方 | ✅ 4 级自研 | agent-loop-config: 可配 |
| **工具分类/搜索/分页** | ❌ | ✅ Z4+Z5 | — |
| **工具 Session 隔离** | ❌ | ✅ | — |
| 上下文压缩 | ✅ | ✅ | — |
| 多 Provider | 自定义端点 | ✅ 5+ Provider | — |
| **Provider 管理 UI** | .env | ✅ 抽屉面板 | — |
| Model Fallback | ❌ | ✅ 降级链 | — |
| **Thinking 显示** | 原生 Claude | ✅ 双保险 + 可选显示 | — |
| 费用追踪 | ❌ | ✅ CostLedger | Phase U: 配额管理 |
| **配额设置 UI** | ❌ | ✅ Z/Z2 | — |
| Skills | ✅ | ✅ | Phase T/W: 渐进披露+分类 |
| **@ Skill Mention** | ❌ | ✅ 多选+chip | — |
| **skill_search 工具** | ❌ | ✅ BM25 | — |
| **Skills 同步** | ❌ | ✅ SkillsSyncer | — |
| Skill 安全扫描 | ❌ | ✅ 8 规则 | — |
| Skill 自动沉淀 | ❌ | ✅ | Phase O: 增强 |
| **Chat/Crew 双模态** | ❌ | ✅ 设计完成 | — |
| 多 Agent | ✅ Teams | ✅ SubtaskManager | Phase N: DAG 编排 |
| 后台任务 | ✅ | ✅ TaskRegistry | Phase H: SQLite |
| 孤儿恢复 | ❌ | ✅ | — |
| **任务暂停+重定向** | ❌ | ✅ | — |
| 证据校验 | ❌ | ✅ Proof Guard | Phase S: 三层护栏 |
| 交互式 UI | ❌ | Phase F 设计完成 | Phase F |
| Chat Commands | ✅ 100+ Slash | Phase Q 设计完成 | Phase Q |
| **Bash 双超时+流式** | 固定超时 | ✅ idle+overall+节流推送 | — |
| **Bash 解释器沙箱** | ❌ | ✅ Phase Y0 | — |
| **环境变量泄露防护** | ❌ | ✅ ENV_DENYLIST | — |
| **URL 安全验证** | ❌ | ✅ Z5-security | — |
| **Browser 审计日志** | ❌ | ✅ Z5-security | — |
| **沙箱 realpathSync** | ❌ | ✅ Z5-bugfixes | — |
| **STT 语音输入** | ✅ | ✅ Z2+Z4 | — |
| **TTS 自动播报** | ❌ | ✅ Z2.2+Z3 | — |
| **i18n 国际化** | ❌ | ✅ Z5-i18n | — |
| **三套主题** | ❌ | ✅ dark/purple/black | — |
| **Ctrl+V 粘贴图片** | ❌ | ✅ clipboard-paste | — |
| **用户引导** | ❌ | ✅ onboarding-guide | — |
| **多会话隔离** | 部分 | ✅ 完整隔离 | — |
| **MiniMax 图片生成** | ❌ | ✅ Phase Y3.1 | — |
| **todo 工具** | ❌ | ✅ Phase Y1.1 | — |
| IDE Bridge | ✅ VS Code | ❌ | 未规划 |
| CLI/Headless | ✅ --print | ❌ | 未规划 |
| Daemon 后台 | ✅ | ❌ | 未规划 |
| Computer Use | ✅ Python | ❌ | 未规划 |
| Notebook 编辑 | ✅ | ❌ | 未规划 |
| LSP 工具 | ✅ 内置 | ❌ | Phase B 规划 |
| PR/Review 流 | ✅ | ❌ | 未规划 |
| 编译期 DCE | ✅ | ❌ | — |
| 记忆系统 | ✅ memdir | ✅ SQLite+FTS5 | Phase K: embeddings |
| 插件系统 | ❌ | ❌ | Phase K: Plugin SDK |
| 安全审计 | ❌ | ✅ /security-audit | — |
| 代码索引 | ❌ | ❌ | Phase N: CodeIndexer |
| Config 迁移 | ❌ | ❌ | Phase L: Schema+Migrate |
| 渠道路由 | ✅ TG/飞书 | Spec 完成 | Phase 13 |

**矩阵统计（V2）**：
- Equality 独有（cc-haha ❌）：**35+ 项**
- cc-haha 独有（Equality ❌）：**7 项**（CLI/IDE/Daemon/ComputerUse/Notebook/LSP/PR）
- 两者都有：~10 项

---

## 七、V1→V2 认知升级总结

V1 的分析主要基于 Phase A-W 的架构层设计，V2 补充了 Phase X-Z5 和 20+ 独立变更设计后，新增以下关键认知：

1. **Equality 的安全纵深远超 V1 认知**——不仅有策略管道和证据校验，还有解释器级 Bash 沙箱、ENV 泄露防护、统一 SSRF 防护、Browser 审计日志、沙箱路径规范化
2. **Equality 的交互体验已进入产品级**——i18n、三主题、Ctrl+V 粘贴、用户引导、STT+TTS、@ Mention 多选、工具分类搜索分页、Provider 管理抽屉
3. **Chat/Crew 双模态**是 V1 完全遗漏的重要设计——它重新定义了"用户如何与 AI 角色交互"
4. **任务暂停+重定向**是微小但关键的交互创新——用户不再只能 abort 或等待
5. **工具并行执行 + Hook 系统**让工具层从"顺序管道"升级为"可编排管道"

**cc-haha 的 7 项独有优势（CLI/IDE/Daemon/ComputerUse/Notebook/LSP/PR）全部是面向开发者的专业场景**，如果 Equality 的目标不是 IDE 替代品，这些差距并不构成竞争劣势。
