# Delta Spec: 记忆增强

---

## ADDED Requirements

### Requirement: 冻结记忆快照

会话期间，system prompt 中的记忆内容 MUST 保持不变（冻结）。

- 首轮 assemble 时 MUST 调用 memorySearch 生成快照文本
- 后续轮 MUST 复用首轮快照，不得重新调用 memorySearch
- memory_save 写入磁盘后 MUST NOT 更新当前会话快照
- Session 持久化时 MUST 包含 frozenMemorySnapshot 字段

#### Scenario: 首轮冻结
- GIVEN 新会话的第一条用户消息
- WHEN assemble() 被调用
- THEN memorySearch 被执行一次
- AND 结果存入 session.frozenMemorySnapshot
- AND system prompt 包含该快照

#### Scenario: 后续轮复用
- GIVEN 会话已有 frozenMemorySnapshot
- WHEN 第 N 轮 (N>1) assemble() 被调用
- THEN memorySearch 不被调用
- AND system prompt 使用已有快照

#### Scenario: 中途 memory_save 不影响当前会话
- GIVEN 会话已有 frozenMemorySnapshot
- WHEN Agent 调用 memory_save 写入新记忆
- THEN SQLite 写入成功
- AND 当前会话快照不变
- AND 新会话 assemble 时能看到新记忆

### Requirement: 记忆 Recall 容量限制

memory recall 注入 system prompt 的内容 MUST NOT 超过 4000 字符。

- 超出时 MUST 按 importance DESC, created_at DESC 排序后截断
- 截断时 MUST 保持条目完整性（不截断半条）

#### Scenario: recall 结果超出预算
- GIVEN memory 中有 20 条记忆
- AND recall 返回 6000 字符
- WHEN 应用容量限制
- THEN 结果 ≤ 4000 字符
- AND 高 importance 的记忆优先保留

---

## MODIFIED Requirements

### Requirement: Session 数据模型

Session 类型 MUST 新增可选字段 `frozenMemorySnapshot?: string`。

（原有字段不变）
