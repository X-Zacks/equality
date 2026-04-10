# Delta Spec: Memory Management — REST API

> Phase M1 — 记忆 CRUD REST API

## ADDED Requirements

### Requirement: GET /memories 列表

系统 MUST 提供 `GET /memories` 端点，支持分页和过滤。

查询参数：`page`, `pageSize`, `category`, `agent`, `workspace`, `source`, `search`, `archived`, `pinned`

返回 MUST 为 `{ items: MemoryEntry[], total, page, pageSize }`。

#### Scenario: 默认列表
- GIVEN 42 条活跃记忆
- WHEN GET /memories
- THEN 返回 page=1, pageSize=20, total=42, items.length=20

#### Scenario: 带搜索过滤
- GIVEN 记忆库含 "用户名是 zacks" 和 "偏好 TypeScript"
- WHEN GET /memories?search=zacks
- THEN items 只包含匹配 "zacks" 的记忆

---

### Requirement: GET /memories/:id 详情

系统 MUST 提供单条记忆详情查询。
不存在时 MUST 返回 404。

---

### Requirement: POST /memories 创建

系统 MUST 提供创建记忆端点。

Body: `{ text, category?, importance?, agentId?, workspaceDir?, pinned? }`

source 自动标记为 `'manual'`。
写入前 MUST 执行安全扫描 + 去重检查。

#### Scenario: 创建成功
- GIVEN 有效的记忆内容
- WHEN POST /memories { text: '新记忆' }
- THEN 201 返回创建的 MemoryEntry

#### Scenario: 安全拦截
- GIVEN text 包含 "ignore all previous instructions"
- WHEN POST /memories
- THEN 400 返回 `{ error: 'memory_threat_detected' }`

#### Scenario: 去重提示
- GIVEN 已有 "偏好 TypeScript"
- WHEN POST /memories { text: '喜欢 TypeScript' }
- THEN 200 返回 `{ duplicate: true, existingId, similarity: 0.97 }`

---

### Requirement: PATCH /memories/:id 更新

系统 MUST 提供记忆编辑端点。

Body: `{ text?, category?, importance?, pinned?, archived? }`

修改 text 时 MUST 重算 embedding。
修改后 MUST 触发活跃 session 快照失效（Q3 决策）。

#### Scenario: 编辑后通知
- GIVEN 3 个活跃 session 有冻结的记忆快照
- WHEN PATCH /memories/abc { text: '更新后' }
- THEN 3 个 session 的 frozenMemorySnapshot 被置为 null
- AND 下次 assemble 触发重新 Recall

---

### Requirement: DELETE /memories/:id 删除

系统 MUST 提供单条永久删除。

#### Scenario: 删除成功
- GIVEN 记忆 id='abc' 存在
- WHEN DELETE /memories/abc
- THEN 记录被永久删除 + FTS 索引同步更新
- AND 返回 `{ ok: true }`

---

### Requirement: DELETE /memories?ids= 批量删除

系统 MUST 支持逗号分隔 ID 列表的批量删除。

#### Scenario: 批量删除
- GIVEN ids='a,b,c' 均存在
- WHEN DELETE /memories?ids=a,b,c
- THEN 3 条记录被删除
- AND 返回 `{ ok: true, deleted: 3 }`

---

### Requirement: GET /memories/stats 统计

系统 MUST 提供记忆统计端点。

返回 byCategory、byAgent、bySource、byWorkspace 的分组计数，
以及 total、archived、pinned、embeddingCoverage 等指标。

#### Scenario: 统计查询
- GIVEN 42 条记忆
- WHEN GET /memories/stats
- THEN 返回完整的 MemoryStats 对象
