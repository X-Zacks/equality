# Design: Subtask 重命名 + Skills 同步

## D1: subagent → subtask 重命名

### 重命名映射表

| 旧名 | 新名 |
|------|------|
| `subagent_spawn` | `subtask_spawn` |
| `subagent_list` | `subtask_list` |
| `subagent_steer` | `subtask_steer` |
| `subagent_kill` | `subtask_kill` |
| `SubagentManager` | `SubtaskManager` |
| `SubagentInfo` | `SubtaskInfo` |
| `SubagentResult` | `SubtaskResult` |
| `SpawnSubagentParams` | `SpawnSubtaskParams` |
| `SubagentManagerConfig` | `SubtaskManagerConfig` |
| `subagent-manager.ts` | `subtask-manager.ts` |
| `subagent-types.ts` | `subtask-types.ts` |
| `subagent-spawn.ts` | `subtask-spawn.ts` |
| `subagent-list.ts` | `subtask-list.ts` |
| `subagent-steer.ts` | `subtask-steer.ts` |
| `subagent-kill.ts` | `subtask-kill.ts` |
| `runtime: 'subagent'` | `runtime: 'subtask'` |
| `::sub::` | `::task::` |
| `setSubagentManagerFor*` | `setSubtaskManagerFor*` |

### 并发模型说明

当前实现（保持不变）：
- **不是多线程**，是 Node.js 单线程事件循环上的 async/await 并发
- `spawnParallel()` 使用 `Promise.allSettled` + 信号量（maxConcurrent=5）
- 每个 subtask 运行在独立 child session，共享同一进程内的 toolRegistry 和 skillsIndex

### 兼容性

- 工具名变更：旧的 `subagent_*` 工具名不再存在。由于工具名由 Agent runtime 调用，不存在外部 API 兼容问题。
- TaskRegistry 中的 `runtime` 字段从 `'subagent'` 变为 `'subtask'`，仅影响内部分类。

---

## D2: Skills 同步机制

### 架构

```
skills/sync.ts — SkillsSyncer
  ├── syncBundledSkills(workspaceDir)
  │   ├── 源: getBundledSkillsDir()  (packages/core/skills/)
  │   └── 目标: <workspaceDir>/.equality/skills/
  │
  ├── 同步策略:
  │   ├── 仅同步 bundled source 的 skills
  │   ├── 使用文件 mtime 比较，跳过未变更文件
  │   ├── 写入 .equality/skills/.sync-manifest.json 记录同步状态
  │   └── 新增/更新复制，删除不处理（用户可能自定义了）
  │
  └── 触发时机:
      ├── Gateway 启动时（initSecrets 之后、loadAllSkills 之前）
      └── Workspace Dir 变更时
```

### .sync-manifest.json 格式

```json
{
  "syncedAt": "2026-04-22T10:00:00Z",
  "sourceDir": "C:\\software\\equality\\packages\\core\\skills",
  "skills": {
    "docx": { "mtime": 1713800000000, "files": 12 },
    "pdf": { "mtime": 1713800000000, "files": 8 }
  }
}
```

### 加载优先级调整

当前 `loader.ts` 的 `SKILLS_LOAD_ORDER` 已经有 `workspace` 最高优先级。
同步目标是 `<workspaceDir>/.equality/skills/`，需要在加载顺序中新增：

```
{ source: 'synced-bundled', resolveDir: (ws) => path.join(ws, '.equality', 'skills') }
```

优先级放在 `bundled` 和 `managed` 之间（priority 2.5），这样：
- 用户 workspace 级自定义 > synced-bundled > 原始 bundled

---

## D3: Skills 分类架构分析

输出 `docs/equality-skills-architecture.md`，包含：
1. Equality 现有 38 个 bundled skills 按五层架构分类
2. 与 Anthropic 官方 skills 的对标分析
3. 企业落地优先级建议
4. 分类 enum 扩展建议
