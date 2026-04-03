# Delta Spec: Phase E4 — cron 任务注册集成

> 本 Delta 覆盖 cron 触发器与 TaskRegistry 的集成。
>
> 依赖: Phase E1 的 `tasks/spec.md`（TaskRegistry 已实现）

---

## MODIFIED Requirements

### Requirement: cron 触发时注册任务记录（修改）

**原规格（Phase E1）**：
系统 SHALL 在 cron 触发前注册 `runtime='cron'` 任务（已在 tasks/spec.md 中定义为 ADDED，但当时尚未实现集成）。

**本次实现说明**：
E4 在 `index.ts` 的 `runAgentTurn` 回调内实现此集成。不修改 `CronScheduler` 接口，而是通过闭包直接访问 `taskRegistry`。

**完整行为规格**：
- `runAgentTurn` 调用开始时 MUST 调用 `taskRegistry.register({ runtime: 'cron', ... })`
- 注册后 MUST 立即 `taskRegistry.transition(task.id, 'running')`
- `runAttempt` 成功完成时 MUST `taskRegistry.transition(task.id, 'succeeded', summary)`
- `runAttempt` 抛出非 AbortError 异常时 MUST `taskRegistry.transition(task.id, 'failed', errMsg)`
- `runAttempt` 被用户中止（AbortError）时 MUST `taskRegistry.transition(task.id, 'cancelled')`

任务 `title` 格式：`cron: ${jobId ?? sessionKey}`

约束：
- 任务注册和状态迁移失败 MUST NOT 影响 cron 任务的正常执行
- 即使 taskRegistry 出错，`runAttempt` 仍应继续执行

#### Scenario: cron 任务完整生命周期
- GIVEN CronScheduler 触发一个 sessionKey='cron-daily' 的任务
- WHEN `runAgentTurn` 回调执行
- THEN TaskRegistry 中依次出现：
  - `{ id: "task_xxx", runtime: 'cron', state: 'queued' }`
  - `{ ..., state: 'running' }`
  - `{ ..., state: 'succeeded', summary: "..." }`

#### Scenario: cron 任务执行失败
- GIVEN `runAttempt` 因 LLM 错误抛出异常
- WHEN 异常被 `runAgentTurn` 的 try/catch 捕获
- THEN TaskRegistry 中该任务状态更新为 `failed`
- AND `lastError` 包含错误信息摘要

#### Scenario: cron 任务被取消
- GIVEN cron 任务执行期间，AbortController 被触发
- WHEN `runAttempt` 抛出 AbortError
- THEN TaskRegistry 中该任务状态更新为 `cancelled`
- AND 非 `failed`

---

## ADDED Requirements

### Requirement: cron 任务可通过 /tasks API 查询

系统 SHALL 允许通过 `GET /tasks?runtime=cron` 查询所有历史 cron 任务记录。

约束：
- cron 任务持久化到 `JsonTaskStore`，Gateway 重启后仍可查询
- cron 任务记录的 `sessionKey` 字段 SHOULD 对应触发该任务的会话

#### Scenario: 查询 cron 历史任务
- GIVEN Gateway 已执行过 3 次 cron 任务
- WHEN 调用 `GET /tasks?runtime=cron`
- THEN 返回 3 条记录，每条均有 `runtime: 'cron'` 字段

---

## REMOVED Requirements

（无）
