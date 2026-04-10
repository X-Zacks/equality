# Delta Spec: Memory Management — Scoped Recall & Pinned

> Phase M2 — Agent + Workspace 作用域 Recall + pinned 强制包含

## ADDED Requirements

### Requirement: 作用域记忆搜索

`memorySearchScoped(query, scope)` MUST 按 agent_id + workspace_dir 过滤记忆池后执行 hybrid search。

搜索范围 MUST 按以下优先级层叠：

| 层级 | 条件 | 说明 |
|------|------|------|
| 1 | `agent_id = <current> AND workspace_dir = <current>` | 本 Agent + 本项目 |
| 2 | `agent_id = <current> AND workspace_dir IS NULL` | 本 Agent 通用 |
| 3 | `agent_id = 'default' AND workspace_dir = <current>` | 默认 Agent + 本项目 |
| 4 | `agent_id = 'default' AND workspace_dir IS NULL` | 全局默认 |
| 5 | `category = 'fact'` (跨 Agent) | 事实类记忆跨 Agent 可见 |

所有层级的候选记忆合并去重后，作为 hybrid search 的输入池。

当 `workspace_dir` 未提供时，MUST 跳过与 workspace 相关的过滤条件（层级 1、3 退化为层级 2、4）。

#### Scenario: 完整作用域搜索
- GIVEN agent='coder', workspace='C:\proj\alpha'
- AND 记忆库含:
  - A: agent=coder, workspace=C:\proj\alpha, text="项目用 pnpm"
  - B: agent=coder, workspace=NULL, text="偏好 TypeScript"
  - C: agent=default, workspace=NULL, text="用户名 zacks"
  - D: agent=translator, workspace=NULL, text="翻译偏好简体"
- WHEN memorySearchScoped("依赖管理", { agentId: 'coder', workspaceDir: 'C:\proj\alpha' })
- THEN 候选池包含 A, B, C（不含 D，因为 D 不是 default 且不是 fact）
- AND 结果按 hybrid score 排序

#### Scenario: 无 workspace 搜索
- GIVEN agent='coder', workspace 未提供
- WHEN memorySearchScoped("偏好", { agentId: 'coder' })
- THEN 搜索 agent=coder (所有 workspace) + agent=default + fact 类

#### Scenario: 空候选池降级
- GIVEN 无匹配的作用域记忆
- WHEN memorySearchScoped("某个查询", { agentId: 'new-agent' })
- THEN 降级为全局搜索（等同于现有 memorySearch 行为）

---

### Requirement: 置顶记忆获取

`memoryGetPinned(scope?)` MUST 返回所有 `pinned=1 AND archived=0` 的记忆。

如果提供 scope，MUST 只返回匹配作用域 + 全局 pinned 记忆。
如果不提供 scope，MUST 返回所有 pinned 记忆。

#### Scenario: 获取全部 pinned
- GIVEN 5 条 pinned 记忆（分布在不同 agent/workspace）
- WHEN memoryGetPinned()
- THEN 返回全部 5 条

#### Scenario: 按作用域获取 pinned
- GIVEN pinned 记忆: A(agent=coder), B(agent=default), C(agent=translator)
- WHEN memoryGetPinned({ agentId: 'coder' })
- THEN 返回 A + B（coder 自身 + default 全局）

---

## MODIFIED Requirements

### Requirement: Recall 策略（default-engine.ts）

auto Recall MUST 按以下逻辑执行：
1. 获取 pinned 记忆（强制包含，不经过相关性过滤）
2. 执行 scoped hybrid search（用 userMessage 查询）
3. pinned 记忆排在结果最前
4. 合并去重（pinned 与 search 结果可能重叠）
5. 容量截断（MEMORY_RECALL_MAX_CHARS）

（Previously: 全局 hybrid search，无 pinned，无作用域过滤）

#### Scenario: Pinned + Scoped Recall
- GIVEN agent=coder, workspace=C:\proj\alpha
- AND 2 条 pinned 记忆: "用户名 zacks", "时区 UTC+8"
- AND 用户消息 "这个项目用什么包管理器"
- WHEN default-engine assemble
- THEN system prompt 的 <long-term-memories> 块包含:
  - 📌 [fact] 用户名 zacks
  - 📌 [fact] 时区 UTC+8
  - [project] 项目用 pnpm（hybrid search 命中）

#### Scenario: 容量截断保留 pinned
- GIVEN 3 条 pinned 记忆 + 20 条搜索结果
- AND 总字符超过 MEMORY_RECALL_MAX_CHARS
- WHEN 容量截断
- THEN pinned 记忆不被截断
- AND 仅截断搜索结果部分

---

### Requirement: memory_search 工具上下文

memory_search 工具 MUST 使用 `memorySearchScoped` 替代全局 `memorySearch`。

工具执行时 MUST 从 ToolContext 获取 agentId 和 workspaceDir 作为搜索作用域。

（Previously: 全局搜索，不区分 agent/workspace）

#### Scenario: 工具搜索带作用域
- GIVEN ctx.agentId='coder', ctx.workspaceDir='C:\proj\alpha'
- WHEN memory_search 工具执行 query="包管理"
- THEN 底层调用 memorySearchScoped("包管理", { agentId: 'coder', workspaceDir: 'C:\proj\alpha' })

---

### Requirement: autoCapture SSE 事件

autoCapture 成功保存记忆后，MUST 将保存结果通知给调用者（通过回调），使 SSE 端点可以发送 `memory_captured` 事件给前端。

runner.ts 的 `RunAttemptParams` MUST 新增 `onMemoryCaptured` 可选回调。

（Previously: autoCapture 静默执行，无外部通知）

#### Scenario: autoCapture 通知
- GIVEN 用户消息 "记住我叫 zacks"
- WHEN autoCapture 匹配成功并保存
- THEN 调用 onMemoryCaptured({ id, text: "记住我叫 zacks", category: "general" })
- AND index.ts 通过 SSE 发送 { type: "memory_captured", id, text, category }

#### Scenario: autoCapture 去重不通知
- GIVEN 已有 "记住我叫 zacks"
- WHEN autoCapture 再次匹配相同文本
- THEN 去重跳过，不调用 onMemoryCaptured
