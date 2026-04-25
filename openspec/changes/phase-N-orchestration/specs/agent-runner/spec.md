# Delta Spec: Agent Runner — SubagentManager 深度增强

> 修改 `openspec/specs/agent-runner/spec.md` 中的子 Agent 管理能力。

---

## MODIFIED Requirements

### Requirement: 子 Agent 深度限制

（原文：V1 仅允许 depth=1，禁止孙子 Agent）

系统 SHALL 支持可配置的子 Agent 深度限制。

SubagentManagerConfig MUST 包含：
- `maxDepth: number` — 最大嵌套深度（默认 3）
- `maxTotalAgents: number` — 全局子 Agent 数量上限（默认 20）
- `maxConcurrent: number` — 并行运行子 Agent 上限（默认 5）

深度计算：
- 主 Agent = depth 0
- Supervisor spawn 的角色 Agent = depth 1
- 角色 Agent spawn 的子任务 = depth 2
- 最深可达 maxDepth - 1

#### Scenario: depth=2 三层嵌套
- GIVEN maxDepth=3
- WHEN Supervisor(depth=0) spawn 角色Agent(depth=1)
- AND 角色Agent(depth=1) spawn 子任务(depth=2)
- THEN 两层 spawn 均成功

#### Scenario: 超过深度限制
- GIVEN maxDepth=3
- WHEN depth=2 的 Agent 尝试 spawn 子Agent(depth=3)
- THEN spawn 返回 `{ success: false, summary: '...' }`
- AND 不创建子 Agent

#### Scenario: 全局数量限制
- GIVEN maxTotalAgents=3，已有 3 个活跃子 Agent
- WHEN 尝试 spawn 第 4 个
- THEN spawn 返回 `{ success: false, summary: '达到全局子Agent上限' }`

---

## ADDED Requirements

### Requirement: 并行 spawn

系统 SHALL 提供 `SubagentManager.spawnParallel()` 方法，并行启动多个子 Agent。

```typescript
interface ParallelSpawnItem {
  params: SpawnSubtaskParams
  onComplete?: (result: SubtaskResult) => void
}

async spawnParallel(
  parentSessionKey: string,
  items: ParallelSpawnItem[],
  opts?: { depth?: number; maxConcurrent?: number }
): Promise<SubtaskResult[]>
```

行为要求：
- MUST 使用 `Promise.allSettled()` 确保不因单个失败而全部中断
- MUST 内部维护并发信号量，不超过 `maxConcurrent`
- MUST 在每个子 Agent 完成后立即触发其 `onComplete` 回调
- MUST 返回所有子 Agent 的结果数组（顺序与 items 一致）

#### Scenario: 3 个并行 Agent
- GIVEN 3 个 ParallelSpawnItem
- WHEN `spawnParallel()` 被调用
- THEN 3 个子 Agent 同时启动
- AND 返回 3 个 SubagentResult
- AND 每个结果对应正确的 item

#### Scenario: 并发限制
- GIVEN 5 个 items，maxConcurrent=2
- WHEN `spawnParallel()` 被调用
- THEN 最多同时运行 2 个子 Agent
- AND 一个完成后，下一个才开始

#### Scenario: 部分失败
- GIVEN 3 个 items，第 2 个会失败
- WHEN `spawnParallel()` 被调用
- THEN 第 1、3 个成功完成
- AND 第 2 个返回 `{ success: false }`
- AND 不影响其他 Agent

#### Scenario: onComplete 回调
- GIVEN items 中有 onComplete 回调
- WHEN 对应子 Agent 完成
- THEN onComplete 被调用，参数为 SubagentResult
- AND 调用时机是该 Agent 完成时（不等其他 Agent）

#### Scenario: 空 items
- GIVEN items 为空数组
- WHEN `spawnParallel()` 被调用
- THEN 立即返回空数组

---

### Requirement: 子任务模型继承

子任务 SHALL 继承父会话用户选择的模型，而非走自动路由。

`SpawnSubtaskParams` MUST 包含：
```typescript
interface SpawnSubtaskParams {
  prompt: string
  goal?: string
  allowedTools?: string[]
  /** 父会话 Provider 信息，子任务继承使用 */
  parentProviderInfo?: { providerId: string; modelId: string }
  /** 0 或 undefined 表示不限制，受全局安全阀保护 */
  timeoutMs?: number
}
```

`SubtaskManagerDeps` MUST 包含 `createProvider?(providerId, modelId): LLMProvider | null` 回调。

`executeChild` 内部 MUST：
1. 若 `params.parentProviderInfo` 存在，调用 `createProvider()` 获取 Provider 实例
2. 将该 Provider 通过 `runAttempt({ provider })` 传入，覆盖自动路由

#### Scenario: 子任务继承父模型
- GIVEN 父会话使用 `claude/claude-opus-4`
- WHEN `spawn({ parentProviderInfo: { providerId: 'claude', modelId: 'claude-opus-4' } })` 被调用
- THEN 子任务的 `runAttempt` 调用包含 `{ provider: ClaudeProvider(claude-opus-4) }`
- AND `routeModel` 的自动路由**不**被激活

#### Scenario: 无 parentProviderInfo 时回退到自动路由
- GIVEN `parentProviderInfo` 为 undefined
- WHEN `spawn()` 被调用
- THEN 子任务的 `runAttempt` 不传 `provider`，走 `routeModel` 自动路由

---

### Requirement: 子任务超时全局安全阀

`SubtaskManager` SHALL 提供两层超时保护：

1. **任务级超时**：`timeoutMs > 0` 时对单个子任务生效
   - `timeoutMs = 0` 或 `undefined` 表示对该任务不设超时
2. **全局安全阀**：`MAX_SUBTASK_LIFETIME_MS = 30 * 60 * 1000`（固定常量）
   - `SubtaskManager` 创建时 MUST 启动 housekeeping 定时器（每 5 分钟执行一次）
   - 超过 `MAX_SUBTASK_LIFETIME_MS` 的活跽子任务 MUST 被强制 abort 并转移到 `timed_out` 状态
   - housekeeping 必须记录 warning 日志

#### Scenario: 任务级超时
- GIVEN 子任务 timeoutMs=5000
- WHEN 任务运行超过 5 秒
- THEN 任务被 abort，状态变为 `timed_out`

#### Scenario: 不限制超时（默认）
- GIVEN 子任务创建时未传 timeout_seconds（或传 0）
- WHEN 子任务运行 20 分钟
- THEN 任务**不**被任务级超时终止
- AND 任务继续运行（尚未触发 30 分钟安全阀）

#### Scenario: 全局安全阀清理
- GIVEN 子任务创建后已运行超过 30 分钟
- WHEN housekeeping 定时器执行
- THEN 该子任务被强制 abort
- AND 状态变为 `timed_out`
- AND 记录 warning 日志

---

### Requirement: `subtask_spawn_parallel` 工具

系统 SHALL 提供 `subtask_spawn_parallel` LLM 工具，允许 LLM 以单个工具调用启动多个并行子任务。

输入参数：
- `tasks`（必需）：JSON 数组字符串，每项包含 `{ prompt, goal?, allowed_tools? }`
- `timeout_seconds`（可选）：单个子任务超时，默认 0（不限制）

约束：
- 最大支持 10 个并行任务
- MUST 调用 `SubtaskManager.spawnParallel()`
- MUST 继承父会话模型（`ctx.provider`）
- 返回所有子任务的汇总结果：`{ totalTasks, succeeded, failed, results[] }`

#### Scenario: 并行启动 3 个任务
- GIVEN tasks = [{...}, {...}, {...}]
- WHEN `subtask_spawn_parallel` 被调用
- THEN 3 个子任务同时启动
- AND 返回 `{ totalTasks: 3, succeeded: N, failed: M, results: [...] }`

#### Scenario: 超出数量限制
- GIVEN tasks.length = 11
- WHEN `subtask_spawn_parallel` 被调用
- THEN 返回 `isError: true`，说明最大 10 个

---

### Requirement: 级联终止

系统 SHALL 支持子 Agent 的级联终止。

```typescript
kill(taskId: string, opts?: { cascade?: boolean }): void
```

当 `cascade=true` 时：
- MUST 查找 TaskRegistry 中所有 `parentTaskId === taskId` 的任务
- MUST 递归终止所有后代子 Agent
- MUST 按深度优先顺序终止（先终止最深层）

#### Scenario: 级联终止
- GIVEN Agent A spawn 了 B 和 C，B 又 spawn 了 D
- WHEN `kill('A', { cascade: true })` 被调用
- THEN D 先被终止
- THEN B 和 C 被终止
- THEN A 被终止

#### Scenario: 非级联终止（默认）
- GIVEN Agent A spawn 了 B
- WHEN `kill('A')` 被调用（无 cascade）
- THEN 只有 A 被终止
- AND B 继续运行（变为孤儿，由 orphan recovery 处理）

#### Scenario: 终止不存在的任务
- GIVEN taskId 不存在
- WHEN `kill(taskId)` 被调用
- THEN 不抛出异常（静默忽略）

---

### Requirement: spawn 完成事件 [借鉴 claw-code TranscriptStore.flush]

系统 SHALL 在子 Agent 完成时自动触发事件，支持调用方注册 `onComplete` 回调。

原有 `spawn()` 方法增强：
```typescript
async spawn(
  parentSessionKey: string,
  params: SpawnSubtaskParams,
  opts?: {
    depth?: number
    onComplete?: (result: SubtaskResult) => void
  }
): Promise<SubtaskResult>
```

#### Scenario: 正常完成回调
- GIVEN spawn 时传入了 onComplete
- WHEN 子 Agent 成功完成
- THEN onComplete 被调用，result.success = true

#### Scenario: 失败完成回调
- GIVEN spawn 时传入了 onComplete
- WHEN 子 Agent 执行失败
- THEN onComplete 被调用，result.success = false
