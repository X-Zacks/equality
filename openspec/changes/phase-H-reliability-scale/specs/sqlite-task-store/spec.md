# Delta Spec: SQLite Task Store

> Phase H2 (GAP-18) — SQLite 任务持久化  
> 修改领域：tasks（TaskStore 实现升级）

---

## ADDED Requirements

### Requirement: SqliteTaskStore 实现

系统 MUST 提供 `SqliteTaskStore` 类，实现现有 `TaskStore` 接口，使用 Node.js 内置 `node:sqlite` 模块。

```typescript
class SqliteTaskStore implements TaskStore {
  constructor(dbPath?: string)   // 默认 %APPDATA%/Equality/tasks/tasks.db
  load(): Promise<TaskRecord[]>
  save(records: TaskRecord[]): Promise<void>
  
  // 增量操作（比 JSON 全量快照更高效）
  upsert(record: TaskRecord): void
  delete(taskId: string): void
  
  close(): void
}
```

#### Scenario: 首次使用自动建表
- GIVEN 数据库文件不存在
- WHEN `SqliteTaskStore` 被实例化
- THEN 自动创建数据库文件
- AND 创建 `task_runs` 表和索引

#### Scenario: 数据往返一致性
- GIVEN 一个 `TaskRecord` 对象
- WHEN `save([record])` 后调用 `load()`
- THEN 返回的记录与原始记录字段一致

---

### Requirement: 数据库配置

- **WAL 模式**：系统 MUST 启用 `PRAGMA journal_mode = WAL`（支持并发读）
- **同步模式**：系统 MUST 设置 `PRAGMA synchronous = NORMAL`（性能与安全平衡）
- **忙等超时**：系统 MUST 设置 `PRAGMA busy_timeout = 5000`（5s）
- **数据库路径**：默认 `%APPDATA%/Equality/tasks/tasks.db`，可通过构造参数覆盖

#### Scenario: WAL 模式启用
- GIVEN 新建 SqliteTaskStore
- WHEN 查询 `PRAGMA journal_mode`
- THEN 返回 `wal`

---

### Requirement: 表结构

`task_runs` 表 SHALL 包含以下列：

| 列名 | 类型 | 约束 |
|------|------|------|
| `task_id` | TEXT | PRIMARY KEY |
| `runtime` | TEXT | NOT NULL |
| `state` | TEXT | NOT NULL |
| `title` | TEXT | NOT NULL |
| `session_key` | TEXT | |
| `parent_task_id` | TEXT | |
| `parent_session_key` | TEXT | |
| `created_at` | INTEGER | NOT NULL |
| `started_at` | INTEGER | |
| `finished_at` | INTEGER | |
| `timeout_ms` | INTEGER | |
| `notification_policy` | TEXT | NOT NULL |
| `last_error` | TEXT | |
| `summary` | TEXT | |
| `metadata_json` | TEXT | |

索引 SHALL 包括：
- `idx_task_state` — `(state)`
- `idx_task_session` — `(session_key)`
- `idx_task_parent` — `(parent_task_id)`

---

### Requirement: 原子 Upsert

`upsert(record)` MUST 使用 `INSERT ... ON CONFLICT(task_id) DO UPDATE` 语法，实现单条记录的原子写入。

#### Scenario: 更新已有记录
- GIVEN 任务 A 已存在于数据库
- AND 状态为 `running`
- WHEN `upsert(A_with_state_succeeded)` 被调用
- THEN 数据库中任务 A 的状态更新为 `succeeded`
- AND 其他字段也同步更新

#### Scenario: 插入新记录
- GIVEN 数据库中没有任务 B
- WHEN `upsert(B)` 被调用
- THEN 任务 B 被插入

---

### Requirement: TaskStore 接口兼容

`SqliteTaskStore` MUST 完全兼容现有 `TaskStore` 接口。`TaskRegistry` 的构造函数 SHALL 接受 `SqliteTaskStore` 或 `JsonTaskStore`。

- `save(records)` 实现为全量替换（清表 + 批量插入，wrapped in transaction）
- `load()` 实现为全表扫描，按 `created_at ASC` 排序

#### Scenario: 与 TaskRegistry 集成
- GIVEN `TaskRegistry` 使用 `SqliteTaskStore`
- WHEN 注册 + 状态迁移 + flush
- THEN 数据与使用 `JsonTaskStore` 时行为一致
