# Tasks: Phase E — 多 Agent 与任务

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)
>
> 现有代码基线：
> - `agent/runner.ts`: 已有单次 `runAttempt()`、`AbortSignal`、steering queue、tool loop
> - `providers/fallback.ts`: 有基础 fallback，但无错误分类与策略矩阵
> - `cron` 已可触发 agent turn，但无统一 `taskId` / 状态中心
> - `index.ts`: 已有 SSE / HTTP 入口，可继续注入 tasks/subagent 控制面
> - `context-engine/spec.md`: 已预留 `prepareSubagentSpawn?()` 语义，但实现未落地

---

## 1. E1 后台任务注册中心（GAP-9）

### 1.1 类型与状态机（`packages/core/src/tasks/types.ts`）

- [ ] 1.1.1 定义 `TaskRuntime`（`manual` / `cron` / `subagent`）
- [ ] 1.1.2 定义 `TaskState`（`queued` / `running` / `succeeded` / `failed` / `timed_out` / `cancelled` / `lost`）
- [ ] 1.1.3 定义 `TaskRecord`、`TaskNotificationPolicy`、`TaskSummary`
- [ ] 1.1.4 明确合法状态迁移表

### 1.2 注册中心（`packages/core/src/tasks/registry.ts`）

- [ ] 1.2.1 实现 `registerTask()`
- [ ] 1.2.2 实现 `transitionTask()`（非法迁移抛错）
- [ ] 1.2.3 实现 `getTask()` / `listTasks()`
- [ ] 1.2.4 实现 `cancelTask()` / `steerTask()`
- [ ] 1.2.5 实现任务事件广播（state_changed / finished / cancelled）

### 1.3 持久化（`packages/core/src/tasks/store.ts`）

- [ ] 1.3.1 JSON 快照读写
- [ ] 1.3.2 Gateway 启动时恢复任务快照
- [ ] 1.3.3 上次异常退出仍为 `running` 的任务标记为 `lost`
- [ ] 1.3.4 debounce 写盘，避免频繁 IO

### 1.4 集成（`packages/core/src/index.ts`, `cron/*`, `agent/runner.ts`）

- [ ] 1.4.1 启动时创建 `TaskRegistry`
- [ ] 1.4.2 `cron` 触发前注册 `runtime='cron'` 任务
- [ ] 1.4.3 `runAttempt()` 可选接收 `taskId`
- [ ] 1.4.4 运行开始/结束/失败时回写任务状态
- [ ] 1.4.5 暴露 HTTP API：`GET /tasks`, `GET /tasks/:id`, `POST /tasks/:id/steer`, `DELETE /tasks/:id`

### 1.5 单元测试（`packages/core/src/__tests__/task-registry.test.ts`）

- [ ] 1.5.1 T27 — 注册任务后初始状态为 `queued`
- [ ] 1.5.2 T28 — 合法迁移：`queued → running → succeeded`
- [ ] 1.5.3 T29 — 非法迁移被拒绝
- [ ] 1.5.4 T30 — 启动恢复时 `running` → `lost`
- [ ] 1.5.5 T31 — `cancelTask()` 将任务置为 `cancelled`
- [ ] 1.5.6 T32 — `steerTask()` 将消息投递到目标任务

---

## 2. E2 Provider Failover 策略增强（GAP-12）

### 2.1 错误分类与策略（`packages/core/src/providers/failover-policy.ts`）

- [ ] 2.1.1 定义 `FailoverReason` 与 `FailoverDecision`
- [ ] 2.1.2 实现 `classifyProviderError(err)`
- [ ] 2.1.3 实现策略矩阵：rate_limit / overloaded / auth / billing / network / timeout / fatal
- [ ] 2.1.4 增加 provider 冷却、探测与跳过逻辑

### 2.2 thinking 渐进降级（`packages/core/src/providers/fallback.ts` 或新模块）

- [ ] 2.2.1 对支持 thinking 的模型增加等级降级逻辑
- [ ] 2.2.2 保证“已有稳定流输出后不再中途切模型”
- [ ] 2.2.3 统一错误消息：所有候选均失败时返回明确原因摘要

### 2.3 Runner 集成（`packages/core/src/agent/runner.ts`）

- [ ] 2.3.1 主 Agent 使用增强版 failover provider
- [ ] 2.3.2 子 Agent / cron 任务复用同一 failover policy
- [ ] 2.3.3 onDelta 增加“模型切换”提示（仅在真正切换时）

### 2.4 单元测试（`packages/core/src/__tests__/failover-policy.test.ts`）

- [ ] 2.4.1 T33 — `AbortError` 不触发 failover
- [ ] 2.4.2 T34 — `429` 触发 provider 冷却并切换候选
- [ ] 2.4.3 T35 — `auth` 错误禁用当前 provider 并切换
- [ ] 2.4.4 T36 — `billing` 错误进入长冷却
- [ ] 2.4.5 T37 — 支持 thinking 的模型按等级降级
- [ ] 2.4.6 T38 — 所有候选失败返回统一错误

---

## 3. E3 多 Agent 编排与子 Agent 系统（GAP-8）

### 3.1 Subagent 管理器（`packages/core/src/agent/subagent-manager.ts`）

- [ ] 3.1.1 实现 `spawnSubagent()`
- [ ] 3.1.2 实现 `listSubagents()`
- [ ] 3.1.3 实现 `steerSubagent()`
- [ ] 3.1.4 实现 `killSubagent()`
- [ ] 3.1.5 记录父子任务 / 会话关系
- [ ] 3.1.6 限制 `depth=1`，禁止孙子 Agent

### 3.2 LLM 工具桥接（`packages/core/src/tools/builtins/subagent-*.ts`）

- [ ] 3.2.1 新增 `subagent_spawn` 工具定义
- [ ] 3.2.2 `subagent_spawn`：创建子任务并返回 taskId
- [ ] 3.2.3 新增 `subagent_list` 工具：列出当前会话相关子任务
- [ ] 3.2.4 新增 `subagent_steer` 工具：向指定子任务注入方向消息
- [ ] 3.2.5 新增 `subagent_kill` 工具：取消指定子任务

### 3.3 Runner / Context 集成（`packages/core/src/agent/runner.ts`, `context/*`）

- [ ] 3.3.1 子 Agent 调用新的 `runAttempt()`，使用独立 child session
- [ ] 3.3.2 子 Agent 结束后将摘要回填到父任务 / 父会话
- [ ] 3.3.3 复用 steering queue 实现 `steer`
- [ ] 3.3.4 复用 `AbortController` 实现 `kill`
- [ ] 3.3.5 如需上下文预处理，接入 `prepareSubagentSpawn?()`

### 3.4 Gateway 集成（`packages/core/src/index.ts`）

- [ ] 3.4.1 注入 `SubagentManager` 到 tool/context/runtime
- [ ] 3.4.2 暴露子任务控制 API（可复用 tasks API）
- [ ] 3.4.3 可选：任务状态 SSE / 事件流

### 3.5 单元测试（`packages/core/src/__tests__/subagent.test.ts`）

- [ ] 3.5.1 T39 — `spawn` 创建子任务并返回 taskId
- [ ] 3.5.2 T40 — 子任务使用独立 sessionKey
- [ ] 3.5.3 T41 — `list` 返回当前父会话相关子任务
- [ ] 3.5.4 T42 — `steer` 将消息投递到运行中子任务
- [ ] 3.5.5 T43 — `kill` 取消任务并迁移到 `cancelled`
- [ ] 3.5.6 T44 — depth>1 被拒绝

---

## 4. 回归验证

- [ ] 4.1 Phase A 回归：`pnpm --filter @equality/core test:phase-A`
- [ ] 4.2 Phase B 回归：`pnpm --filter @equality/core test:lsp`
- [ ] 4.3 Phase C 回归：`pnpm --filter @equality/core test:mutation`
- [ ] 4.4 Phase C 回归：`pnpm --filter @equality/core test:sandbox`
- [ ] 4.5 Phase C 回归：`pnpm --filter @equality/core test:policy`
- [ ] 4.6 Phase D 回归：`pnpm --filter @equality/core test:d1`
- [ ] 4.7 Phase D 回归：`pnpm --filter @equality/core test:compaction`
- [ ] 4.8 Phase D 回归：`pnpm --filter @equality/core test:d4`
- [ ] 4.9 Phase D 回归：`pnpm --filter @equality/core test:d2`
- [ ] 4.10 TypeScript 编译检查：`pnpm --filter @equality/core typecheck`

---

## 测试矩阵

| 编号 | 测试 | 子阶段 | spec 场景 |
|------|------|--------|-----------|
| T27 | register 初始 queued | E1 | 任务注册中心 S1 |
| T28 | 合法状态迁移 | E1 | 任务注册中心 S1 |
| T29 | 非法迁移拒绝 | E1 | 任务注册中心 |
| T30 | running 恢复为 lost | E1 | 任务持久化与恢复 |
| T31 | cancelTask 生效 | E1 | 任务控制 |
| T32 | steerTask 投递消息 | E1 | 任务控制 |
| T33 | AbortError 不 failover | E2 | Failover 策略 S2 |
| T34 | 429 冷却并切换 | E2 | Failover 策略 S1 |
| T35 | auth 禁用 provider 并切换 | E2 | Failover 策略 S4 |
| T36 | billing 长冷却 | E2 | Failover 策略 |
| T37 | thinking 渐进降级 | E2 | Failover 策略 S3 |
| T38 | 全部失败统一错误 | E2 | Failover 策略 |
| T39 | spawn 返回 taskId | E3 | 子 Agent 委派 S1 |
| T40 | 子 Agent 独立 session | E3 | 子 Agent 委派 S1 |
| T41 | list 返回子任务 | E3 | 子 Agent 控制 S2 |
| T42 | steer 注入方向消息 | E3 | 子 Agent 控制 S2 |
| T43 | kill 取消运行中子任务 | E3 | 子 Agent 控制 S3 |
| T44 | depth>1 拒绝 | E3 | 子 Agent 委派 S4 |

**E1: 6 tests · E2: 6 tests · E3: 6 tests = 18 新增测试**
**回归: 302 tests（截至 Phase D 完成）**
**总计: 320 tests**
