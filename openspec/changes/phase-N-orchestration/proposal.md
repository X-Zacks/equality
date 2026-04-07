# Proposal: Phase N — 多角色编排引擎 (Multi-Role Orchestration Engine)

> Equality 的下一代编排能力：从"单 Agent 串行执行"进化到"多角色 Agent DAG 调度"，
> 使 Equality 能够独立完成大型软件开发任务，并最终实现自我迭代。

---

## 一、为什么做

### 1.1 核心痛点

Phase A—M 完成了 Equality 的工具层、Agent 运行时、上下文引擎、任务注册中心和子 Agent 机制。但在"用 Equality 开发大型软件"时，暴露出以下瓶颈：

| 瓶颈 | 当前行为 | 影响 |
|------|---------|------|
| **单层子 Agent** | `SubagentManager` 硬限 depth=1 | 无法实现 Supervisor → 角色 Agent → 子任务 的三层结构 |
| **串行 spawn** | `spawn()` 是 `await`——阻塞主对话直到子任务完成 | 不能并行运行架构师+开发+测试 |
| **无任务依赖** | `TaskRegistry` 有状态机但无依赖关系 | 无法表达"架构设计完成后才能开始编码" |
| **无全局编排** | 不存在 Plan 概念，不存在 DAG 调度器 | 每个子 Agent 独立运行，无法按依赖图推进 |
| **前端不可见** | `SessionPanel` 扁平列表，子 session 不可见 | 用户无法观测子 Agent 对话与进度 |
| **无代码索引** | 仅 grep/glob 搜索 | 800+ 文件项目中找不到相关代码 |
| **无 Diff 预览** | write_file 直接写入 | 用户无法在写入前审查变更 |
| **启动不透明** | 无 Bootstrap 阶段日志 | 出问题时难以定位启动环节 |

### 1.2 竞品已覆盖而 Equality 缺失的能力

| 能力 | Cursor | Copilot Agent | Claude Code | Equality |
|------|--------|---------------|-------------|----------|
| 代码索引 | ✅ embedding | ✅ 全项目 | ✅ 文件搜索 | ❌ |
| Diff 预览 | ✅ inline | ✅ inline | ❌ | ❌ |
| 并行后台 | ✅ Background | ❌ | ❌ | ❌ |
| 多 Agent 编排 | ❌ | ❌ | ❌ (subagent 仅) | ❌ (需增强) |

### 1.3 claw-code-main 验证的可行性

claw-code-main（Claude Code 的 Python clean-room rewrite）通过 oh-my-codex 的 `$team` + `$ralph` 模式完成了整个项目——证明多角色协作在大型项目中是有效的：
- `$team` → 并行代码审查 + 架构反馈（对应我们的 Reviewer + Architect）
- `$ralph` → 持久执行循环 + 自动续接（对应我们的 Supervisor + PlanExecutor）

---

## 二、做什么

Phase N 划分为 **6 个子阶段**，严格按依赖顺序执行：

```
N1: Plan DAG 编排引擎              ← 核心调度层
N2: SubagentManager 深度增强        ← 并行 + depth=2 + 完成回调
N3: 代码索引 + codebase_search     ← 大项目代码理解
N4: Session 树形 UI + 进度推送      ← 前端可观测性
N5: Supervisor Skill + 角色配置     ← 串联全流程
N6: Diff 预览 + Bootstrap 日志     ← 体验增强
```

### 子阶段依赖关系

```
N1 ─────┐
        ├──→ N2 ──→ N5
N3 ─────┘         ↗
N4 ──────────────┘
N6（独立，可并行）
```

---

## 三、不做什么

| 排除项 | 原因 |
|--------|------|
| 微服务架构 | 所有 Agent 运行在同一 Node.js 进程，无需进程间通信 |
| 独立 Agent 框架 | 复用现有 `runAttempt()` + 不同 system prompt |
| 复杂共识协议 | Supervisor 是单一决策者，无需投票/仲裁 |
| 真实 LLM 调用测试 | 所有测试用 mock，不依赖网络 |
| 远程/SSH Agent | DirectModes 概念暂不需要（桌面应用场景） |
| MCP Server 运行时 | 类型已有，运行时集成留给后续 Phase |

---

## 四、成功标准

| 标准 | 度量 |
|------|------|
| Plan DAG 可靠执行 | 30+ 测试覆盖所有路径：串行/并行/失败重试/暂停恢复 |
| 并行子 Agent | 3 个子 Agent 同时运行，互不干扰 |
| depth=2 | Supervisor → Role Agent → Sub-task 三层结构可用 |
| 代码索引 | 1000 文件项目中 codebase_search 在 2 秒内返回 Top-10 |
| 前端树形 | SessionPanel 正确显示父子层级 + 实时状态 |
| Diff 预览 | write_file/edit_file 变更可在前端预览 |
| 自我迭代 | Equality 能用 supervisor-workflow 为自己添加一个小功能 |
| 测试覆盖 | 所有新模块 ≥ 80% 断言覆盖率 |

---

## 五、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| DAG 执行器死锁 | 每个节点有独立超时 + 全局超时 + 心跳检测 |
| 并行 Agent 资源争抢 | 并发上限 `maxConcurrent` + 单文件写锁 |
| 子 Agent 无限递归 | depth 硬限 + 全局子 Agent 数上限 |
| 代码索引内存爆炸 | 增量索引 + LRU 缓存 + 大文件跳过 |
| 前端状态同步延迟 | WebSocket 实时推送 + 轮询兜底 |

---

*本提案由分析报告 `multi-agent-capability-analysis.md` 和 `multi-agent-deep-analysis-v2.md` 驱动。*
