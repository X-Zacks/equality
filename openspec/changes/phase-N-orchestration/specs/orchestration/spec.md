# Delta Spec: Orchestration — Plan DAG 编排引擎

> 新增领域。Phase N 核心模块，提供多角色 Agent 协作的 DAG 调度能力。

---

## ADDED Requirements

### Requirement: Plan 类型系统

系统 SHALL 提供完整的 Plan 类型定义用于描述多角色 Agent 任务编排。

**PlanNode** MUST 包含以下字段：
- `id: string` — UUID，全局唯一
- `role: AgentRole` — 执行角色（`supervisor | architect | developer | tester | reviewer`）
- `task: string` — 任务描述
- `dependsOn: string[]` — 前置节点 ID 列表
- `status: PlanNodeStatus` — 8 种状态：`pending | ready | running | completed | failed | exhausted | skipped | cancelled`
- `retryCount: number` — 已重试次数（初始 0）
- `maxRetries: number` — 最大重试次数（默认 2）
- `timeoutMs: number` — 单节点超时（默认 300000ms = 5min）
- `priority: number` — 优先级（0=最高），就绪节点按此排序
- `assignedTaskId?: string` — 映射到 TaskRegistry 的 taskId
- `output?: string` — 产出路径/摘要
- `metadata?: Record<string, unknown>` — 扩展元数据

**PlanGraph** MUST 包含以下字段：
- `id: string` — UUID
- `title: string` — Plan 标题
- `nodes: PlanNode[]` — 所有节点
- `createdAt: number` — 创建时间戳
- `updatedAt: number` — 最后更新时间戳
- `globalTimeoutMs: number` — 全局超时（默认 3600000ms = 1h）
- `maxConcurrent: number` — 最大并行节点数（默认 3）
- `maxTotalNodes: number` — 节点数上限（默认 50）

**PlanExecutionResult** MUST 包含以下字段：
- `planId: string`
- `status: 'completed' | 'partial' | 'failed' | 'cancelled' | 'timed_out'`
- `completedNodes: number`
- `totalNodes: number`
- `failedNodes: string[]`
- `durationMs: number`
- `summary: string`

#### Scenario: 类型完整性
- GIVEN PlanNode、PlanGraph、PlanExecutionResult 类型定义
- WHEN 编译 TypeScript
- THEN 所有字段类型检查通过
- AND AgentRole 仅允许 5 种角色
- AND PlanNodeStatus 仅允许 8 种状态

---

### Requirement: DAG 构建与验证

系统 SHALL 提供 `PlanDAG` 类用于构建和操作任务依赖图。

PlanDAG MUST 支持以下操作：

| 操作 | 说明 | 复杂度 |
|------|------|--------|
| `topologicalSort()` | 返回拓扑排序后的节点 ID | O(V+E) |
| `detectCycle()` | Kahn 算法检测环，返回环路径或 null | O(V+E) |
| `getReadyNodes()` | 返回所有前置已完成且自身 pending 的节点 | O(V) |
| `getSchedulableNodes(running, max)` | 就绪节点中不超过并发限制的 | O(V) |
| `isTerminated()` | 所有节点均在终止态 | O(V) |
| `criticalPath()` | 最长依赖链（用于进度估算） | O(V+E) |
| `getDescendants(nodeId)` | 获取所有后代节点（级联取消用） | O(V+E) |
| `validate()` | 无环 + 无孤立依赖 + 无自引用 + 节点数不超限 | O(V+E) |

#### Scenario: 无环 DAG 拓扑排序
- GIVEN 一个包含 4 个节点的 DAG: A→B→D, A→C→D
- WHEN 调用 `topologicalSort()`
- THEN 返回合法拓扑序（A 在 B/C 之前，B/C 在 D 之前）

#### Scenario: 检测环
- GIVEN 一个包含环的图: A→B→C→A
- WHEN 调用 `detectCycle()`
- THEN 返回环路径 `['A', 'B', 'C', 'A']`（或非 null）

#### Scenario: 就绪节点计算
- GIVEN DAG: A(completed)→B(pending), A→C(pending), D(pending，无依赖)
- WHEN 调用 `getReadyNodes()`
- THEN 返回 [B, C, D]

#### Scenario: 并发限制调度
- GIVEN 3 个就绪节点，当前 1 个 running，maxConcurrent=2
- WHEN 调用 `getSchedulableNodes(1, 2)`
- THEN 返回 1 个节点（2 - 1 = 1 个名额）
- AND 返回 priority 最高（数值最小）的节点

#### Scenario: 关键路径
- GIVEN DAG: A→B→D (耗时 3), A→C→D (耗时 2)
- WHEN 调用 `criticalPath()`
- THEN 返回 [A, B, D]（最长路径）

#### Scenario: 后代查询
- GIVEN DAG: A→B→C, A→D
- WHEN 调用 `getDescendants('A')`
- THEN 返回 Set{B, C, D}

#### Scenario: 验证——自引用
- GIVEN 节点 A 的 dependsOn 包含 'A'
- WHEN 调用 `validate()`
- THEN 返回 `{ valid: false, errors: ['Node A depends on itself'] }`

#### Scenario: 验证——孤立依赖
- GIVEN 节点 B 依赖不存在的节点 'X'
- WHEN 调用 `validate()`
- THEN 返回 `{ valid: false, errors: ['Node B depends on unknown node X'] }`

#### Scenario: 验证——节点数超限
- GIVEN maxTotalNodes = 5，但 graph 有 6 个节点
- WHEN 调用 `validate()`
- THEN 返回 `{ valid: false, errors: ['Node count 6 exceeds limit 5'] }`

---

### Requirement: Plan 执行器

系统 SHALL 提供 `PlanExecutor` 类实现 DAG 调度循环。

PlanExecutor MUST 实现以下行为：

**核心调度循环**：
1. 计算就绪节点
2. 按优先级选择可调度节点（不超过 maxConcurrent）
3. 对每个节点：创建角色配置 → `spawnParallel()` 启动子 Agent
4. 注册完成回调：成功→completed，失败→重试或exhausted，超时→failed
5. 等待任意节点完成（事件驱动）
6. 更新 DAG 状态 → 触发进度回调
7. 循环直到所有节点终止或全局超时/取消

**控制操作**：
- `pause()` — 停止调度新节点，等待运行中完成
- `resume()` — 继续调度
- `cancel(reason?)` — abort 所有运行中，级联取消下游
- `retryFailed(nodeId)` — 将 failed/exhausted 重置为 pending
- `skipNode(nodeId)` — 标记 skipped，下游可继续（视 skipped 为"完成"）
- `steerNode(nodeId, message)` — 向运行中子 Agent 注入消息

#### Scenario: 串行执行
- GIVEN DAG: A→B→C（严格串行）
- WHEN `execute(plan)` 被调用
- THEN A 先执行并完成，然后 B 执行，然后 C 执行
- AND 结果 status = 'completed'

#### Scenario: 并行执行
- GIVEN DAG: A→B, A→C（B/C 无依赖关系）
- WHEN A 完成后
- THEN B 和 C 同时启动（并行）
- AND 总耗时接近 max(B耗时, C耗时) 而非 sum

#### Scenario: 节点失败重试
- GIVEN 节点 B 的 maxRetries=2
- WHEN B 第一次执行失败
- THEN B 自动重试（retryCount 从 0→1）
- WHEN B 第二次仍然失败
- THEN B 再次重试（retryCount 从 1→2）
- WHEN B 第三次仍然失败
- THEN B 状态变为 'exhausted'（不再重试）

#### Scenario: 节点超时
- GIVEN 节点 B 的 timeoutMs=1000
- WHEN B 执行超过 1000ms
- THEN B 的子 Agent 被 abort
- AND B 状态变为 'failed'（可重试）
- AND detail 包含超时信息

#### Scenario: 全局超时
- GIVEN plan 的 globalTimeoutMs=5000
- WHEN 总执行时间超过 5000ms
- THEN 所有运行中节点被 abort
- AND 结果 status = 'timed_out'

#### Scenario: 暂停和恢复
- GIVEN DAG 正在执行，节点 A 运行中，B 就绪
- WHEN `pause()` 被调用
- THEN A 继续运行直到完成
- AND B 不会被调度
- WHEN `resume()` 被调用
- THEN B 开始调度

#### Scenario: 取消
- GIVEN DAG 正在执行，节点 A 和 B 运行中
- WHEN `cancel('user request')` 被调用
- THEN A 和 B 被 abort
- AND 所有 pending 节点变为 'cancelled'
- AND 结果 status = 'cancelled'

#### Scenario: 跳过节点
- GIVEN DAG: A→B→C，B 失败
- WHEN `skipNode('B')` 被调用
- THEN B 状态变为 'skipped'
- AND C 变为就绪（skipped 视为完成）

#### Scenario: 进度回调
- GIVEN onPlanProgress 回调已注册
- WHEN 任意节点状态变化
- THEN 回调被触发
- AND PlanProgress 包含 completedNodes、totalNodes、runningNodes、failedNodes

#### Scenario: 空 Plan
- GIVEN 一个没有节点的 PlanGraph
- WHEN `execute(plan)` 被调用
- THEN 立即返回 status='completed'，completedNodes=0，totalNodes=0

#### Scenario: 单节点 Plan
- GIVEN 只有一个节点 A（无依赖）
- WHEN `execute(plan)` 被调用
- THEN A 执行并完成
- AND 结果包含 A 的 summary

---

### Requirement: Plan 序列化

系统 SHALL 提供 `PlanSerializer` 实现 PlanGraph 与 tasks.md 的双向转换。

tasks.md 格式约定：
```markdown
# Plan: {title}

> Status: {status} | Completed: {n}/{total} | Running: {n}

## Phase 1: {phase_title}
- [x] {nodeId} [{role}] {task_description} ✅
  - depends: {dep1}, {dep2}
  - output: {output_path}
- [ ] {nodeId} [{role}] {task_description} 🔄
  - depends: {dep1}
```

#### Scenario: Markdown → PlanGraph
- GIVEN 一个合法的 tasks.md 字符串
- WHEN `PlanSerializer.fromMarkdown(md)` 被调用
- THEN 返回 PlanGraph，节点数量与 Markdown 中的任务项一致
- AND 每个节点的 role、task、dependsOn 正确解析

#### Scenario: PlanGraph → Markdown
- GIVEN 一个有 3 个节点的 PlanGraph
- WHEN `PlanSerializer.toMarkdown(plan)` 被调用
- THEN 返回的 Markdown 包含 `# Plan:` 标题
- AND 每个节点一行，包含 `[x]` 或 `[ ]` 标记
- AND 包含 depends 和 output 信息
- AND 包含状态 emoji（✅🔄⏳❌）

#### Scenario: 往返一致性
- GIVEN 一个 PlanGraph
- WHEN `fromMarkdown(toMarkdown(plan))` 被调用
- THEN 结果与原始 plan 的节点数量、依赖关系、状态一致

#### Scenario: JSON 序列化
- GIVEN 一个 PlanGraph
- WHEN `fromJSON(toJSON(plan))` 被调用
- THEN 结果与原始 plan 深度相等

---

### Requirement: Parity Audit [借鉴 claw-code parity_audit.py]

系统 SHALL 提供 `ParityAuditor` 类，自动检测 Plan 执行结果与 OpenSpec 规格的一致性。

ParityAuditResult MUST 包含：
- `planId: string`
- `specCoverage: { covered: number; total: number }` — Spec 需求覆盖率
- `testCoverage: { passing: number; total: number }` — 测试通过率
- `missingSpecs: string[]` — 未被实现覆盖的 Spec requirement
- `missingTests: string[]` — 缺少测试的模块
- `uncommittedChanges: string[]` — 未提交的文件变更
- `report: string` — Markdown 格式报告

#### Scenario: 完全覆盖
- GIVEN 所有 Spec requirement 都有对应的代码实现
- AND 所有模块都有测试
- WHEN `audit()` 被调用
- THEN specCoverage.covered === specCoverage.total
- AND missingSpecs 为空

#### Scenario: 部分覆盖
- GIVEN 5 个 Spec requirement，只有 3 个实现
- WHEN `audit()` 被调用
- THEN specCoverage = { covered: 3, total: 5 }
- AND missingSpecs 包含 2 个缺失的 requirement 名称

#### Scenario: 报告格式
- GIVEN 一个审计结果
- WHEN 读取 `report` 字段
- THEN 包含 `# Parity Audit` 标题
- AND 包含覆盖率数字
- AND 包含缺失项列表

---

### Requirement: History Log [借鉴 claw-code history.py]

系统 SHALL 提供 `HistoryLog` 类，为 Plan 执行记录结构化历史。

HistoryEvent MUST 包含：
- `timestamp: number` — 时间戳
- `title: string` — 事件标题
- `detail: string` — 事件详情
- `nodeId?: string` — 关联节点 ID
- `role?: AgentRole` — 关联角色

HistoryLog MUST 支持：
- `add(title, detail, opts?)` — 添加事件
- `asMarkdown()` — 导出为 Markdown
- `toJSON()` — 序列化为 JSON

#### Scenario: 事件记录
- GIVEN 一个空的 HistoryLog
- WHEN 添加 3 个事件
- THEN events 数组长度为 3
- AND 每个事件的 timestamp 自动设置

#### Scenario: Markdown 导出
- GIVEN 一个有 2 个事件的 HistoryLog
- WHEN 调用 `asMarkdown()`
- THEN 返回包含 `# Plan History` 标题
- AND 每个事件一行（包含 title 和 detail）

#### Scenario: JSON 往返
- GIVEN 一个 HistoryLog
- WHEN `JSON.parse(log.toJSON())` 
- THEN 事件数组与原始一致
