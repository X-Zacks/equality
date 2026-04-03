# Proposal: Phase E4 — Gateway 集成

> Phase E（E1/E2/E3）已完成任务注册中心、Failover 策略、子 Agent 管理器三个核心模块的实现与单元测试。
> Phase E4 的目标是将这三个模块**接通到 Gateway 运行时**，使其从"已测试但孤立的库"变为"可被调用的系统能力"。

---

## 一、为什么做

### 1.1 E1/E2/E3 目前处于"库就绪、系统未感知"的状态

| 模块 | 已完成 | 未完成 |
|------|--------|--------|
| `TaskRegistry` (E1) | 类型、注册、状态机、持久化、事件总线、单元测试 | Gateway 不感知：无 HTTP API，无 SSE 推送，cron 不注册任务 |
| `FailoverPolicy` (E2) | 错误分类、冷却、thinking 降级、FallbackProvider 重构 | `onModelSwitch` 回调未接入 Gateway，用户切换模型时无通知 |
| `SubagentManager` (E3) | 工具 schema、spawn/list/steer/kill 逻辑、单元测试 | Gateway 未创建管理器实例，4 个工具的 `execute` 仍为占位 stub |

**不接通的直接后果**：

- `GET /tasks` 路由不存在 → UI 无法展示任务列表
- SSE `/events` 不推送任务状态 → 前端无法实时感知后台任务进度
- `subagent_spawn` 工具调用必然返回 `isError: true` → 子 Agent 功能完全失效
- cron 触发仍是"黑盒"，没有 taskId，无法追踪或取消
- Provider 切换时用户看不到切换通知

### 1.2 集成工作不属于纯 feature 开发，但影响面大

Gateway 集成涉及多个文件的协调修改：

```
index.ts               ← 主入口：初始化、路由、SSE、shutdown
tools/index.ts         ← builtinTools 注册表
tools/builtins/        ← 4 个 subagent 工具的 execute 实现
providers/index.ts     ← FallbackProvider 构建时注入回调
cron/index.ts 或调用处  ← 触发前注册任务到 TaskRegistry
```

集中处理，避免分散修改导致的遗漏和不一致。

### 1.3 集成完成后，E1/E2/E3 的价值才真正落地

E1 单元测试证明 TaskRegistry 语义正确 → E4 让 Gateway 真正用上它  
E2 单元测试证明错误分类和 failover 正确 → E4 让 UI 能感知模型切换  
E3 单元测试证明 SubagentManager spawn/kill 正确 → E4 让 LLM 能实际调用 subagent

---

## 二、做什么

### E4.1 TaskRegistry 接入 Gateway

**初始化**：Gateway 启动时创建 `TaskRegistry` 并恢复持久化快照；关闭时 flush 到磁盘。

**SSE 事件推送**：订阅 `TaskEventBus`，将 `state_changed` 等任务事件广播到所有 SSE 客户端。

**HTTP API**：新增 4 条路由：
- `GET /tasks` — 列出任务摘要（支持 `?runtime=` 过滤）
- `GET /tasks/:taskId` — 获取任务详情
- `POST /tasks/:taskId/steer` — 向运行中任务发送 steering 消息
- `DELETE /tasks/:taskId` — 取消任务

**cron 集成**：cron 触发 `runAgentTurn` 前先向 `TaskRegistry` 注册 `runtime='cron'` 任务；执行完成后回写状态。

### E4.2 FailoverPolicy `onModelSwitch` 接通

**位置**：`providers/index.ts` 中 `FallbackProvider` 构建时注入 `onModelSwitch` 回调。

**效果**：Provider 切换时，Gateway 向 SSE 客户端推送通知消息，前端可显示"已从 GPT-4o 切换到 Claude 3.5"。

### E4.3 SubagentManager 接入 Gateway

**初始化**：Gateway 启动时创建 `SubagentManager` 实例，注入 `taskRegistry` 和 `runAttempt`。

**工具桥接**：替换 4 个 subagent 工具的占位 `execute` 为实际的 `SubagentManager` 调用。

**注册到 toolRegistry**：将 `subagent_spawn/list/steer/kill` 加入 `builtinTools`。

---

## 三、不做什么（范围边界）

| 不包含 | 原因 |
|--------|------|
| 子 Agent 孤儿恢复（Orphan Recovery） | V1 只记录 `lost`，不自动恢复，留给后续阶段 |
| 任务 TTL / 超时自动终止 | `timed_out` 状态已在类型中预留，执行逻辑在 Phase F+ |
| SQLite 持久化迁移 | JSON 快照已满足当前需求 |
| 多 auth profile 轮换 | Equality 当前为单 Key 模型，auth 轮换不适用 |
| 任务访问权限控制 | Phase E4 仅面向本地可信调用，无多用户场景 |
| Phase F 交互式 UI 组件 | 属于 GAP-14，下一阶段 |

---

## 四、成功标准

完成后，以下场景必须端到端可工作：

1. Gateway 启动日志中可见"TaskRegistry 已恢复 N 个任务"
2. cron 触发一次后，`GET /tasks` 返回该任务记录
3. SSE 客户端收到任务 `queued → running → succeeded` 的事件流
4. LLM 调用 `subagent_spawn` 工具，返回真实 `taskId`（而非错误）
5. Provider failover 发生时，SSE 客户端收到模型切换通知
6. `DELETE /tasks/:taskId` 成功取消运行中任务
