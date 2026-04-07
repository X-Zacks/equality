# Tasks: Phase N — 多角色编排引擎

> Status: pending | Completed: 0/52 | Running: 0

---

## Phase N1: Plan DAG 编排引擎（核心调度层）

### N1.1 类型定义
- [ ] **N1.1.1** 创建 `orchestration/plan-types.ts` — PlanNode, PlanGraph, PlanExecutionResult, AgentRole, PlanNodeStatus
  - depends: (none)
  - output: `packages/core/src/orchestration/plan-types.ts`

### N1.2 DAG 引擎
- [ ] **N1.2.1** 创建 `orchestration/plan-dag.ts` — PlanDAG class：拓扑排序、环检测、就绪节点、关键路径、后代查询、合法性验证
  - depends: N1.1.1
  - output: `packages/core/src/orchestration/plan-dag.ts`

### N1.3 Plan 执行器
- [ ] **N1.3.1** 创建 `orchestration/plan-executor.ts` — PlanExecutor class：调度循环、暂停/恢复、取消、重试、跳过、steer、进度查询
  - depends: N1.2.1, N2.1.1
  - output: `packages/core/src/orchestration/plan-executor.ts`

### N1.4 Plan 序列化
- [ ] **N1.4.1** 创建 `orchestration/plan-serializer.ts` — tasks.md ↔ PlanGraph 双向转换、JSON 序列化
  - depends: N1.1.1
  - output: `packages/core/src/orchestration/plan-serializer.ts`

### N1.5 Parity Audit [claw-code]
- [ ] **N1.5.1** 创建 `orchestration/parity-audit.ts` — ParityAuditor：Spec 覆盖率对比、测试覆盖率、报告生成
  - depends: N1.1.1
  - output: `packages/core/src/orchestration/parity-audit.ts`

### N1.6 History Log [claw-code]
- [ ] **N1.6.1** 创建 `orchestration/history-log.ts` — HistoryLog：事件记录、Markdown 导出、JSON 序列化
  - depends: (none)
  - output: `packages/core/src/orchestration/history-log.ts`

### N1.7 Module Index
- [ ] **N1.7.1** 创建 `orchestration/index.ts` — 统一导出
  - depends: N1.1.1, N1.2.1, N1.3.1, N1.4.1, N1.5.1, N1.6.1
  - output: `packages/core/src/orchestration/index.ts`

### N1.8 测试
- [ ] **N1.8.1** 创建 `__tests__/orchestration-plan-dag.ts` — ~40 断言
  - depends: N1.2.1
- [ ] **N1.8.2** 创建 `__tests__/orchestration-plan-executor.ts` — ~50 断言
  - depends: N1.3.1
- [ ] **N1.8.3** 创建 `__tests__/orchestration-plan-serializer.ts` — ~20 断言
  - depends: N1.4.1
- [ ] **N1.8.4** 创建 `__tests__/orchestration-parity-audit.ts` — ~15 断言
  - depends: N1.5.1
- [ ] **N1.8.5** 创建 `__tests__/history-log.ts` — ~10 断言
  - depends: N1.6.1

---

## Phase N2: SubagentManager 深度增强

### N2.1 配置化
- [ ] **N2.1.1** 改造 `agent/subagent-manager.ts` — 新增 SubagentManagerConfig（maxDepth=3, maxTotalAgents=20, maxConcurrent=5），解除 depth=1 硬限
  - depends: (none)
  - output: `packages/core/src/agent/subagent-manager.ts`（改）

### N2.2 并行 spawn
- [ ] **N2.2.1** 新增 `SubagentManager.spawnParallel()` — 并行启动多子 Agent、并发信号量、Promise.allSettled、onComplete 回调
  - depends: N2.1.1
  - output: `packages/core/src/agent/subagent-manager.ts`（改）

### N2.3 级联终止
- [ ] **N2.3.1** 增强 `SubagentManager.kill()` — cascade 选项：递归终止所有后代子 Agent
  - depends: N2.1.1
  - output: `packages/core/src/agent/subagent-manager.ts`（改）

### N2.4 类型增强
- [ ] **N2.4.1** 更新 `agent/subagent-types.ts` — 新增 ParallelSpawnItem、SubagentManagerConfig 类型
  - depends: (none)
  - output: `packages/core/src/agent/subagent-types.ts`（改）

### N2.5 测试
- [ ] **N2.5.1** 创建 `__tests__/subagent-parallel.ts` — ~35 断言：spawnParallel、depth=2、级联终止、并发限制、onComplete
  - depends: N2.2.1, N2.3.1

---

## Phase N3: 代码索引 + codebase_search

### N3.1 FileScanner [claw-code: PortContext + PortManifest]
- [ ] **N3.1.1** 创建 `indexer/file-scanner.ts` — FileScanner：全量扫描、增量扫描、ProjectManifest 生成、配置化过滤
  - depends: (none)
  - output: `packages/core/src/indexer/file-scanner.ts`

### N3.2 ChunkIndexer
- [ ] **N3.2.1** 创建 `indexer/chunk-indexer.ts` — ChunkIndexer：文件分块、符号提取、嵌入计算（复用 Phase K memory/）
  - depends: N3.1.1
  - output: `packages/core/src/indexer/chunk-indexer.ts`

### N3.3 SearchEngine
- [ ] **N3.3.1** 创建 `indexer/search-engine.ts` — CodeSearchEngine：混合检索（语义+关键词+符号）、结果排序（复用 Phase K hybrid-search RRF）
  - depends: N3.2.1
  - output: `packages/core/src/indexer/search-engine.ts`

### N3.4 codebase_search 工具
- [ ] **N3.4.1** 创建 `tools/builtins/codebase-search.ts` — 内建工具注册、参数定义、SearchEngine 集成
  - depends: N3.3.1
  - output: `packages/core/src/tools/builtins/codebase-search.ts`

### N3.5 Module Index
- [ ] **N3.5.1** 创建 `indexer/index.ts` — 统一导出
  - depends: N3.1.1, N3.2.1, N3.3.1
  - output: `packages/core/src/indexer/index.ts`

### N3.6 测试
- [ ] **N3.6.1** 创建 `__tests__/indexer-scanner.ts` — ~25 断言：扫描、增量、过滤、Manifest
  - depends: N3.1.1
- [ ] **N3.6.2** 创建 `__tests__/indexer-search.ts` — ~25 断言：混合搜索、符号搜索、排序
  - depends: N3.3.1

---

## Phase N4: Session 树形 UI + 进度推送

### N4.1 后端 API
- [ ] **N4.1.1** 改造 `GET /sessions` — 响应增加 parentSessionKey、agentRole、taskState 字段
  - depends: (none)
  - output: `packages/core/src/index.ts`（改）

- [ ] **N4.1.2** 新增 `GET /tasks/tree` — 返回任务 DAG 树状结构
  - depends: N1.1.1
  - output: `packages/core/src/index.ts`（改）

- [ ] **N4.1.3** 新增 `GET /tasks/:id` — 返回任务详情 + 子任务列表
  - depends: N1.1.1
  - output: `packages/core/src/index.ts`（改）

- [ ] **N4.1.4** 新增 WebSocket `task:progress` 事件 — 实时推送任务状态变化
  - depends: N1.3.1
  - output: `packages/core/src/index.ts`（改）

### N4.2 前端组件
- [ ] **N4.2.1** 创建 `SessionTreeView.tsx` — 树形会话列表组件
  - depends: N4.1.1
  - output: `packages/desktop/src/SessionTreeView.tsx`

- [ ] **N4.2.2** 改造 `SessionPanel.tsx` — 集成 SessionTreeView，区分有/无子 Agent 的会话
  - depends: N4.2.1
  - output: `packages/desktop/src/SessionPanel.tsx`（改）

- [ ] **N4.2.3** 创建 `TaskProgressBar.tsx` — Plan 整体进度面板组件
  - depends: N4.1.4
  - output: `packages/desktop/src/TaskProgressBar.tsx`

- [ ] **N4.2.4** 创建 `StatusBadge.tsx` + `RoleIcon.tsx` — 状态指示 + 角色图标组件
  - depends: (none)
  - output: `packages/desktop/src/StatusBadge.tsx`, `packages/desktop/src/RoleIcon.tsx`

### N4.3 Session Key 解析
- [ ] **N4.3.1** 创建 `utils/session-tree.ts` — parseSessionHierarchy：从 session key 构建树形结构
  - depends: (none)
  - output: `packages/desktop/src/utils/session-tree.ts`

### N4.4 Gateway Hook
- [ ] **N4.4.1** 改造 `useGateway.ts` — 增加 WebSocket 连接、task:progress 事件监听、树形 session 查询
  - depends: N4.1.4, N4.3.1
  - output: `packages/desktop/src/useGateway.ts`（改）

---

## Phase N5: Supervisor Skill + 角色配置

### N5.1 角色配置 [claw-code: ToolPool + ToolPermissionContext]
- [ ] **N5.1.1** 创建 `orchestration/role-config.ts` — AgentRoleConfig 类型、5 个预置角色配置、角色加载函数
  - depends: (none)
  - output: `packages/core/src/orchestration/role-config.ts`

### N5.2 ToolPermissionContext [claw-code]
- [ ] **N5.2.1** 创建 `tools/permission-context.ts` — ToolPermissionContext、createPermissionContext、isToolBlocked（支持 deny_prefixes）
  - depends: (none)
  - output: `packages/core/src/tools/permission-context.ts`

### N5.3 ExecutionRegistry [claw-code]
- [ ] **N5.3.1** 创建 `orchestration/execution-registry.ts` — ExecutionRegistry：统一注册工具+命令+Skill、按种类查询、getGraph()
  - depends: (none)
  - output: `packages/core/src/orchestration/execution-registry.ts`

### N5.4 Supervisor Skill
- [ ] **N5.4.1** 创建 `skills/supervisor-workflow/SKILL.md` — 完整的多角色协作编排 Skill 定义
  - depends: N1.3.1
  - output: `packages/core/skills/supervisor-workflow/SKILL.md`

### N5.5 Testing Skill
- [ ] **N5.5.1** 创建 `skills/testing-workflow/SKILL.md` — 测试角色 Skill 定义
  - depends: (none)
  - output: `packages/core/skills/testing-workflow/SKILL.md`

### N5.6 Review Skill
- [ ] **N5.6.1** 创建 `skills/review-workflow/SKILL.md` — 审查角色 Skill 定义
  - depends: (none)
  - output: `packages/core/skills/review-workflow/SKILL.md`

### N5.7 测试
- [ ] **N5.7.1** 创建 `__tests__/role-config.ts` — ~20 断言：角色加载、ToolPermissionContext、deny_prefix
  - depends: N5.1.1, N5.2.1
- [ ] **N5.7.2** 创建 `__tests__/execution-registry.ts` — ~15 断言：注册、查询、getGraph
  - depends: N5.3.1

---

## Phase N6: Diff 预览 + Bootstrap 日志 + 会话增强

### N6.1 BootstrapGraph [claw-code]
- [ ] **N6.1.1** 创建 `bootstrap/bootstrap-graph.ts` — BootstrapGraph class：7 阶段启动、状态流转、降级模式、Markdown 报告、结构化日志
  - depends: (none)
  - output: `packages/core/src/bootstrap/bootstrap-graph.ts`

### N6.2 TranscriptStore compact [claw-code]
- [ ] **N6.2.1** 创建 `session/transcript-compact.ts` — compactTranscript()：keep_last、阈值触发、system prompt 保留
  - depends: (none)
  - output: `packages/core/src/session/transcript-compact.ts`

### N6.3 Session Snapshot [claw-code: RuntimeSession]
- [ ] **N6.3.1** 创建 `session/session-snapshot.ts` — SessionSnapshot 类型、captureSnapshot、restoreFromSnapshot
  - depends: N6.1.1
  - output: `packages/core/src/session/session-snapshot.ts`

### N6.4 Diff 预览（前端）
- [ ] **N6.4.1** 创建 `DiffPreview.tsx` — Diff 预览组件（Monaco diff 视图/纯文本 diff）
  - depends: (none)
  - output: `packages/desktop/src/DiffPreview.tsx`

- [ ] **N6.4.2** 改造 `Chat.tsx` — 检测 write_file/edit_file 工具调用，嵌入 DiffPreview
  - depends: N6.4.1
  - output: `packages/desktop/src/Chat.tsx`（改）

### N6.5 测试
- [ ] **N6.5.1** 创建 `__tests__/bootstrap-graph.ts` — ~15 断言
  - depends: N6.1.1
- [ ] **N6.5.2** 创建 `__tests__/transcript-compact.ts` — ~15 断言
  - depends: N6.2.1
- [ ] **N6.5.3** 创建 `__tests__/session-snapshot.ts` — ~15 断言
  - depends: N6.3.1

---

## 总计

| 子阶段 | 新增文件 | 改动文件 | 预计代码行数 | 预计断言数 |
|--------|---------|---------|-------------|-----------|
| N1 | 7 | 0 | ~600 | ~135 |
| N2 | 0 | 2 | ~300 | ~35 |
| N3 | 5 | 0 | ~500 | ~50 |
| N4 | 5 | 3 | ~500 | ~0 (前端手动测试) |
| N5 | 6 | 0 | ~400 | ~35 |
| N6 | 4 | 1 | ~350 | ~45 |
| **总计** | **27** | **6** | **~2650** | **~300** |
