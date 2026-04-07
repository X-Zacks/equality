# Phase H: 可靠性与规模 — Proposal

> **目标**：提升长任务可靠性（GAP-17）、存储效率（GAP-18）、API 配额利用（GAP-20）、会话持久化安全（GAP-26）

---

## 动机

Phase G 完成了项目感知与安全。但在可靠性维度，Equality 仍有以下短板：

1. **子 Agent 孤儿丢失**：服务重启后，running 状态的子任务被标记为 `lost`，但不自动恢复——用户长时间运行的任务直接丢失
2. **JSON 全量快照**：TaskStore 使用 `task-snapshot.json` 全量读写，任务量增长后性能下降，多进程并发有数据损坏风险
3. **单 API Key 瓶颈**：同一 Provider 只用一个 API Key，rate limit 时只能切 Provider，无法切 Key
4. **Tool Result 膨胀**：巨大的 tool result 全量保存到会话历史，导致历史文件 MB 级增长，加载变慢

## 范围

### H1 — 子 Agent 孤儿恢复（GAP-17）

参考 OpenClaw `subagent-orphan-recovery.ts`（315 行）的设计：

- **恢复逻辑**：启动时扫描 `lost` 状态的子任务 → 构建合成 resume 消息 → 重新 spawn 执行
- **延迟恢复**：启动后延迟 3s 执行（等 Gateway 就绪）
- **指数退避重试**：恢复失败 → 指数退避重试最多 3 次
- **幂等保护**：已恢复的 sessionKey 不重复恢复
- **状态迁移**：新增 `lost → queued` 迁移路径

### H2 — SQLite 任务存储（GAP-18）

参考 OpenClaw `task-registry.store.sqlite.ts`（508 行）的设计：

- **Node.js 内置 SQLite**：使用 `node:sqlite`（Node 22+ 内置），无需额外依赖
- **WAL 模式**：支持并发读
- **索引优化**：by_status, by_session, by_parent 三个索引
- **原子 Upsert**：`INSERT OR REPLACE` 单条操作
- **兼容现有接口**：实现 `TaskStore` 接口，可与 `JsonTaskStore` 互换
- **自动迁移**：首次使用时自动建表

### H3 — API Key 轮换（GAP-20）

参考 OpenClaw `api-key-rotation.ts`（73 行）的设计：

- **`executeWithKeyRotation<T>()`**：泛型包装函数，按 key 列表依次尝试
- **去重 + 空值过滤**
- **可自定义重试判断**：默认在 rate_limit 错误时切换到下一个 key
- **`onRetry` 回调**：日志/通知
- **`collectProviderKeys()`**：从环境变量收集所有可用 key（支持 `_KEY_1`, `_KEY_2` 后缀）

### H4 — 会话 Tool Result 持久化守卫（GAP-26）

参考 OpenClaw `session-tool-result-guard.ts`（290 行）的设计：

- **持久化前截断**：在会话消息写入磁盘前，将超大 tool result 缩减
- **与运行时截断独立**：`truncation.ts` 是运行时截断（影响 LLM 上下文），本守卫是持久化截断（保护存储空间）
- **保护存储空间 + 加速历史加载**
- **可配置阈值**：默认 50KB，可通过 config 调整
- **保留截断标记**：截断后追加提示信息

## 非目标

- 不实现 OpenClaw 的 `session-transcript-repair.ts`（会话记录修复）
- 不实现级联恢复（父→子→孙）——V1 只有单层子 Agent
- 不实现 task delivery_state 表（通知投递状态追踪）

## 成功指标

- 新增 ≥ 50 个测试断言
- `tsc --noEmit` 零错误
- 现有 272 个测试不受影响（G:64 + F:59 + E:149）
