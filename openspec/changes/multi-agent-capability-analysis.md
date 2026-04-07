# Equality 大型软件开发能力分析报告

> 分析日期：2026-04-07
> 目标：评估 Equality 是否具备"多角色 Agent 协作开发大型软件"的能力，并给出改造路线

---

## 一、你的设想

```
用户启动工程任务
  → 创建总体 Plan
  → 拆分为多角色 Agent（架构师、开发、测试、监管）
  → 各角色 Agent 有独立的子 Plan + 独立的 Spec 编写能力
  → 监管 Agent 根据各角色完成进度，通知下一角色开始工作
  → 长时间运行，全自动推进
```

终极目标：**Equality 的后续迭代由 Equality 自己完成**。

---

## 二、当前 Equality 已有的基础设施

### ✅ 已具备的能力

| 能力 | 实现位置 | 成熟度 |
|------|----------|--------|
| **子 Agent 生命周期** | `SubagentManager` (spawn/list/steer/kill) | 🟢 可用 |
| **任务注册中心** | `TaskRegistry` (7 种状态机 + 事件系统) | 🟢 可用 |
| **多 Agent 配置** | `agent-scope.ts` (per-agent model/workspace/tools/identity) | 🟢 可用 |
| **工具 Profile** | `ToolCatalog` + `ToolProfilePolicy` (coding/messaging/minimal) | 🟢 可用 |
| **Skill 系统** | 6 级加载源 + frontmatter 元数据 + 安全扫描 | 🟢 可用 |
| **project-dev-workflow Skill** | 完整的 需求→Spec→分Phase编码→续接 流程 | 🟢 可用 |
| **OpenSpec Skill** | 规范驱动开发框架 | 🟢 可用 |
| **Memory 跨 session** | memory_save / memory_search | 🟢 可用 |
| **Steering** | POST /chat/steer 中途调整 | 🟢 可用 |
| **编译错误自动重试** | `isCompileOrTestError()` + 自动追加 context | 🟢 可用 |
| **工具循环检测** | LoopDetector (4 重检测器) | 🟢 可用 |
| **Provider Failover** | FallbackProvider + 错误分类降级 | 🟢 可用 |
| **Context Compaction** | 自适应分段压缩 + 标识符保护 | 🟢 可用 |
| **Hooks 系统** | beforeToolCall / afterToolCall / beforeLLMCall | 🟢 可用 |
| **结构化日志** | createLogger + JSONL 文件 | 🟢 可用 |
| **桌面应用** | Tauri v2 + React | 🟢 可用 |

### 🟡 部分可用但需增强

| 能力 | 现状 | 缺失部分 |
|------|------|----------|
| 子 Agent 深度 | 仅支持 depth=1（单层） | 需 depth=2+ 支持监管→角色 Agent→子任务 |
| 子 Agent 通信 | 只有 steer（单向注入文本） | 缺少 Agent 间双向消息传递 |
| 任务依赖编排 | TaskRegistry 有状态机但无依赖关系 | 缺少 DAG 调度（A 完成后触发 B） |
| 长时间运行 | 单 session 50 轮 tool loop | 无跨 session 自动续接（需人工"继续"） |
| 进度汇报 | memory_save checkpoint | 无结构化进度 API / 监管 Agent 查询接口 |

### 🔴 完全缺失

| 能力 | 说明 |
|------|------|
| **Plan DAG 编排器** | 不存在"任务A完成→自动触发任务B"的调度逻辑 |
| **Agent 间消息总线** | 不存在 Agent→Agent 直接通信机制 |
| **自动续接** | 工具调用上限后需人工干预，无自动开启新 session 继续 |
| **并行 Agent 执行** | SubagentManager.spawn 是 await（串行），不支持并行多子 Agent |
| **角色模板** | 无预定义的"架构师/开发/测试/监管"身份模板 |
| **进度 Dashboard** | 前端无多 Agent 任务进度可视化 |

---

## 三、能不能做到？—— 结论

### 短答案：**80% 可以做到，但需要 3 个关键增强**

Equality 已有子 Agent + 任务注册中心 + 多 Agent 配置 + Skill 系统，基础架构比大多数 AI 编程工具更完整。**核心缺失的不是底层能力，而是编排层**。

### 必须做的 3 件事

| # | 增强项 | 工作量 | 说明 |
|---|--------|--------|------|
| **1** | Plan DAG 编排器 | ~300 行 | 任务依赖图 + 状态监听 + 自动触发下游 |
| **2** | 并行子 Agent | ~100 行 | SubagentManager.spawnParallel() |
| **3** | Agent 间消息总线 | ~200 行 | TaskRegistry 扩展：完成事件 → 通知订阅者 |

有了这 3 件，就可以实现：

```
监管 Agent (Supervisor)
  │
  ├─ spawn 架构师 Agent → 完成后事件触发 →┐
  │                                        ├─ 并行 spawn 开发 Agent + 测试 Agent
  │                                        │
  │  开发 Agent 完成某 Phase → 事件触发 → 测试 Agent 开始测试该 Phase
  │
  └─ 监管 Agent 轮询所有子任务状态，决定下一步
```

### 不需要做的（过度设计）

- ❌ 不需要真正的微服务通信——所有 Agent 运行在同一个 Node.js 进程内
- ❌ 不需要独立的 Agent 框架——复用现有 `runAttempt()` + 不同 system prompt 即可
- ❌ 不需要复杂的共识协议——监管 Agent 是单一决策者

---

## 四、与 OpenClaw 的对比

OpenClaw 的 subagent 系统（~2000 行）支持：
- `run` / `session` 两种模式
- 线程绑定、附件传递
- 深度限制（可配置 depth）
- 孤儿恢复（Gateway 重启后恢复中断任务）
- 控制面：list / steer / kill，含级联终止后代

**但 OpenClaw 也没有你设想的"多角色协作"**——它的 subagent 是"主 Agent 把子任务委派出去"的模式（星型拓扑），而不是"多个角色 Agent 按依赖关系协作"的模式（DAG 拓扑）。

你的设想实际上**超越了 OpenClaw 当前架构**。这是一个值得做的差异化方向。

---

## 五、推荐架构设计

### 5.1 角色定义

不需要太多角色。根据当前 AI Agent 的实际能力边界，推荐以下 4 + 1 角色：

| 角色 | ID | 职责 | Skill | Tool Profile |
|------|----|------|-------|-------------|
| **监管者** | `supervisor` | 拆分任务、分配角色、监控进度、协调依赖 | `supervisor-workflow` | minimal + subagent_* |
| **架构师** | `architect` | 技术选型、模块划分、接口设计、写 design.md | `openspec-skill` | coding（只读 + write_file） |
| **开发者** | `developer` | 写代码、跑测试、修 bug | `project-dev-workflow` | coding（完整） |
| **测试者** | `tester` | 写测试用例、执行测试、验证覆盖率 | （新建）`testing-workflow` | coding（完整） |
| **审查者** | `reviewer` | 代码审查、Spec 审查、最终验收 | （新建）`review-workflow` | coding（只读） |

### 5.2 编排模式：Supervisor + DAG

```
用户: "帮我开发一个 XX 系统"
  │
  ▼
Supervisor Agent（长驻）
  │
  ├─ Phase 0: 需求澄清（Supervisor 自己做）
  │
  ├─ Phase 1: 架构设计
  │    └─ spawn Architect Agent
  │         → 输出 proposal.md + design.md + tasks.md
  │         → 完成后 → 事件通知 Supervisor
  │
  ├─ Phase 2: 详细设计 + 测试设计（并行）
  │    ├─ spawn Developer Agent → 写各模块 spec.md
  │    └─ spawn Tester Agent → 写测试计划 + 测试用例 spec
  │    → 都完成后 → Supervisor 确认
  │
  ├─ Phase 3~N: 分 Phase 开发（串行）
  │    ├─ spawn Developer Agent → 实现 Phase X 代码
  │    │    → 完成后 → 事件通知
  │    └─ spawn Tester Agent → 测试 Phase X
  │         → 发现 bug → steer Developer 修复
  │
  ├─ Phase N+1: 审查
  │    └─ spawn Reviewer Agent → 审查全部代码和 Spec
  │
  └─ 完成 → 输出总结报告
```

### 5.3 数据流：基于文件系统的协作

Agent 间不需要复杂的消息传递——**它们通过文件系统协作**：

```
openspec/changes/my-feature/
  ├── proposal.md          ← Supervisor 写 / Architect 补充
  ├── design.md            ← Architect 写
  ├── tasks.md             ← Supervisor 写框架 → 各角色补充
  ├── specs/
  │    ├── module-a/spec.md  ← Developer 写详细 spec
  │    ├── module-b/spec.md  ← Developer 写详细 spec
  │    └── test-plan/spec.md ← Tester 写测试计划
  └── reviews/
       └── review-1.md      ← Reviewer 写审查结果

src/
  ├── module-a/            ← Developer 写
  ├── module-b/            ← Developer 写
  └── __tests__/           ← Tester 写
```

这种模式的优势：
1. **无需消息总线**——读文件就知道其他 Agent 做了什么
2. **天然持久化**——断电重启后读文件即可恢复
3. **人类可审查**——所有中间产物都是 Markdown/代码文件
4. **与 OpenSpec 完美兼容**——已有的 Skill 直接复用

---

## 六、具体改造清单

### Phase N1：Plan DAG 编排器（核心）

新增文件 `packages/core/src/orchestration/`：

| 文件 | 内容 |
|------|------|
| `plan-types.ts` | PlanNode, PlanEdge, PlanGraph, PlanExecution 类型 |
| `plan-dag.ts` | DAG 构建 + 拓扑排序 + 就绪节点计算 |
| `plan-executor.ts` | PlanExecutor 类：监听完成事件 → 触发下游 → 并行/串行控制 |
| `plan-serializer.ts` | Plan ↔ tasks.md 双向转换 |

核心接口：
```typescript
interface PlanNode {
  id: string
  role: 'supervisor' | 'architect' | 'developer' | 'tester' | 'reviewer'
  task: string                    // 任务描述
  dependsOn: string[]             // 前置节点 ID
  status: 'pending' | 'running' | 'completed' | 'failed'
  assignedTaskId?: string         // TaskRegistry 中的 taskId
  output?: string                 // 产出路径（spec/代码等）
}

interface PlanGraph {
  id: string
  title: string
  nodes: PlanNode[]
  createdAt: number
}

class PlanExecutor {
  constructor(deps: { subagentManager: SubagentManager; taskRegistry: TaskRegistry })
  
  // 加载 Plan 并开始执行
  execute(plan: PlanGraph): Promise<PlanExecutionResult>
  
  // 查询当前状态
  getStatus(): PlanStatus
  
  // 暂停/恢复
  pause(): void
  resume(): void
}
```

### Phase N2：SubagentManager 增强

| 改动 | 说明 |
|------|------|
| 解除 depth=1 限制 | 允许 Supervisor → Role Agent → Sub-task (depth=2) |
| `spawnParallel()` | 并行启动多个子 Agent，返回 Promise.allSettled |
| 完成回调 | spawn 时传入 `onComplete` 回调，自动通知 PlanExecutor |

### Phase N3：Supervisor Skill

新增 `packages/core/skills/supervisor-workflow/SKILL.md`：

```markdown
---
name: supervisor-workflow
description: '多角色协作编排：拆分任务到架构师/开发/测试等角色 Agent，监控进度，协调依赖。'
---

## 工作流

1. 接收用户需求 → 需求澄清（复用 project-dev-workflow 阶段1）
2. 生成 Plan DAG（角色分配 + 依赖关系）
3. 按 DAG 顺序 spawn 各角色 Agent
4. 监控完成事件 → 触发下游
5. 异常处理：Agent 失败 → 重试 / 人工介入
6. 全部完成 → 汇总报告
```

### Phase N4：角色 Agent 配置

在 `equality.config.json` 中预定义角色：

```json
{
  "agents": {
    "defaults": { "model": "gpt-4o" },
    "list": [
      {
        "id": "supervisor",
        "name": "项目监管",
        "identity": "你是项目监管 Agent，负责拆分任务、分配角色、监控进度。你不直接写代码，而是通过 subagent_spawn 委派给专业角色。",
        "tools": { "profile": "minimal", "allow": ["subagent_spawn", "subagent_list", "subagent_steer", "subagent_kill", "read_file", "write_file", "memory_save", "memory_search"] }
      },
      {
        "id": "architect",
        "name": "架构师",
        "identity": "你是架构师 Agent，负责技术选型、模块划分、接口设计。输出 design.md 和 tasks.md。",
        "tools": { "profile": "coding" }
      },
      {
        "id": "developer",
        "name": "开发者",
        "identity": "你是开发 Agent，负责按照 Spec 写代码、运行测试、修复 bug。严格按照 tasks.md 中分配给你的任务执行。",
        "tools": { "profile": "coding" }
      },
      {
        "id": "tester",
        "name": "测试者",
        "identity": "你是测试 Agent，负责编写测试用例、执行测试、报告 bug。关注边界情况和错误处理。",
        "tools": { "profile": "coding" }
      },
      {
        "id": "reviewer",
        "name": "审查者",
        "identity": "你是代码审查 Agent，审查代码质量、Spec 一致性、安全性。只读操作，不修改代码。",
        "tools": { "profile": "coding", "deny": ["write_file", "edit_file", "bash", "apply_patch"] }
      }
    ]
  }
}
```

---

## 七、改造工作量估算

| Phase | 内容 | 新增文件 | 估算行数 | 预计时间 |
|-------|------|----------|----------|----------|
| N1 | Plan DAG 编排器 | 4 | ~400 | 1 session |
| N2 | SubagentManager 增强 | 0 (改) | ~150 | 0.5 session |
| N3 | Supervisor Skill | 1 | ~200 (MD) | 0.5 session |
| N4 | 角色 Agent 配置 + 测试 | 2 | ~300 | 0.5 session |
| N5 | 集成测试 + 试运行 | 1 | ~200 | 1 session |
| **总计** | | **8** | **~1250** | **3.5 sessions** |

---

## 八、现在就可以用的方案（零改造）

即使不做任何代码改造，**用当前的 Equality 也可以接近你的设想**，通过以下操作手册：

### 操作手册：基于现有能力的多角色协作

#### 步骤 1：用 project-dev-workflow 生成 Plan

```
用户: @project-dev-workflow 帮我开发一个 XX 系统

→ Equality 按 Skill 流程：
   1. 需求澄清
   2. 生成 openspec/（proposal + design + tasks）
   3. tasks.md 里按 Phase 划分
```

#### 步骤 2：手动 spawn 角色 Agent

在 Equality 对话中：
```
请按以下方式分工执行 tasks.md 中的任务：

1. 先以架构师身份完成 Phase 1（架构设计），
   输出 design.md 和各模块的 spec.md

2. 架构完成后，以开发者身份开始 Phase 2（编码），
   严格按 spec.md 实现

3. 每个 Phase 编码完成后，以测试者身份运行测试

4. 如果测试发现问题，切回开发者身份修复

5. 每完成一个 Phase，更新 tasks.md 并 memory_save
```

这实际上是 **"伪多角色"**——同一个 Agent 切换身份。受限于 context window 和工具调用上限，但对于中小型项目完全够用。

#### 步骤 3：跨 session 续接

```
用户: 继续上次的项目

→ Equality 通过 memory_search 找到 checkpoint
→ 读取 tasks.md 找到未完成的 Phase
→ 继续执行
```

### 这种方案的局限

| 局限 | 影响 |
|------|------|
| 同一 context window | 架构+开发+测试共享 context，大项目会溢出 |
| 串行执行 | 不能真正并行（架构师和测试同时工作） |
| 无自动触发 | 需要人工说"继续"才能开始下一 Phase |
| 无真正隔离 | 角色切换靠 prompt 引导，不是 session 隔离 |

---

## 九、让 Equality 迭代自己的路径

### 现在就可以做到的

使用 `project-dev-workflow` Skill + `openspec-skill`，Equality **已经可以**：

1. ✅ 读取自己的代码 (`read_file`)
2. ✅ 修改自己的代码 (`write_file`, `edit_file`)
3. ✅ 运行自己的测试 (`bash` → `npx tsx src/__tests__/*.ts`)
4. ✅ 检查类型 (`bash` → `npx tsc --noEmit`)
5. ✅ 写 Spec (`openspec-skill`)
6. ✅ 分 Phase 开发 (`project-dev-workflow`)
7. ✅ 跨 session 记忆 (`memory_save` / `memory_search`)

### 要真正稳定地自我迭代，还需要

| 需求 | 原因 | 解决方案 |
|------|------|----------|
| 更大的 context window | Equality 代码库已经很大 | 使用 Claude/GPT 200K 模型 |
| LSP 集成 | 多文件重构需要引用分析 | GAP-2 已有 lsp-* 工具 |
| 自动续接 | 大 Phase 超过 50 轮上限 | Phase N 改造中的 PlanExecutor |
| Git 操作 | 需要 commit/branch/revert | 已有 `bash` 可以执行 git |

---

## 十、最终结论

| 问题 | 答案 |
|------|------|
| 现在能做到吗？ | **部分能做到**——单 Agent 伪多角色模式可用，真正的多角色并行不行 |
| 需要多少改造？ | **~1250 行新代码**（Plan DAG + SubagentManager 增强 + Supervisor Skill） |
| 改造后能做到吗？ | **可以**——完整的 Supervisor → 角色 Agent 协作流程 |
| Equality 能迭代自己吗？ | **现在就基本可以**（用 project-dev-workflow），改造后更稳定 |
| 与 OpenClaw 差多少？ | OpenClaw 也没有这种 DAG 编排——**这是 Equality 的差异化机会** |

### 推荐行动

1. **立即**：用现有 Equality + project-dev-workflow 尝试一次自我迭代（验证可行性）
2. **接着**：实现 Phase N1~N5 改造（~3.5 sessions 工作量）
3. **之后**：用改造后的 Equality 自己完成后续的 GAP 修补工作

---

*本报告由 Equality 分析自身代码库后生成。*
