# Tasks: Subtask 重命名 + Skills 同步 + 分类架构

## Phase 1: subagent → subtask 全局重命名

- [x] 1.1 重命名文件（git mv）
  - `agent/subagent-manager.ts` → `agent/subtask-manager.ts`
  - `agent/subagent-types.ts` → `agent/subtask-types.ts`
  - `tools/builtins/subagent-spawn.ts` → `tools/builtins/subtask-spawn.ts`
  - `tools/builtins/subagent-list.ts` → `tools/builtins/subtask-list.ts`
  - `tools/builtins/subagent-steer.ts` → `tools/builtins/subtask-steer.ts`
  - `tools/builtins/subagent-kill.ts` → `tools/builtins/subtask-kill.ts`
  - `__tests__/subagent.test.ts` → `__tests__/subtask.test.ts`
  - `__tests__/subagent-parallel.test.ts` → `__tests__/subtask-parallel.test.ts`

- [x] 1.2 类/接口/类型重命名
  - `SubagentManager` → `SubtaskManager`
  - `SubagentInfo` → `SubtaskInfo`
  - `SubagentResult` → `SubtaskResult`
  - `SpawnSubagentParams` → `SpawnSubtaskParams`
  - `SubagentManagerConfig` → `SubtaskManagerConfig`
  - `DEFAULT_SUBAGENT_CONFIG` → `DEFAULT_SUBTASK_CONFIG`
  - `ParallelSpawnItem` → `ParallelSpawnItem`（保持不变）
  - `LiveSubagent` → `LiveSubtask`
  - `SubagentManagerDeps` → `SubtaskManagerDeps`

- [x] 1.3 工具名重命名
  - `subagent_spawn` → `subtask_spawn`
  - `subagent_list` → `subtask_list`
  - `subagent_steer` → `subtask_steer`
  - `subagent_kill` → `subtask_kill`

- [x] 1.4 导出函数名重命名
  - `setSubagentManagerForSpawn` → `setSubtaskManagerForSpawn`
  - `setSubagentManagerForList` → `setSubtaskManagerForList`
  - `setSubagentManagerForSteer` → `setSubtaskManagerForSteer`
  - `setSubagentManagerForKill` → `setSubtaskManagerForKill`

- [x] 1.5 内部字符串 / 常量替换
  - `runtime: 'subagent'` → `runtime: 'subtask'`
  - `::sub::` → `::task::`
  - `subagent_progress` → `subtask_progress`
  - 注释和日志中的 "子 Agent" / "subagent" → "子任务" / "subtask"

- [x] 1.6 更新 builtins/index.ts 导出
- [x] 1.7 更新 tools/index.ts 导出
- [x] 1.8 更新 index.ts（Gateway）中的引用
- [x] 1.9 更新 tool-policy profiles 中的工具名
- [x] 1.10 更新前端引用（SessionPanel.tsx / Chat.tsx 中的 `::sub::` 检测）
- [x] 1.11 更新测试文件内容

## Phase 2: Skills 同步机制

- [x] 2.1 创建 `skills/sync.ts` — SkillsSyncer
- [x] 2.2 在 index.ts 中 Gateway 启动时调用 syncBundledSkills
- [x] 2.3 在 Workspace Dir 变更时触发重新同步

## Phase 3: Skills 分类架构分析文档

- [x] 3.1 创建 `docs/equality-skills-architecture.md`
