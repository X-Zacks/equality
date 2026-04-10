# Phase M: Memory Management 任务清单

## M1 — 基础记忆管理 UI + 安全 (P0)

### Core 端

- [x] T1: `db.ts` — ALTER TABLE 迁移：添加 agent_id, workspace_dir, source, updated_at, archived, pinned 字段 + 索引
- [x] T2: `db.ts` — `memorySave()` 签名改为 `memorySave(text, opts: MemorySaveOptions)`，兼容旧调用
- [x] T3: `db.ts` — `checkMemoryDuplicate(text)` 去重检查（cosine≥0.95）
- [x] T4: `db.ts` — `scanMemoryThreats(text)` 安全扫描（5 种威胁模式）
- [x] T5: `db.ts` — `memoryUpdate(id, fields)` 编辑记忆（重算 embedding + updated_at）
- [x] T6: `db.ts` — `memoryListPaged(options)` 分页列表（含过滤/排序/pinned 置顶）
- [x] T7: `db.ts` — `memoryStats()` 统计信息
- [x] T8: `index.ts` — REST API: GET /memories (分页列表)
- [x] T9: `index.ts` — REST API: GET /memories/:id (详情) + GET /memories/stats (统计)
- [x] T10: `index.ts` — REST API: POST /memories (创建 + 安全扫描 + 去重)
- [x] T11: `index.ts` — REST API: PATCH /memories/:id (编辑 + 快照失效)
- [x] T12: `index.ts` — REST API: DELETE /memories/:id + DELETE /memories?ids= (删除)
- [x] T13: `index.ts` — CORS: 添加 PATCH 方法
- [x] T14: `tools/builtins/memory.ts` — memory_save 工具传入 sessionKey + agentId + workspaceDir + source
- [x] T15: `agent/runner.ts` — autoCapture 传入完整上下文（agentId + workspaceDir + source='auto-capture'）
- [x] T16: `session/store.ts` — `invalidateMemorySnapshots()` 清空活跃 session 的冻结快照
- [x] `tools/types.ts` — ToolContext 增加 agentId 字段
- [x] `memory/index.ts` — 导出新增函数和类型

### Desktop 端

- [x] T17: `Settings.tsx` — SettingsTab 类型增加 `'memory'`，Tab 栏增加 "🧠 记忆"
- [x] T18: `MemoryTab.tsx` — 新建记忆列表组件（表格 + 分页 + 搜索 + 过滤 + pinned 置顶）
- [x] T19/T20: `MemoryTab.tsx` — MemoryDialog 组件（编辑/添加合一，含去重提示）
- [x] T21: `MemoryTab.tsx` — StatsPanel 统计面板（嵌入 MemoryTab 顶部）
- [ ] T22: `Chat.tsx` — autoCapture Toast 提示 + [撤销] 按钮（待后续 SSE 事件管道完善）
- [x] T23: `useGateway.ts` — 新增 memory CRUD hooks（listMemories, getMemory, createMemory, updateMemory, deleteMemory, deleteMemories, getMemoryStats）
- [x] T24: `MemoryTab.css` — 记忆管理 UI 样式（深色/浅色主题）

### 测试

- [x] T25: `phase-M-mem.test.ts` — 测试：schema 迁移 + memorySave 新签名 + 去重 + 安全扫描 + memoryUpdate + memoryListPaged + memoryStats (47 assertions)

## M2 — Agent + Workspace 作用域 + 通知 (P1) — 待 M1 完成后

- [ ] T26: `db.ts` — `memorySearchScoped(query, { agentId, workspaceDir })` 作用域搜索
- [ ] T27: `db.ts` — `memoryGetPinned()` 获取所有置顶记忆
- [ ] T28: `default-engine.ts` — Recall 改为 pinned + scoped hybrid search
- [ ] T29: `tools/builtins/memory.ts` — memory_search 增加 agent/workspace 上下文
- [ ] T30: `agent/runner.ts` — autoCapture 传入 agentId + workspaceDir
- [ ] T31: 测试 — 作用域过滤 + pinned 强制包含 (~15 assertions)

## M3 — 容量控制 + 时间衰减 + 导入导出 (P2) — 待 M2 完成后

- [ ] T32: `hybrid-search.ts` — 时间衰减因子 `exp(-ln2/30 × ageDays)`
- [ ] T33: `db.ts` — `memoryGC()` 自动归档策略
- [ ] T34: `index.ts` — GET /memories/export + POST /memories/import
- [ ] T35: Desktop 统计面板 + 导入导出按钮
- [ ] T36: 高级设置 — MEMORY_AUTO_CAPTURE 开关
- [ ] T37: 测试 — 时间衰减 + GC + 导入导出 (~15 assertions)

## 统计

- M1: 25 个任务（T1-T25），预估 ~1000 行新增 + ~80 行修改
- M2: 6 个任务（T26-T31），预估 ~300 行修改
- M3: 6 个任务（T32-T37），预估 ~500 行
