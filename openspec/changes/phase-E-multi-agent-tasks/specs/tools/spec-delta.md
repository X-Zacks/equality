# Delta Spec: Phase E — 工具系统扩展（SubAgent）

> 依赖: [../../../specs/tools/spec.md](../../../specs/tools/spec.md)
>
> 本 Delta Spec 覆盖 GAP-8：为 Agent 增加子任务委派与子 Agent 控制工具。

---

## ADDED Requirements

### Requirement: SubAgent 工具集

系统 SHALL 提供一组标准工具，用于创建和控制子 Agent 任务。

拆分为 4 个独立工具（每个工具职责单一，LLM 理解更准确）：

| 工具名 | 职责 |
|--------|------|
| `subagent_spawn` | 启动子 Agent，MUST 返回 `taskId` |
| `subagent_list` | MUST 返回当前会话可见的子任务摘要 |
| `subagent_steer` | MUST 向运行中子任务注入一条方向调整消息 |
| `subagent_kill` | MUST 取消指定的运行中子任务 |

#### Scenario: Agent 委派子任务
- GIVEN 主 Agent 需要把“阅读大量日志并归纳结论”的工作委派出去
- WHEN 主 Agent 调用 `subagent_spawn` 工具
- THEN 系统创建一个新的子任务
- AND 返回 `taskId`
- AND 子任务在独立上下文中运行

#### Scenario: Agent 查询已有子任务
- GIVEN 当前会话下已存在多个子任务
- WHEN 主 Agent 调用 `subagent_list` 工具
- THEN 系统返回这些子任务的 `taskId`、标题、状态和创建时间

---

### Requirement: SubAgent 深度限制

系统 SHALL 对子 Agent 派生深度进行限制。

- Phase E V1 MUST 仅允许单层子 Agent（`depth = 1`）
- 子 Agent MUST NOT 再继续 spawn 孙子 Agent
- 超出限制时，工具 MUST 返回 `isError=true` 的结果并说明原因

#### Scenario: depth > 1 被拒绝
- GIVEN 一个正在运行的子 Agent
- WHEN 它尝试再次调用 `subagent_spawn`
- THEN 系统拒绝该请求
- AND 返回错误“暂不支持多层子 Agent”

---

### Requirement: SubAgent 与任务注册中心对齐

所有由 `subagent` 工具创建的任务 MUST 注册到统一任务注册中心。

- `spawn` 创建的任务 MUST 标记 `runtime='subagent'`
- 子任务 MUST 记录 `parentTaskId` 或 `parentSessionKey`
- `steer` / `kill` MUST 通过任务注册中心定位目标任务
- 被取消的子任务 MUST 迁移为 `cancelled`

#### Scenario: kill 取消运行中子任务
- GIVEN 一个运行中的子任务
- WHEN Agent 或用户调用 `subagent_kill(taskId='...')`
- THEN 系统中止该子任务
- AND 任务注册中心中的状态变为 `cancelled`

---

## MODIFIED Requirements

### Requirement: 工具注册（修改）

**原规格**：
Phase 2 最小工具集合包含 `bash`、`read_file`、`write_file`、`glob`、`web_fetch`。

**修改后**：
- 系统 MAY 在内置工具集合中新增 `subagent_spawn`、`subagent_list`、`subagent_steer`、`subagent_kill`
- 这些工具属于高层编排工具，语义上不是文件/网络工具，而是任务委派工具
- 各工具仍 MUST 遵循标准 `ToolDefinition` 接口，并经过常规工具策略与审计管道

#### Scenario: subagent 工具作为标准工具暴露给 LLM
- GIVEN Gateway 完成启动并注册内置工具
- WHEN Agent 获取工具 schema 列表
- THEN `subagent_spawn`、`subagent_list`、`subagent_steer`、`subagent_kill` 出现在工具列表中
- AND 各工具 schema 包含必需参数定义

---

## REMOVED Requirements

（无）
