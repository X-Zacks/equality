# Delta Spec: Subagent Orphan Recovery

> Phase H1 (GAP-17) — 子 Agent 孤儿恢复  
> 修改领域：tasks（TaskRegistry 状态迁移）、agent（SubagentManager 恢复逻辑）

---

## MODIFIED Requirements

### Requirement: 状态迁移表扩展

> 修改 `tasks/types.ts` 中的 `VALID_TRANSITIONS`

系统 MUST 在现有状态迁移表中新增 `lost → queued` 迁移路径，允许孤儿任务被重新排队执行。

```
lost → queued   （孤儿恢复）
```

（之前 `lost` 为终止态，不可迁移。现在允许恢复路径。）

#### Scenario: lost 任务重新排队
- GIVEN 一个 `lost` 状态的子任务
- WHEN `transition(taskId, 'queued')` 被调用
- THEN 状态成功迁移为 `queued`
- AND `finishedAt` 保留（记录首次中断时间）

#### Scenario: 其他终止态仍不可迁移
- GIVEN 一个 `succeeded` 状态的任务
- WHEN `transition(taskId, 'queued')` 被调用
- THEN 抛出 `Invalid transition` 错误

---

## ADDED Requirements

### Requirement: 孤儿恢复函数

系统 MUST 提供 `recoverOrphanTasks()` 函数，扫描并恢复 `lost` 状态的子任务。

```typescript
interface OrphanRecoveryResult {
  recovered: number   // 成功恢复的任务数
  failed: number      // 恢复失败的数量
  skipped: number     // 跳过的数量（已恢复过 / 非子任务）
}

function recoverOrphanTasks(params: {
  taskRegistry: TaskRegistry
  spawnFn: (task: TaskRecord) => Promise<boolean>
}): Promise<OrphanRecoveryResult>
```

**恢复逻辑**：
1. 扫描所有 `lost` 状态且 `runtime === 'subagent'` 的任务
2. 对每个孤儿任务：
   - 构建合成 resume 消息（包含原始任务标题和最后状态）
   - 调用 `spawnFn` 重新执行
   - 成功 → `lost → queued → running`
   - 失败 → 保持 `lost`，记录错误
3. 非 `subagent` 运行时的 `lost` 任务跳过（cron/manual）

#### Scenario: 恢复子 Agent 孤儿
- GIVEN TaskRegistry 中有 2 个 `lost` 状态的 subagent 任务
- AND 1 个 `lost` 状态的 cron 任务
- WHEN `recoverOrphanTasks()` 被调用
- THEN 2 个 subagent 任务被重新排队
- AND cron 任务被跳过
- AND 返回 `{ recovered: 2, failed: 0, skipped: 1 }`

#### Scenario: 恢复失败不影响其他
- GIVEN 3 个 `lost` subagent 任务
- AND 第 2 个的 spawnFn 抛出异常
- WHEN `recoverOrphanTasks()` 被调用
- THEN 第 1、3 个成功恢复
- AND 第 2 个保持 `lost`
- AND 返回 `{ recovered: 2, failed: 1, skipped: 0 }`

---

### Requirement: 合成 Resume 消息

系统 MUST 为孤儿任务构建合成 resume 消息，包含原始任务上下文。

```typescript
function buildResumeMessage(task: TaskRecord): string
```

消息格式 SHALL 包含：
- 系统前缀：`[System] 你的上一轮执行被服务重启中断。`
- 原始任务标题（截断到 2000 字符）
- 继续指令：`请从上次停下的地方继续。`

#### Scenario: 构建 resume 消息
- GIVEN 一个标题为 "分析项目代码结构" 的 lost 任务
- WHEN `buildResumeMessage(task)` 被调用
- THEN 返回包含 "[System]" 前缀的消息
- AND 包含 "分析项目代码结构"
- AND 包含 "继续" 关键字

---

### Requirement: 延迟调度与重试

系统 SHOULD 提供 `scheduleOrphanRecovery()` 函数，在启动后延迟执行恢复，并支持指数退避重试。

```typescript
function scheduleOrphanRecovery(params: {
  taskRegistry: TaskRegistry
  spawnFn: (task: TaskRecord) => Promise<boolean>
  delayMs?: number       // 首次延迟（默认 3000ms）
  maxRetries?: number    // 最大重试次数（默认 3）
}): void
```

- 首次延迟：默认 3s（等系统就绪）
- 失败重试：指数退避（delay × 2）
- 最大重试：3 次
- 已恢复的任务不重复恢复（幂等保护）

#### Scenario: 首次恢复失败后重试
- GIVEN 第一次恢复有 1 个 failed
- WHEN 指数退避触发第二次尝试
- THEN 延迟为 6s（3s × 2）
- AND 只处理仍为 lost 状态的任务

#### Scenario: 所有任务恢复成功
- GIVEN 第一次恢复全部成功（failed = 0）
- THEN 不触发重试
