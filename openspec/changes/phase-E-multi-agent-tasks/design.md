# Design: Phase E — 多 Agent 与任务

> 依赖: [proposal.md](./proposal.md)

---

## 总体架构

```
启动阶段                                   运行时（单次 / 后台任务）
───────────────────────────                ───────────────────────────────
index.ts                                    runner.ts / cron / subagent
  │                                         │
  ├─ 创建 TaskRegistry            E1        ├─ registerTask()
  ├─ 恢复持久化任务快照                     ├─ transition(task)
  ├─ 注入到 cron / gateway / tools          ├─ emit task events
  │                                         │
  ├─ 创建增强版 FallbackProvider   E2       ├─ failoverPolicy.classify(err)
  ├─ 配置冷却 / 探测策略                     ├─ 降级 thinking / 切 provider
  │                                         │
  ├─ 创建 SubagentManager         E3        ├─ subagent.spawn()
  └─ 注册 subagent 工具                     ├─ 子 runAttempt()
                                            └─ steer / kill / list
```

---

## E1. 后台任务注册中心（GAP-9）

### 新增文件

| 文件 | 行数估算 | 职责 |
|------|---------|------|
| `tasks/types.ts` | ~80 | `TaskRecord` / `TaskState` / `TaskRuntime` 类型 |
| `tasks/registry.ts` | ~220 | 注册、状态迁移、取消、steer、事件分发 |
| `tasks/store.ts` | ~120 | JSON 持久化快照读写 |
| `tasks/events.ts` | ~80 | 订阅 / 广播任务状态变更 |
| `tasks/index.ts` | ~20 | 模块导出 |

### 核心数据结构

```typescript
export type TaskRuntime = 'manual' | 'cron' | 'subagent'

export type TaskState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'lost'

export type TaskNotificationPolicy = 'done_only' | 'state_changes' | 'silent'

export interface TaskRecord {
  id: string
  runtime: TaskRuntime
  state: TaskState
  title: string
  sessionKey?: string
  parentTaskId?: string
  parentSessionKey?: string
  assignedAgent?: 'main' | 'subagent'
  createdAt: number
  startedAt?: number
  finishedAt?: number
  timeoutMs?: number
  notificationPolicy: TaskNotificationPolicy
  lastError?: string
  summary?: string
  metadata?: Record<string, unknown>
}
```

### 状态迁移

```
queued → running → succeeded
               ├→ failed
               ├→ timed_out
               └→ cancelled

进程异常中断 / 启动后无法恢复 → lost
```

### 集成点

1. `runAttempt()` 可选地接收 `taskId`
2. `cron` 执行前先 `TaskRegistry.register(runtime='cron')`
3. `SubagentManager.spawn()` 先注册 `runtime='subagent'`
4. Gateway 暴露 `GET /tasks` / `GET /tasks/:id` / `POST /tasks/:id/steer` / `DELETE /tasks/:id`

### 持久化决策

- Phase E 先采用 **JSON 快照持久化**，路径与现有 session/config 风格保持一致
- 持久化粒度：状态变更后 debounce 写盘（如 200ms）
- `lost` 状态用于记录“上次进程退出时仍处于 running 的任务”

### 关键决策

1. **为什么不直接上 SQLite？**
   - 当前项目已有 session / settings / cron 的 JSON 风格存储
   - Phase E 的重点是统一语义与控制面，不是数据库能力
   - 后续若任务量变大，可平滑迁移到 SQLite

2. **为什么保留 `lost` 状态但不实现 orphan recovery？**
   - 状态机需要预留“非正常中断”语义
   - V1 只记录，不自动恢复；恢复逻辑留给后续阶段

---

## E2. Provider Failover 策略增强（GAP-12）

### 新增文件

| 文件 | 行数估算 | 职责 |
|------|---------|------|
| `providers/failover-policy.ts` | ~180 | 错误分类细化、冷却管理、探测、降级决策 |
| `providers/fallback.ts` | 修改 | 接入新策略，替换原有粗粒度 `classifyError` |
| `agent/runner.ts` | 修改 | 输出 failover 事件 / 模型切换说明 |

> **注意**：原 `auth-profiles.ts` 从 E2 范围移除。当前 Equality 认证模型为"一个 provider 一个 API Key"（`secrets.ts`），Copilot 使用 OAuth，均非 key 轮换场景。auth profile 轮换留给后续 Phase 按需引入。

### 错误分类模型

```typescript
export type FailoverReason =
  | 'abort'
  | 'context_overflow'
  | 'rate_limit'
  | 'overloaded'
  | 'auth'
  | 'billing'
  | 'network'
  | 'timeout'
  | 'fatal'

export interface FailoverDecision {
  reason: FailoverReason
  shouldFailover: boolean
  cooldownMs?: number
  probeAfterMs?: number
  degradeThinking?: boolean
  rotateAuthProfile?: boolean
}
```

### 策略矩阵

| 故障 | 动作 | 说明 |
|------|------|------|
| `abort` | 不切换 | 用户主动取消，立即返回 |
| `context_overflow` | 不切换 | 交给 Compaction 处理 |
| `rate_limit` | 切 provider / model + 30s 冷却 | 最常见可恢复错误 |
| `overloaded` / `5xx` | 切 provider + 短冷却 | 服务暂时不可用 |
| `network` / `timeout` | 探测后切换 | 网络抖动不永久拉黑 |
| `auth` | 长冷却并禁用该 provider | 当前为单 key 模型，auth 失败即 provider 不可用 |
| `billing` | 长冷却并切换 | 避免反复命中余额不足 |
| `fatal` | 不切换 | 非预期程序错误，直接抛出 |

### 渐进降级

当候选模型支持 `thinking` 时，优先级为：

```
high thinking → medium thinking → low thinking → no thinking → fallback model
```

若 provider 不支持 thinking，则直接走 fallback chain。

> **与现有 `fallback.ts` 的关系**：当前 `classifyError()` 使用 4 类分类（`abort`/`fatal`/`fallback`/`skip`）。E2 将其细化为 9 类 `FailoverReason`，并将冷却管理从模块级全局变量提升到 `FailoverPolicy` 类实例中，便于测试和配置。

### 关键决策

1. **Failover 决策放在哪层？**
   - 放在 provider 层（`FallbackProvider` + `failover-policy.ts`）
   - `runner.ts` 只消费“切换结果”，不承担分类逻辑

2. **是否允许运行中切模型？**
   - 允许在"本轮尚未产生有效流输出"前切换
   - 一旦已经向用户稳定输出大量内容，则不在中途切模型，避免回复风格跳变

3. **子 Agent 是否复用同一策略？**
   - 是。主 Agent、cron 任务、子 Agent 都通过统一 failover policy 执行

4. **为什么移除 auth profile 轮换？**
   - 当前 Equality 认证模型为「一个 provider 一个 API Key」（`secrets.ts`）
   - Copilot 使用 OAuth Device Flow，不是 key 轮换
   - 多 profile 场景留到有实际需求时再引入，避免过度设计

---

## E3. 多 Agent 编排与子 Agent 系统（GAP-8）

### 新增文件

| 文件 | 行数估算 | 职责 |
|------|---------|------|
| `agent/subagent-manager.ts` | ~220 | spawn / list / steer / kill / 父子关系维护 |
| `tools/builtins/subagent.ts` | ~160 | 暴露给 LLM 的 `subagent` 工具 |
| `agent/subagent-types.ts` | ~80 | 子代理请求 / 控制参数 |

### Tool 设计

拆分为 4 个独立工具（LLM 对单一职责工具理解更好，避免 action 多路复用导致参数混淆）：

| 工具名 | 职责 |
|--------|------|
| `subagent_spawn` | 启动子 Agent |
| `subagent_list` | 列出当前 session 相关子任务 |
| `subagent_steer` | 向运行中子 Agent 注入方向调整 |
| `subagent_kill` | 取消运行中子 Agent |

### spawn 语义

```typescript
interface SpawnInput {
  prompt: string
  goal?: string
  allowedTools?: string[]
  model?: string
  timeoutMs?: number
}
```

执行流程：

```
主 Agent 调用 subagent.spawn
   │
   ├─ 创建 TaskRecord(runtime='subagent')
   ├─ 生成 childSessionKey = `${parentSessionKey}::sub::${taskId}`
   ├─ depth 检查（V1: 仅允许 depth=1）
   ├─ 启动新的 runAttempt()
   ├─ 子结果写入 task.summary
   └─ 返回一条可供主 Agent 消费的摘要结果
```

### 控制面

- `subagent_list`：返回当前会话下的子任务摘要（taskId, title, state, createdAt）
- `subagent_steer`：复用现有 `steeringQueue: string[]` 思路，向对应子任务注入一条方向消息
- `subagent_kill`：触发该任务的 AbortController，并将状态迁移为 `cancelled`

> **与 runner.ts 现有 steering 的关系**：每个子 Agent 的 `runAttempt()` 传入独立的 `steeringQueue`，`steerTask()` 将消息推入对应队列，runner 在 tool loop 间隙消费。

### 父子关系与会话隔离

| 维度 | 选择 | 理由 |
|------|------|------|
| 子任务是否独立 session | 是 | 避免父子历史相互污染 |
| 子结果如何回流 | 摘要回填父对话 | 控制 token 成本 |
| 是否共享工具白名单 | 默认继承，可覆盖 | 与现有 `allowedTools` 保持一致 |
| 是否允许孙子 Agent | 否（V1） | 先控制复杂度 |

### 关键决策

1. **为什么用独立 child session？**
   - 子 Agent 是“受约束的独立执行单元”，天然适合独立上下文
   - 独立 session 能复用现有 `SessionStore` / `ContextEngine` / `persist`

2. **为什么只做单层？**
   - 一旦允许递归，会立刻引入深度限制、预算继承、孤儿恢复等一串问题
   - V1 先验证“委派”这件事是否改善复杂任务表现

3. **控制面通过工具还是 HTTP API？**
   - 两者都需要
   - Tool 面向 LLM 自主调度
   - HTTP API 面向 UI / 用户监控与人工干预

---

## 对现有文件的影响

| 文件 | E1 | E2 | E3 | 总改动 |
|------|:--:|:--:|:--:|--------|
| `index.ts` | ✏️ TaskRegistry 初始化 + API | ✏️ failover provider 注入 | ✏️ SubagentManager 注入 | ~60 行 |
| `agent/runner.ts` | ✏️ taskId / 事件上报 | ✏️ failover 说明输出 | ✏️ 子任务 spawn 集成 | ~50 行 |
| `tools/index.ts` | — | — | ✏️ 导出 `subagent_*` 工具 | ~5 行 |
| `cron/*` | ✏️ 任务注册 | — | — | ~20 行 |
| `providers/failover-policy.ts` | — | ✏️ 新增 | — | ~180 行 |
| `providers/fallback.ts` | — | ✏️ 重构 classifyError 接入 policy | — | ~50 行 |

---

## 风险与缓解

| 风险 | 级别 | 缓解 |
|------|------|------|
| 子 Agent 无限派生 | 高 | V1 硬限制 `depth=1` |
| 任务状态与实际运行脱节 | 中 | 统一通过 `TaskRegistry.transition()` 改状态，禁止散写 |
| provider 误判故障导致过度切换 | 中 | 错误分类集中在 `failover-policy.ts`，可测试覆盖 |
| 长任务通知刷屏 | 低 | 引入 `notificationPolicy` 与节流 |
