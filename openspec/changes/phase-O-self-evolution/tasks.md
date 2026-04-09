# Phase O — 自进化循环：实施任务清单

> 对话 → 学习 → 记忆 → 技能化 → 历史搜索 → 更好的对话 → 更好的完成任务

---

## O1: 记忆增强 + 预算感知

### O1.1 冻结记忆快照

- [x] `packages/core/src/session/types.ts` — Session 类型增加 `frozenMemorySnapshot?: string`
- [x] `packages/core/src/context/default-engine.ts` — assemble() 首轮调用 memorySearch 并缓存到 session.frozenMemorySnapshot
- [x] `packages/core/src/context/default-engine.ts` — assemble() 后续轮复用快照，跳过 memorySearch
- [x] `packages/core/src/context/default-engine.ts` — memory recall 结果截断到 4000 字符，按 importance DESC 排序
- [x] `packages/core/src/session/persist.ts` — 序列化/反序列化 frozenMemorySnapshot 字段
- [x] `packages/core/src/session/store.ts` — 从磁盘恢复时还原 frozenMemorySnapshot
- [x] 单元测试：Session 类型验证 (3 assertions)
- [x] 单元测试：持久化 round-trip (2 assertions)
- [x] 单元测试：recall 容量截断 (3 assertions)

### O1.2 预算感知警告

- [x] `packages/core/src/agent/runner.ts` — 添加 budgetState 跟踪对象
- [x] `packages/core/src/agent/runner.ts` — 70%/90% 阈值触发时追加警告到 tool result
- [x] 单元测试：budget state tracking (4 assertions)
- [x] 单元测试：tool calls 独立跟踪 (4 assertions)

---

## O2: 上下文压缩

### O2.1 压缩器模块

- [x] **新建** `packages/core/src/context/compressor.ts` — shouldCompress + compress 6 步流水线
- [x] `packages/core/src/context/index.ts` — 导出 compressor 模块

### O2.2 测试

- [x] 单元测试：token% 触发 (2 assertions)
- [x] 单元测试：消息数触发 (2 assertions)
- [x] 单元测试：均不触发 (2 assertions)
- [x] 单元测试：token% 优先 (1 assertion)
- [x] 单元测试：默认配置 (3 assertions)
- [x] 单元测试：流水线辅助逻辑 (5 assertions)

---

## O3: 技能增强

- [x] `packages/core/src/agent/system-prompt.ts` — 4 段指引（匹配+引用+沉淀+Patch）
- [x] 单元测试：匹配+引用 (2 assertions)
- [x] 单元测试：沉淀 (2 assertions)
- [x] 单元测试：Patch (2 assertions)

---

## O4: 历史会话搜索

### O4.1 数据库 + 工具

- [x] **新建** `packages/core/src/session/search-db.ts` — SQLite FTS5 索引
- [x] **新建** `packages/core/src/tools/builtins/session-search.ts` — session_search 工具
- [x] `packages/core/src/tools/builtins/index.ts` — 注册 session_search
- [x] `packages/core/src/context/default-engine.ts` — afterTurn 增量索引 (fire-and-forget)
- [x] `packages/core/src/agent/system-prompt.ts` — session_search 使用指引

### O4.2 测试

- [x] 单元测试：数据库操作 (7 assertions)
- [x] 单元测试：工具定义 (4 assertions)
- [x] 单元测试：system prompt 指引 (3 assertions)

---

## 统计

| 子阶段 | 断言数 | 状态 |
|--------|--------|------|
| O1     | 16     | ✅   |
| O2     | 15     | ✅   |
| O3     | 6      | ✅   |
| O4     | 14     | ✅   |
| **合计** | **51** | ✅   |

TypeScript 类型检查：✅ 零错误
