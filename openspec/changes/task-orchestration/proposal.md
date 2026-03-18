# 任务编排与工作流复用 — 提案

> **状态**: Draft
> **作者**: Equality Team
> **日期**: 2026-03-13
> **依赖**: Phase 2 (Tools + Skills), Phase 4 (多 Agent)

---

## 1. 问题陈述

用户通过 Teams/钉钉/飞书收到领导的复杂任务指令，例如：
- "写一个内部数据看板 Web 应用"
- "把上周的周报 PPT 更新成本周的数据"
- "搭建一个 CI/CD 流水线并配置到 GitLab"

这类任务有三个共性特征：

1. **多步骤** — 需要拆分成多个子任务（调研→设计→编码→测试→部署）
2. **多技能** — 每个子任务需要不同的 Skill 组合（web-dev + database + deployment）
3. **可复用** — 类似的任务会反复出现（每周做周报、每月做数据报表）

### 当前 Equality 的能力缺口

| 缺口 | 现状 | 需要 |
|------|------|------|
| 任务拆分 | 单 agent、单 session、单轮 tool loop | 多步骤编排，子任务隔离 |
| 技能组合 | LLM 每次只匹配 1 个 Skill 阅读 | 多 Skill 联合注入 |
| 执行记忆 | 每次从零推理 | 复用历史执行方案，节约 token |
| 进度追踪 | 无 | 用户可查看各步骤进度 |
| 失败恢复 | 无 | 从失败步骤恢复，不重头来过 |

---

## 2. OpenClaw 的做法与启示

### OpenClaw 没有工作流引擎

关键发现：OpenClaw **不做显式的任务编排**。它的哲学是"让 LLM 自己决定"：
- 通过 `sessions_spawn` 工具让 LLM 自主创建子代理
- 每个子代理收到自然语言描述的 `task`，自行推理如何完成
- 父代理通过 `countActiveDescendantRuns()` 等待子代理完成

### 这种"纯涌现式"的局限

| 问题 | 说明 |
|------|------|
| Token 浪费 | 每次遇到类似任务，LLM 都要重新推理拆分策略 |
| 不可预测 | 同样的任务，两次拆分可能完全不同 |
| 无法复用 | 没有机制保存成功的执行方案 |
| 难以审计 | 用户无法事前知道 agent 会做什么 |

### Equality 的差异化机会

我们可以在 OpenClaw 的"LLM 即编排者"基础上，加入**结构化的工作流层**：
- 首次执行：LLM 自由编排 → 记录执行轨迹
- 再次遇到：匹配历史模板 → 跳过重复推理 → 直接按方案执行
- 用户可编辑模板 → 人机协作优化

---

## 3. 设计目标

### 做什么

1. **TaskPlanner** — 接收复杂任务，输出结构化的多步骤执行计划
2. **StepRunner** — 按计划逐步执行，每步绑定 agent 角色 + skill 集
3. **WorkflowTemplate** — 成功执行后保存为可复用模板
4. **TemplateMatch** — 新任务到来时，语义匹配历史模板
5. **ProgressTracker** — 实时追踪各步骤状态，支持失败恢复

### 不做什么

- ❌ 不做可视化的拖拽流程编辑器（太重了，Phase 5+ 再考虑）
- ❌ 不做跨机器的分布式编排（Equality 是单机桌面应用）
- ❌ 不做实时协同编辑（单用户场景）
- ❌ 不硬编码任务类型（一切由 LLM 动态理解）

---

## 4. 核心概念

### 4.1 任务生命周期

```
用户输入（自然语言）
    │
    ▼
┌──────────────┐    miss    ┌──────────────┐
│ TemplateMatch ├──────────►│  TaskPlanner  │
│ (语义匹配)    │           │  (LLM 拆分)   │
└──────┬───────┘           └──────┬───────┘
       │ hit                      │
       │ ┌────────────────────────┘
       ▼ ▼
┌──────────────┐
│  ExecutionPlan│  ← 结构化 JSON
│  (步骤列表)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐    step N    ┌──────────────┐
│  StepRunner  ├─────────────►│  AgentRunner  │
│  (编排循环)   │  (每步一个)   │  (tool loop)  │
└──────┬───────┘              └──────────────┘
       │
       ▼
┌──────────────┐
│ 执行完成      │
│ → 保存模板    │
│ → 通知用户    │
└──────────────┘
```

### 4.2 ExecutionPlan（执行计划）

```typescript
interface ExecutionPlan {
  id: string
  title: string                    // "搭建内部数据看板"
  originalPrompt: string           // 用户原始输入
  steps: ExecutionStep[]
  createdAt: number
  status: 'planning' | 'running' | 'paused' | 'completed' | 'failed'
}

interface ExecutionStep {
  id: string
  order: number
  title: string                    // "初始化 React 项目"
  description: string              // 详细的子任务描述
  agentRole: AgentRole             // 该步骤的 agent 角色配置
  skills: string[]                 // 该步骤需要的 skill 名称
  dependsOn: string[]              // 依赖的前置步骤 ID
  status: StepStatus
  result?: StepResult              // 执行结果
  retryCount: number
  maxRetries: number
}

type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

interface AgentRole {
  name: string                     // "web-developer" | "ppt-editor" | "researcher"
  systemPromptOverride?: string    // 角色特定的 system prompt 片段
  model?: string                   // 某些步骤可指定不同模型
  tools?: string[]                 // 该角色可用的工具白名单
  temperature?: number             // 有些步骤需要更高创造性
}
```

### 4.3 WorkflowTemplate（工作流模板）

```typescript
interface WorkflowTemplate {
  id: string
  name: string                     // "React 数据看板项目搭建"
  description: string              // 语义描述，用于匹配
  embedding: Float32Array          // 语义向量，用于相似度检索
  
  // 模板化的步骤（参数化，不含具体值）
  steps: TemplateStep[]
  
  // 元信息
  createdFrom: string              // 原始 ExecutionPlan ID
  usageCount: number               // 被复用次数
  avgTokenSaved: number            // 平均每次节约的 token 数
  lastUsedAt: number
  createdAt: number
  
  // 用户可编辑的标签
  tags: string[]                   // ["web开发", "React", "数据看板"]
}

interface TemplateStep {
  order: number
  title: string                    // 模板标题（含占位符）
  descriptionTemplate: string      // "初始化 {{framework}} 项目，配置 {{features}}"
  agentRole: AgentRole
  skills: string[]
  dependsOn: number[]              // 依赖的步骤序号
  
  // 参数化的输入
  parameters: ParameterDef[]
}

interface ParameterDef {
  name: string                     // "framework"
  type: 'string' | 'enum' | 'boolean'
  description: string
  defaultValue?: unknown
  enumValues?: string[]            // 若 type=enum
}
```

---

## 5. 详细设计

### 5.1 TaskPlanner — 任务拆分

**触发条件**：当用户输入被分类为"复杂任务"时触发。分类由 LLM 判断，Prompt 如下：

```
分析用户的请求，判断这是一个简单请求还是复杂任务。

简单请求：可以在单轮对话中完成（回答问题、写一小段代码、翻译文本）
复杂任务：需要多个步骤协调完成（创建项目、修改多个文件、涉及多种技能）

返回 JSON: { "type": "simple" | "complex", "reason": "..." }
```

**Token 消耗**：分类请求约 200 tokens（input）+ 50 tokens（output），低成本预检。

**拆分 Prompt**（仅 complex 时触发）：

```
你是一个任务规划专家。将以下复杂任务拆分为可执行的步骤序列。

任务：{{userPrompt}}
可用技能：{{availableSkillsIndex}}

要求：
1. 每个步骤应该是一个独立的、可验证的子任务
2. 明确步骤间的依赖关系
3. 为每个步骤指定最合适的 agent 角色和所需技能
4. 步骤粒度适中：太粗则无法追踪，太细则增加开销

返回 JSON：ExecutionPlan 格式
```

### 5.2 StepRunner — 步骤编排

```typescript
async function executeStep(plan: ExecutionPlan, step: ExecutionStep): Promise<StepResult> {
  // 1. 检查前置依赖是否完成
  for (const depId of step.dependsOn) {
    const dep = plan.steps.find(s => s.id === depId)
    if (dep?.status !== 'completed') {
      throw new Error(`Dependency ${depId} not completed`)
    }
  }
  
  // 2. 创建该步骤的隔离 session
  const sessionKey = `plan:${plan.id}:step:${step.id}`
  
  // 3. 构建步骤特定的 system prompt
  const systemPrompt = buildStepPrompt({
    role: step.agentRole,
    skills: step.skills,
    stepDescription: step.description,
    previousResults: collectPreviousResults(plan, step),
  })
  
  // 4. 执行 agent runner（带 tool loop）
  const result = await runAttempt({
    sessionKey,
    userMessage: step.description,
    systemPromptOverride: systemPrompt,
    allowedTools: step.agentRole.tools,
    allowedSkills: step.skills,
  })
  
  // 5. 验证执行结果
  return validateStepResult(step, result)
}
```

**关键设计点**：
- 每个步骤使用独立 `sessionKey`（`plan:{planId}:step:{stepId}`），上下文隔离
- 前一步的**结果摘要**（不是完整上下文）注入下一步的 prompt，减少 token 消耗
- 步骤可独立重试，不影响其他已完成的步骤

### 5.3 WorkflowTemplate — 模板保存与匹配

#### 保存时机

执行计划成功完成后，自动提取模板：

```typescript
async function extractTemplate(plan: ExecutionPlan): Promise<WorkflowTemplate> {
  // 1. LLM 抽象化：将具体值替换为参数占位符
  const abstractPlan = await llm.chat({
    messages: [{
      role: 'system',
      content: '将以下执行计划抽象为可复用的模板。将具体的项目名、技术栈等替换为参数占位符 {{paramName}}。'
    }, {
      role: 'user', 
      content: JSON.stringify(plan)
    }]
  })
  
  // 2. 生成语义向量
  const embedding = await embedText(plan.title + ' ' + plan.originalPrompt)
  
  // 3. 持久化
  return saveTemplate({ ...abstractPlan, embedding })
}
```

#### 匹配逻辑

新任务到来时，先搜索模板库：

```typescript
async function matchTemplate(userPrompt: string): Promise<WorkflowTemplate | null> {
  // 1. 语义向量检索（Top-3）
  const queryVec = await embedText(userPrompt)
  const candidates = await vectorSearch(queryVec, { topK: 3, minScore: 0.75 })
  
  if (candidates.length === 0) return null
  
  // 2. LLM 精排（确认是否真的匹配）
  const best = await llm.chat({
    messages: [{
      role: 'system',
      content: '判断以下任务是否可以使用给定的工作流模板完成。如果可以，输出参数绑定。'
    }, {
      role: 'user',
      content: JSON.stringify({ task: userPrompt, candidates })
    }]
  })
  
  return best.matched ? best.template : null
}
```

#### Token 节约量估算

| 场景 | 无模板 | 有模板 | 节约 |
|------|--------|--------|------|
| 任务分类 | 250 tokens | 250 tokens | 0 |
| 任务拆分 | ~2,000 tokens | 0（跳过） | **~2,000** |
| 步骤 system prompt | 每步 ~800 tokens | 每步 ~800 tokens | 0 |
| 模板匹配 | 0 | ~500 tokens | -500 |
| **总计（5步任务）** | **~6,250** | **~4,750** | **~1,500 (24%)** |

实际节约主要来自跳过拆分推理。对于重复性高的任务（周报、固定格式报表），节约比例更高，因为模板可以固化步骤描述，减少每步的 prompt 长度。

### 5.4 进度追踪与用户交互

```typescript
interface PlanProgress {
  planId: string
  title: string
  totalSteps: number
  completedSteps: number
  currentStep: { title: string; status: string } | null
  estimatedRemainingMs: number   // 基于历史同类步骤耗时估算
  canPause: boolean
  canResume: boolean
}
```

前端通过 SSE 实时获取进度更新：

```
event: plan_started
data: { planId, title, totalSteps }

event: step_started  
data: { planId, stepId, stepTitle, order }

event: step_progress
data: { planId, stepId, delta: "正在创建 React 项目..." }

event: step_completed
data: { planId, stepId, result: { summary: "..." } }

event: plan_completed
data: { planId, templateSaved: true, templateId: "..." }
```

---

## 6. 存储方案

### 6.1 执行计划存储

```
~/.equality/plans/
  ├── {planId}.json          # ExecutionPlan 完整数据
  └── {planId}/
      ├── step-{stepId}.log  # 每步的详细执行日志
      └── artifacts/         # 步骤产出物
```

### 6.2 模板存储

```
~/.equality/templates/
  ├── index.json             # 模板索引（ID → 元信息）
  ├── embeddings.bin         # 向量索引（用于快速检索）
  └── {templateId}.json      # 模板详情
```

**索引策略**：启动时加载 `index.json` 到内存，向量检索使用简单的余弦相似度（模板数量 < 1000，无需专门的向量数据库）。

---

## 7. 与现有架构的集成

### 7.1 Runner 层扩展

当前的 `runAttempt()` 只处理单 session 单轮。需要在上层增加：

```
用户输入
    │
    ▼
TaskClassifier（简单 or 复杂？）
    │
    ├─ simple ──► runAttempt()    [现有路径，不变]
    │
    └─ complex ─► TaskPlanner
                    │
                    ▼
                 StepRunner ──► runAttempt() × N步
                    │
                    ▼
                 TemplateExtractor
```

### 7.2 Session 层扩展

需要为 `Session` 类型增加层级支持：

```typescript
interface Session {
  // ... 现有字段
  parentPlanId?: string        // 所属计划 ID
  stepId?: string              // 所属步骤 ID  
  role?: AgentRole             // 该 session 的 agent 角色
}
```

### 7.3 System Prompt 层扩展

`buildSystemPrompt()` 需要支持角色注入：

```typescript
function buildSystemPrompt(options?: {
  role?: AgentRole
  skills?: string[]           // 指定注入的 skill 子集
  previousStepSummary?: string // 前序步骤的结果摘要
}): string
```

---

## 8. Phase 分配

| 组件 | Phase | 理由 |
|------|-------|------|
| TaskClassifier | Phase 2+ | 只需 LLM 分类，依赖 tool loop |
| ProgressTracker SSE | Phase 2 | 可先做单步进度，Phase 4 扩展为多步 |
| Compaction 多步集成 | Phase 3 | 长任务多步执行需要对话压缩，避免 token 爆炸 |
| Context Guard 步骤级 | Phase 3 | 工具密集型步骤需要上下文预算保护 |
| Loop Detection 高级 | Phase 3 | 多步场景更容易触发乒乓/轮询模式，需要高级检测器 |
| TaskPlanner | Phase 4 | 需要 session 层级、多 agent 角色 |
| StepRunner | Phase 4 | 需要 session 层级、步骤编排循环 |
| WorkflowTemplate 保存 | Phase 5 | 需要 embedding、持久化 |
| TemplateMatch 匹配 | Phase 5 | 需要向量检索 |

> **Phase 3 是 Phase 4 的前置条件**：多步任务（Phase 4）中每个步骤可能产生大量工具调用结果，
> 若没有 Compaction 和 Context Guard（Phase 3），步骤 session 的上下文很容易超出 token 预算。
> Phase 3 的上下文管理能力是多步编排稳定运行的基础设施。

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| LLM 拆分质量不稳定 | 步骤粒度忽大忽小 | Few-shot 示例 + 拆分后 LLM 自检 |
| 模板匹配误命中 | 用错误模板执行任务 | 二阶段匹配（向量粗筛 + LLM 精排） |
| 步骤间上下文丢失 | 后续步骤不知道前面做了什么 | 每步结果摘要自动注入 |
| 长任务中途崩溃 | 已完成的步骤成果丢失 | 每步完成后立即持久化 |
| Token 消耗超预期 | 多步骤 × 多 agent 倍增 | 模板复用 + 结果摘要而非全文传递 |

---

## 10. 与 OpenClaw 的设计对比

| 维度 | OpenClaw | Equality |
|------|----------|----------|
| 编排策略 | 纯 LLM 涌现（sessions_spawn） | **LLM 规划 + 结构化执行** |
| 任务拆分 | 每次重新推理 | **首次推理 → 模板化 → 复用** |
| 执行隔离 | 子代理 session + 绑定 | 计划步骤 session + 角色 |
| 复用机制 | 无 | **WorkflowTemplate + 语义匹配** |
| 进度可见性 | 仅 push-based 完成通知 | **SSE 实时进度流** |
| 失败恢复 | 子代理独立重试 | **步骤级断点续执** |
| Token 优化 | 无显式优化 | **模板跳过拆分 + 摘要传递** |

这是 Equality 相对于 OpenClaw 的**核心差异化特性**之一。
