# Delta Spec: Gateway — 任务树 API + WebSocket 进度推送

> 修改 `openspec/specs/gateway/spec.md`。新增任务 DAG 查询接口和实时进度推送。

---

## MODIFIED Requirements

### Requirement: Session 列表 API

（原文：GET /sessions 返回 SessionListItem[]）

系统 SHALL 在 session 列表响应中增加父子关系和角色信息。

SessionListItem 增加字段：
- `parentSessionKey?: string` — 从 session key 中解析 `::sub::` 关系
- `agentRole?: string` — 执行角色标识（supervisor/architect/developer/tester/reviewer）
- `taskState?: string` — 关联 TaskRegistry 中的任务状态
- `depth?: number` — 嵌套深度（0=顶层，1=子 Agent，2=孙子 Agent）

#### Scenario: 返回父子关系
- GIVEN session key 为 `agent:main:desktop:default:direct:123::sub::abc`
- WHEN `GET /sessions` 被调用
- THEN 该 session 的 `parentSessionKey` = `agent:main:desktop:default:direct:123`
- AND `depth` = 1

#### Scenario: 无子 Agent 的普通会话
- GIVEN session key 为 `agent:main:desktop:default:direct:123`（无 `::sub::`）
- WHEN `GET /sessions` 被调用
- THEN 该 session 的 `parentSessionKey` = undefined
- AND `depth` = 0

---

## ADDED Requirements

### Requirement: 任务树查询 API

系统 SHALL 提供 `GET /tasks/tree` 端点，返回任务的 DAG 树状结构。

```typescript
interface TaskTreeNode {
  taskId: string
  title: string
  role?: AgentRole
  state: TaskState
  sessionKey: string
  children: TaskTreeNode[]
  progress?: number          // 0-100，该子树的完成百分比
  durationMs?: number
  createdAt: number
}
```

#### Scenario: 有子 Agent 的任务树
- GIVEN Supervisor 任务有 3 个子任务（architect, developer, tester）
- WHEN `GET /tasks/tree` 被调用
- THEN 返回根节点包含 3 个 children
- AND 每个 child 有正确的 role 和 state

#### Scenario: 空任务列表
- GIVEN 没有活跃任务
- WHEN `GET /tasks/tree` 被调用
- THEN 返回空数组

---

### Requirement: 任务详情 API

系统 SHALL 提供 `GET /tasks/:id` 端点，返回单个任务的详细信息。

#### Scenario: 任务存在
- GIVEN taskId 对应一个存在的任务
- WHEN `GET /tasks/:id` 被调用
- THEN 返回完整的 TaskRecord + 子任务列表

#### Scenario: 任务不存在
- GIVEN taskId 不存在
- WHEN `GET /tasks/:id` 被调用
- THEN 返回 404

---

### Requirement: WebSocket 任务进度推送

系统 SHALL 通过 WebSocket 实时推送任务状态变化事件。

事件格式：
```typescript
interface TaskProgressEvent {
  type: 'task:progress'
  planId: string
  nodeId: string
  status: PlanNodeStatus
  progress: {
    completedNodes: number
    totalNodes: number
    runningNodes: string[]
    failedNodes: string[]
    estimatedRemainingMs: number
  }
  timestamp: number
}
```

#### Scenario: 节点状态变化推送
- GIVEN WebSocket 客户端已连接
- WHEN 一个 Plan 节点从 'running' 变为 'completed'
- THEN 客户端收到 `task:progress` 事件
- AND 事件包含更新后的进度信息

#### Scenario: 多客户端广播
- GIVEN 2 个 WebSocket 客户端已连接
- WHEN 任务状态变化
- THEN 两个客户端都收到事件

#### Scenario: 无活跃 Plan
- GIVEN 没有正在执行的 Plan
- THEN 不发送 `task:progress` 事件

---

### Requirement: 启动诊断 API [借鉴 claw-code SetupReport]

系统 SHALL 提供 `GET /diagnostics/bootstrap` 端点。

（详细规格见 bootstrap/spec.md）

#### Scenario: 诊断端点可用
- GIVEN Gateway 已启动
- WHEN `GET /diagnostics/bootstrap` 被调用
- THEN 返回 200，包含 stages 数组
