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
  params: SpawnSubagentParams
  onComplete?: (result: SubagentResult) => void
}

async spawnParallel(
  parentSessionKey: string,
  items: ParallelSpawnItem[],
  opts?: { depth?: number; maxConcurrent?: number }
): Promise<SubagentResult[]>
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
  params: SpawnSubagentParams,
  opts?: {
    depth?: number
    onComplete?: (result: SubagentResult) => void
  }
): Promise<SubagentResult>
```

#### Scenario: 正常完成回调
- GIVEN spawn 时传入了 onComplete
- WHEN 子 Agent 成功完成
- THEN onComplete 被调用，result.success = true

#### Scenario: 失败完成回调
- GIVEN spawn 时传入了 onComplete
- WHEN 子 Agent 执行失败
- THEN onComplete 被调用，result.success = false
