# 记忆管理系统设计文档

> **状态**: ✅ 方案已确认 — 准备进入 OpenSpec 流程  
> **日期**: 2026-04-10  
> **前置**: Phase 12 (Memory CRUD) + Phase K2 (Hybrid Search)  
> **参考**: OpenClaw memory-core / memory-lancedb + Hermes MemoryStore

---

## 1. 现状分析

### 1.1 当前数据模型

```
memories 表:
┌──────────┬──────────┬──────────┬───────────┬────────────┬─────────────┬───────────┐
│ id (PK)  │ text     │ category │ importance│ created_at │ session_key │ embedding │
│ TEXT     │ TEXT     │ TEXT     │ INTEGER   │ INTEGER    │ TEXT / NULL  │ BLOB      │
└──────────┴──────────┴──────────┴───────────┴────────────┴─────────────┴───────────┘
```

**存储路径**: `%APPDATA%\Equality\memory.db` — 全局单文件

### 1.2 记忆的来源（写入路径）

| 来源 | 触发方式 | session_key | 备注 |
|------|---------|-------------|------|
| `memory_save` 工具 | Agent 主动调用 | ❌ 未传入 | `memorySaveTool.execute()` 调用 `memorySave(text, category, importance)` — **没有传 sessionKey** |
| 自动 Capture | runner.ts 正则匹配 | ✅ 传入了 | `memorySave(text, 'general', 6, sessionKey)` — 传了 sessionKey |

### 1.3 记忆的消费（读取路径）

| 消费者 | 触发方式 | 作用域 |
|--------|---------|--------|
| `memory_search` 工具 | Agent 主动调用 | **全局** — 搜索所有记忆，不区分 session/agent |
| auto Recall (default-engine.ts) | 每个 session 首轮自动触发 | **全局** — `hybridSearch` 搜全表 |

### 1.4 已发现的问题

#### ❌ P1: 记忆与 Agent 无关联

当前 memories 表没有 `agent_id` 字段。所有 Agent 共享同一个记忆池。

**后果**: 用户对 "翻译Agent" 说 "我喜欢简体中文"，"编程Agent" 的 Recall 也会召回这条记忆。虽然有些跨 Agent 记忆确实有用（如用户名），但 Agent 特定的偏好（"代码风格用 tabs"）混入翻译 Agent 是噪音。

#### ❌ P2: 记忆与 Session 弱关联

`session_key` 字段存在但：
- `memory_save` 工具**没有传入 sessionKey**（只有 autoCapture 传了）
- 搜索时**完全忽略** session_key，不做任何过滤
- 删除会话时**不清理**相关记忆

**后果**: session_key 字段形同虚设，删除会话后记忆仍存在（这其实是对的——记忆应该跨 session 存活），但用户无法追溯 "这条记忆是在哪个对话中产生的"。

#### ❌ P3: 删除会话/Agent 后的上下文缺失

目前 `DELETE /sessions/:key` 只删除会话文件 + 浏览器上下文，**不触及记忆**。

**场景**: 用户在会话 A 中说 "记住，这个项目用 pnpm"，Agent 保存了记忆。用户删除会话 A。之后新会话 Recall 召回 "这个项目用 pnpm" — 用户困惑："这是什么时候说的？"

这不算 bug（记忆本就该持久），但缺乏**溯源能力**。

#### ❌ P4: 无管理界面

用户完全看不到记忆库的内容，无法：
- 浏览所有记忆
- 搜索/过滤
- 编辑/删除单条
- 批量清理
- 了解记忆来源（哪个 Agent / 哪个会话 / 自动还是手动）

#### ❌ P5: 无容量控制

记忆无限增长，无过期策略，无容量上限。长期使用后：
- `getAllMemoriesWithEmbedding()` 全表扫描性能劣化
- Recall 噪音增加（老旧/过时的记忆仍被召回）

---

## 2. 参考架构分析（OpenClaw + Hermes）

### 2.1 OpenClaw memory-core — 文件级记忆搜索框架

OpenClaw 将记忆存储在**文件系统**（`MEMORY.md` + `memory/*.md`），通过 SQLite FTS5 + 向量索引做混合检索。

**核心设计模式**：

| 机制 | 说明 | Equality 借鉴价值 |
|------|------|-------------------|
| **Flush Plan** | 上下文压缩前自动将对话记忆 append 到 `memory/YYYY-MM-DD.md` | ⭐ 值得借鉴 — 我们的 compaction 没有 flush 记忆 |
| **时间衰减** | `score × exp(-ln2/halfLife × ageDays)`，半衰期 30 天 | ⭐ 借鉴 — 解决老旧记忆噪音问题 |
| **MMR 重排** | Maximal Marginal Relevance，平衡相关性与多样性 | ⚪ 后续考虑 |
| **Citations** | 搜索结果附带来源路径 `Source: <path#line>` | ⭐ 借鉴 — 对应我们的溯源需求 |
| **安全围栏** | flush 时只允许 read+write，write 限 append-only | ⚪ 当前不需要（我们直接写 DB） |
| **Embedding 自动降级** | 多 provider 按优先级尝试，缺 key 跳过 | ⚪ 我们用零依赖 n-gram，暂无需 |

**搜索算法** (`MemoryIndexManager.search()`)：
```
1. FTS5 keyword 搜索 (BM25)
2. Vector 搜索 (embedding → cosine similarity)
3. mergeHybridResults(vectorWeight, textWeight) → 融合
4. 可选: temporal decay（时间衰减）
5. 可选: MMR（最大边际相关性重排）
6. minScore 过滤 → 截断到 maxResults
```

### 2.2 OpenClaw memory-lancedb — 对话级长期记忆

与 memory-core 并行，使用 LanceDB 向量数据库存储结构化记忆。

**核心设计模式**：

| 机制 | 说明 | Equality 借鉴价值 |
|------|------|-------------------|
| **Auto-Recall** | `before_agent_start` 事件：自动注入 top-3 相关记忆 | ⭐ 已有类似实现（frozenMemorySnapshot） |
| **Auto-Capture** | `agent_end` 事件：从 user 消息中自动提取记忆 | ⭐ 已有类似实现（autoCapture） |
| **去重** | 存储前检查 cosine≥0.95 的记录防重复 | ⭐⭐ 关键借鉴 — 当前我们没有去重 |
| **分类自动检测** | 正则匹配关键词自动标 preference/fact/decision/entity | ⚪ 已有 category 参数 |
| **Prompt injection 防护** | 扫描 `ignore previous instructions` 等模式 | ⭐ 借鉴 — 记忆内容安全扫描 |
| **内容 HTML 转义** | 注入系统提示词前转义 `<>"'&` | ⭐ 借鉴 |
| **memory_forget 工具** | GDPR 合规删除（按 ID 或模糊查询） | ⚪ 我们有 memoryDelete |

**Auto-Capture 过滤逻辑**（值得对齐）：
```
shouldCapture(message):
  1. 长度 10-500 字符
  2. 匹配记忆触发词 (remember, prefer, always, never, 记住, 偏好...)
  3. 排除 prompt injection 模式
  4. 排除已注入的 <relevant-memories> 标签
  5. 每次对话最多捕获 3 条
```

### 2.3 Hermes — 文件级 Markdown 记忆

Hermes 用最简方案：`MEMORY.md` (Agent 笔记) + `USER.md` (用户画像)，`§` 分隔条目，硬容量限制。

**核心设计模式**：

| 机制 | 说明 | Equality 借鉴价值 |
|------|------|-------------------|
| **冻结快照** | 启动时 load → 生成 snapshot → 注入 system prompt → 中途不更新 | ✅ 已实现（frozenMemorySnapshot） |
| **双区分离** | MEMORY (环境/项目) + USER (用户偏好) 分开存储 | ⭐ 思路借鉴 — 类似 agent_id 作用域 |
| **硬容量限制** | MEMORY 2200 chars, USER 1375 chars | ⚪ 我们用软限制 + 归档更灵活 |
| **安全扫描** | 写入前扫描 prompt injection / secret exfiltration / SSH 后门 | ⭐ 借鉴 |
| **replace 语义** | 工具支持 add/replace/remove，replace 用子串匹配 | ⚪ 后续考虑 |
| **Provider 生命周期钩子** | `on_turn_start / on_session_end / on_pre_compress / on_memory_write / on_delegation` | ⭐ 借鉴 — 丰富我们的记忆钩子 |

**Hermes MemoryManager 的 Provider 接口**（值得参考的抽象）：
```
MemoryProvider:
  initialize(session_id)          → 初始化
  system_prompt_block()           → 静态提示词段
  prefetch(query, session_id)     → 查询级召回
  sync_turn(user, assistant)      → 对话后同步
  on_session_end(messages)        → 会话结束提取
  on_pre_compress(messages)       → 压缩前提取
  on_memory_write(action, target) → 内置记忆写入镜像
  shutdown()                      → 关闭
```

### 2.4 综合借鉴清单

从三个参考实现中，我们需要吸收的关键机制：

| # | 机制 | 来源 | 纳入阶段 |
|---|------|------|---------|
| 1 | 记忆去重（cosine≥0.95） | memory-lancedb | M1 |
| 2 | 时间衰减（半衰期 30 天） | memory-core | M3 |
| 3 | 记忆内容安全扫描 | memory-lancedb + Hermes | M1 |
| 4 | Auto-Capture 可见提示 | 用户 Q5 决策 | M1 |
| 5 | 记忆置顶 / pinned | 用户 Q4 决策 | M1 |
| 6 | Workspace 作用域 | 用户 Q2 决策 | M2 |
| 7 | 编辑后通知 session | 用户 Q3 决策 | M2 |
| 8 | Compaction 前 flush | memory-core | M3 |

---

## 3. 决策记录

| 问题 | 决策 | 理由 |
|------|------|------|
| Q1: 记忆 Tab 位置 | **放设置页** | 不改路由结构，Settings 已有 tab 机制 |
| Q2: 作用域粒度 | **agent_id + workspace_dir** | 同一 Agent 在不同项目的记忆应隔离 |
| Q3: 编辑后通知 | **通知** — 清空冻结快照触发重新 Recall | 确保 Agent 使用最新记忆 |
| Q4: 记忆置顶 | **支持** — `pinned` 字段，Recall 时强制包含 | 用户名等关键信息始终可用 |
| Q5: autoCapture 可见性 | **需要** — 聊天界面轻提示 + 设置开关 | 用户应知道什么被记住了 |

---

## 4. 设计目标

| 优先级 | 目标 | 说明 |
|--------|------|------|
| 🔴 P0 | 记忆管理 UI | 设置页新增 "记忆" tab，支持浏览/搜索/删除 |
| 🔴 P0 | 记忆来源追溯 | 每条记忆记录 source + 关联 session + agent |
| 🔴 P0 | 记忆去重 | 写入前检查 cosine≥0.95，防止重复存储 |
| 🔴 P0 | 记忆置顶 | `pinned` 字段，Recall 时强制包含 |
| 🔴 P0 | autoCapture 可见提示 | 聊天界面显示轻提示 + 设置开关 |
| 🟡 P1 | Agent + Workspace 作用域 | 记忆关联 agent_id + workspace_dir，Recall 按作用域过滤 |
| 🟡 P1 | 编辑后通知 session | 清空冻结快照，触发重新 Recall |
| 🟡 P1 | 记忆 CRUD API | REST API 供前端调用 |
| 🟡 P1 | 记忆安全扫描 | 写入前检查 prompt injection 模式 |
| 🟢 P2 | 容量控制 | 时间衰减 + 重要性衰减 + 手动归档 |
| 🟢 P2 | 导入/导出 | JSON 格式导入导出 |
| 🟢 P2 | Compaction 前 flush | 压缩上下文前自动提取记忆存储 |

---

## 5. 数据模型演进

### 5.1 Schema 变更

```sql
-- 新增字段（ALTER TABLE 迁移）
ALTER TABLE memories ADD COLUMN agent_id      TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memories ADD COLUMN workspace_dir TEXT;
  -- 记忆关联的工作目录路径（NULL = 全局，不限于特定项目）
ALTER TABLE memories ADD COLUMN source        TEXT NOT NULL DEFAULT 'tool';
  -- source 枚举: 'tool' | 'auto-capture' | 'manual'
ALTER TABLE memories ADD COLUMN updated_at    INTEGER;
ALTER TABLE memories ADD COLUMN archived      INTEGER NOT NULL DEFAULT 0;
  -- 0=活跃, 1=已归档（软删除）
ALTER TABLE memories ADD COLUMN pinned        INTEGER NOT NULL DEFAULT 0;
  -- 0=普通, 1=置顶（Recall 时强制包含，不受相关性过滤）

-- 新增索引
CREATE INDEX IF NOT EXISTS idx_mem_agent ON memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_mem_workspace ON memories(workspace_dir);
CREATE INDEX IF NOT EXISTS idx_mem_source ON memories(source);
CREATE INDEX IF NOT EXISTS idx_mem_archived ON memories(archived);
CREATE INDEX IF NOT EXISTS idx_mem_pinned ON memories(pinned);
```

### 5.2 完整 Schema（演进后）

```
memories 表:
┌────────┬──────┬──────────┬───────────┬────────────┬─────────────┬───────────┬──────────┬───────────────┬────────┬────────────┬──────────┬────────┐
│ id     │ text │ category │ importance│ created_at │ session_key │ embedding │ agent_id │ workspace_dir │ source │ updated_at │ archived │ pinned │
│ PK     │ TEXT │ TEXT     │ INT       │ INT        │ TEXT/NULL   │ BLOB      │ TEXT     │ TEXT/NULL      │ TEXT   │ INT/NULL   │ INT 0/1  │ INT 0/1│
└────────┴──────┴──────────┴───────────┴────────────┴─────────────┴───────────┴──────────┴───────────────┴────────┴────────────┴──────────┴────────┘
```

### 5.3 作用域模型（agent_id × workspace_dir）

```
┌──────────────────────────────────────────────────────────────────┐
│                     Global Memory Pool                           │
│                                                                  │
│  ┌── agent_id=default ──────────────────────────────────────┐   │
│  │                                                          │   │
│  │  [workspace=NULL]  全局事实                               │   │
│  │  📌 用户名是 zacks        (pinned, fact)                  │   │
│  │  📌 时区是 UTC+8          (pinned, fact)                  │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌── agent_id=coder ────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  [workspace=NULL]  跨项目偏好                             │   │
│  │    偏好 TypeScript                                        │   │
│  │    用 tabs 缩进                                           │   │
│  │                                                          │   │
│  │  [workspace=C:\proj\alpha]  项目特定                      │   │
│  │    这个项目用 pnpm 管理                                    │   │
│  │    入口是 src/main.ts                                     │   │
│  │                                                          │   │
│  │  [workspace=C:\proj\beta]   项目特定                      │   │
│  │    这个项目用 yarn                                        │   │
│  │    需要 Node 20+                                          │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Recall 策略 (agent=coder, workspace=C:\proj\alpha):             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. pinned=1 的记忆（强制包含，不过滤）                    │   │
│  │ 2. agent=coder AND workspace=C:\proj\alpha （精确匹配）   │   │
│  │ 3. agent=coder AND workspace IS NULL （Agent 通用）       │   │
│  │ 4. agent=default（全局补充）                              │   │
│  │ 5. category='fact' 跨 Agent（去重后补充）                 │   │
│  │ 6. 合并去重 → hybrid search 排序 → 截断                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. REST API 设计

### 6.1 记忆列表

```
GET /memories?page=1&pageSize=20&category=&agent=&workspace=&search=&archived=0&pinned=
```

**Response**:
```json
{
  "items": [
    {
      "id": "uuid",
      "text": "用户名是 zacks",
      "category": "fact",
      "importance": 9,
      "createdAt": 1712736000000,
      "updatedAt": null,
      "sessionKey": "agent:main:desktop:default:direct:local",
      "agentId": "default",
      "workspaceDir": null,
      "source": "tool",
      "archived": false,
      "pinned": true
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

### 6.2 单条记忆详情

```
GET /memories/:id
```

### 6.3 编辑记忆

```
PATCH /memories/:id
Body: { text?, category?, importance?, archived?, pinned? }
```

编辑后自动重算 embedding + **通知所有活跃 session 清空冻结快照**（Q3 决策）。

### 6.4 删除记忆

```
DELETE /memories/:id          -- 单条永久删除
DELETE /memories?ids=a,b,c    -- 批量删除
```

删除后同样通知活跃 session。

### 6.5 手动添加记忆

```
POST /memories
Body: { text, category?, importance?, agentId?, workspaceDir?, pinned? }
```

source 自动标记为 `'manual'`。
写入前执行**安全扫描** + **去重检查**（cosine≥0.95 提示用户）。

### 6.6 统计信息

```
GET /memories/stats
```

**Response**:
```json
{
  "total": 42,
  "byCategory": { "fact": 10, "preference": 15, "general": 12, "project": 5 },
  "byAgent": { "default": 30, "coder": 8, "translator": 4 },
  "bySource": { "tool": 25, "auto-capture": 12, "manual": 5 },
  "byWorkspace": { "null": 25, "C:\\proj\\alpha": 10, "C:\\proj\\beta": 7 },
  "archived": 3,
  "pinned": 5,
  "oldestAt": 1710000000000,
  "newestAt": 1712736000000,
  "embeddingCoverage": 0.95
}
```

### 6.7 导出/导入

```
GET  /memories/export?format=json   -- 导出全部（含 archived）
POST /memories/import               -- 导入 JSON（安全扫描 + 去重）
Body: { items: MemoryEntry[], mode: 'merge' | 'replace' }
```

### 6.8 通知端点（内部）

```
POST /memories/invalidate-snapshot
Body: { sessionKeys?: string[] }
```

编辑/删除记忆后，Core 内部清空指定 session（或所有）的 `frozenMemorySnapshot`，
使下一轮对话触发重新 Recall（Q3 决策实现方式）。

---

## 7. UI 设计

### 7.1 设置页 "记忆" Tab（Q1 决策: 放设置页）

```
Settings 页面顶部 Tab 栏:
┌────────┬────────┬────────┬────────┬────────┬────────┐
│  模型  │  工具  │  技能  │  记忆  │  高级  │  关于  │
└────────┴────────┴────────┴────────┴────────┴────────┘
                            ▲ 新增
```

`SettingsTab` 类型: `'model' | 'tools' | 'skills' | 'memory' | 'advanced' | 'about'`

### 7.2 记忆 Tab 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│  🧠 记忆管理                                          📊 统计  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ 搜索 ────────────────────┐  ┌─ 过滤 ──────────────────────┐│
│  │ 🔍 搜索记忆内容...        │  │ 分类 ▼│ Agent ▼│ 项目 ▼    ││
│  └────────────────────────────┘  └──────────────────────────────┘│
│                                                                 │
│  ┌─ 操作栏 ────────────────────────────────────────────────────┐│
│  │ ☑ 全选 │ 🗑 删除 │ 📦 归档 │ 📌 置顶 │ ➕ 添加 │ ⬇ 导出  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ 记忆列表 ──────────────────────────────────────────────────┐│
│  │ ☐ 📌 用户名是 zacks                                        ││
│  │   fact · ★9 · default · 全局 · tool · 2026-04-08           ││
│  │                                               ✏️ 📌 🗑     ││
│  ├──────────────────────────────────────────────────────────────┤│
│  │ ☐ 🤖 这个项目用 pnpm 管理依赖                               ││
│  │   project · ★7 · coder · C:\proj\alpha · auto · 2026-04-09 ││
│  │                                               ✏️ 📌 🗑     ││
│  ├──────────────────────────────────────────────────────────────┤│
│  │ ☐ 💾 偏好简体中文翻译                                       ││
│  │   preference · ★6 · translator · 全局 · tool · 2026-04-10  ││
│  │                                               ✏️ 📌 🗑     ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ◀ 1 / 3 ▶                                       共 42 条记忆   │
└─────────────────────────────────────────────────────────────────┘
```

**列表行说明**:
- 📌 前缀 = pinned（置顶记忆始终排最前）
- 🤖 = auto-capture, 💾 = tool, ✍️ = manual
- "全局" = workspace_dir IS NULL
- "C:\proj\alpha" = workspace_dir 具体路径（显示最后一级目录名 `alpha`）

### 7.3 统计面板（点击 📊 展开）

```
┌─ 记忆统计 ──────────────────────────────────────┐
│                                                  │
│  总记忆数    42        向量覆盖率  95%            │
│  已归档       3        置顶         5             │
│  最早记忆  2026-03-15                            │
│                                                  │
│  按分类:  fact(10) preference(15) project(5) ... │
│  按来源:  🔧tool(25) 🤖auto(12) ✍️manual(5)     │
│  按Agent: default(30) coder(8) translator(4)     │
│  按项目:  全局(25) alpha(10) beta(7)             │
│                                                  │
│  ⚠️ 容量提示: 建议归档 3 个月前的低重要性记忆     │
│                                                  │
│  [ 一键归档旧记忆 ]  [ 导出全部 ]  [ 导入 ]       │
└──────────────────────────────────────────────────┘
```

### 7.4 编辑弹窗（点击 ✏️）

```
┌─ 编辑记忆 ──────────────────────────────────────┐
│                                                  │
│  内容:                                           │
│  ┌──────────────────────────────────────────┐   │
│  │ 用户名是 zacks                            │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  分类:   [ fact       ▼ ]                       │
│  重要性: [●●●●●●●●●○] 9                        │
│  置顶:   [✓] 始终在 Recall 中包含               │
│                                                  │
│  ── 元信息（只读）──                             │
│  来源: tool                                      │
│  Agent: default                                  │
│  项目: 全局                                      │
│  会话: agent:main:desktop:default:direct:local   │
│  创建: 2026-04-08 14:30                          │
│  修改: --                                        │
│                                                  │
│              [ 取消 ]  [ 保存 ]                   │
└──────────────────────────────────────────────────┘
```

> 保存后自动重算 embedding + 通知活跃 session 重新 Recall（Q3 决策）。

### 7.5 添加弹窗（点击 ➕）

```
┌─ 添加记忆 ──────────────────────────────────────┐
│                                                  │
│  内容:                                           │
│  ┌──────────────────────────────────────────┐   │
│  │                                          │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  分类:   [ general    ▼ ]                       │
│  重要性: [●●●●●○○○○○] 5                        │
│  Agent:  [ default   ▼ ]  (可选)                │
│  项目:   [ 全局      ▼ ]  (可选，列出活跃项目)  │
│  置顶:   [ ] 始终在 Recall 中包含               │
│                                                  │
│  ⚠️ 检测到近似记忆: "用户名是 zack" (95%)       │
│     [ 仍然添加 ]  [ 更新已有 ]                   │
│                                                  │
│              [ 取消 ]  [ 添加 ]                   │
└──────────────────────────────────────────────────┘
```

> 添加时自动执行去重检查（cosine≥0.95），提示用户选择。

### 7.6 聊天界面 autoCapture 提示（Q5 决策）

当 autoCapture 检测到用户消息应被记住时，在聊天区域底部显示一条轻量级 toast：

```
┌─ 聊天界面 ──────────────────────────────────────┐
│                                                  │
│  👤 记住，我叫 zacks                             │
│                                                  │
│  🤖 好的，我已经记住了！                          │
│                                                  │
│  ┌── 💾 已自动记住: "我叫 zacks" ─── [撤销] ──┐ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 输入消息...                               │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Toast 行为**:
- 显示 5 秒后自动消失
- 点击 [撤销] 立即删除该条记忆
- 高级设置中增加 "自动记忆" 开关（默认开启）

---

## 8. 关键行为设计

### 8.1 删除会话时的记忆处理

**方案**: 删除会话时**不删除**记忆，但在记忆列表中标注 "来源会话已删除"。

理由:
- 记忆的价值在于跨 session 持久化，删除会话不应丢失用户偏好
- 用户可以在记忆管理 UI 中自行清理不需要的记忆
- 如果用户确实想连带删除，可在删除会话确认弹窗中勾选 "同时清理该会话产生的记忆"

```
┌─ 确认删除会话 ─────────────────────────────┐
│                                             │
│  确定删除此会话？                            │
│                                             │
│  ☐ 同时删除该会话产生的 3 条记忆            │
│                                             │
│         [ 取消 ]  [ 确认删除 ]              │
└─────────────────────────────────────────────┘
```

### 8.2 删除 Agent 时的记忆处理

**方案**: 删除 Agent 配置时，弹窗提示：

```
┌─ 确认删除 Agent ────────────────────────────┐
│                                             │
│  确定删除 Agent "coder"？                   │
│                                             │
│  该 Agent 关联 8 条记忆，如何处理？          │
│                                             │
│  ○ 保留记忆（移至 default Agent）           │
│  ○ 归档记忆（不再自动召回）                  │
│  ○ 永久删除                                 │
│                                             │
│         [ 取消 ]  [ 确认 ]                  │
└─────────────────────────────────────────────┘
```

### 8.3 Recall 的作用域过滤（Q2 决策: agent_id + workspace_dir）

```sql
-- 当前 Agent = coder, 当前 workspace = C:\proj\alpha

-- Step 1: 强制包含 pinned 记忆
SELECT * FROM memories WHERE pinned = 1 AND archived = 0;

-- Step 2: 精确作用域搜索（hybrid search 范围）
SELECT * FROM memories WHERE archived = 0 AND (
  -- 本 Agent + 本项目
  (agent_id = 'coder' AND workspace_dir = 'C:\proj\alpha')
  -- 本 Agent + 全局
  OR (agent_id = 'coder' AND workspace_dir IS NULL)
  -- default Agent + 本项目
  OR (agent_id = 'default' AND workspace_dir = 'C:\proj\alpha')
  -- default Agent + 全局
  OR (agent_id = 'default' AND workspace_dir IS NULL)
  -- 事实类记忆跨 Agent 可见
  OR category = 'fact'
);

-- Step 3: pinned 结果 + hybrid search 结果去重合并
-- pinned 记忆排在最前，其余按 hybrid score 排序
```

**无 workspace 场景**（如桌面默认会话无 workspaceDir）:
```sql
-- workspace_dir IS NULL 或未提供时，不做 workspace 过滤
-- 仅按 agent_id 过滤
```

### 8.4 记忆去重机制（参考 memory-lancedb）

写入前检查是否存在高度相似的记忆:

```typescript
async function checkDuplicate(text: string): Promise<MemoryEntry | null> {
  const embedding = computeEmbeddingBuffer(text)
  const all = getAllMemoriesWithEmbedding()
  for (const record of all) {
    if (record.embedding && cosineSimilarity(embedding, record.embedding) >= 0.95) {
      return record  // 找到重复
    }
  }
  return null
}

// 在 memorySave 中:
//   - tool 来源: 静默跳过重复（Agent 不需要知道）
//   - auto-capture: 静默跳过
//   - manual (UI): 提示用户 "检测到近似记忆，是否更新已有？"
```

### 8.5 记忆安全扫描（参考 Hermes + memory-lancedb）

写入前对内容执行安全检查:

```typescript
const MEMORY_THREAT_PATTERNS = [
  { pattern: /ignore\s+(previous|all)\s+instructions/i, type: 'prompt_injection' },
  { pattern: /system\s*prompt/i, type: 'prompt_injection' },
  { pattern: /<\s*(system|assistant|developer)\b/i, type: 'prompt_injection' },
  { pattern: /curl\s+.*\$(KEY|TOKEN|SECRET)/i, type: 'exfiltration' },
  { pattern: /authorized_keys/i, type: 'ssh_backdoor' },
]

// 检测到威胁时: 拒绝写入 + 日志警告
// memory_save 工具: 返回错误 "记忆内容包含可疑模式，已阻止"
// auto-capture: 静默跳过 + console.warn
```

### 8.6 memory_save 工具增强

```typescript
// 当前: memorySave(text, category, importance, sessionKey?)
// 改进: memorySave(text, opts: MemorySaveOptions)

interface MemorySaveOptions {
  category?: string     // default 'general'
  importance?: number   // default 5
  sessionKey?: string
  agentId?: string      // default 'default'
  workspaceDir?: string // default null (全局)
  source?: 'tool' | 'auto-capture' | 'manual'  // default 'tool'
  pinned?: boolean      // default false
}

// memory_save 工具调用时:
memorySave(text, {
  category, importance,
  sessionKey: ctx.sessionKey,
  agentId: ctx.agentId,
  workspaceDir: ctx.workspaceDir,
  source: 'tool',
})

// autoCapture 调用时:
memorySave(text, {
  category: 'general', importance: 6,
  sessionKey, agentId, workspaceDir,
  source: 'auto-capture',
})

// UI 手动添加时:
memorySave(text, {
  category, importance, agentId, workspaceDir,
  source: 'manual',
  pinned,
})
```

### 8.7 编辑/删除后通知机制（Q3 决策: 通知）

```
用户编辑记忆 → PATCH /memories/:id
  ↓
Core 更新 DB + 重算 embedding
  ↓
Core 遍历所有活跃 session，清空 frozenMemorySnapshot = null
  ↓
下次该 session 的 assemble() 触发时，重新执行 hybrid search Recall
```

实现方式: `invalidateMemorySnapshots()` 函数，遍历 session store 中的活跃 session。

### 8.8 autoCapture 可见提示（Q5 决策: 需要）

**聊天流式输出中嵌入 autoCapture 事件**:

```typescript
// runner.ts autoCapture 成功后，通过 SSE 发送事件:
yield { type: 'memory-captured', data: { text, id, category } }

// Chat.tsx 收到事件后显示 toast:
// "💾 已自动记住: {text.slice(0, 60)}"
// [撤销] 按钮 → DELETE /memories/:id

// 高级设置中增加:
// MEMORY_AUTO_CAPTURE: 'on' | 'off'  (默认 'on')
```

---

## 9. 实现范围分期

### Phase M1: 基础记忆管理 UI + 安全（P0）

**Core 端**:
- `db.ts`: 新增 `agent_id`, `workspace_dir`, `source`, `updated_at`, `archived`, `pinned` 字段 + ALTER TABLE 迁移
- `db.ts`: 新增 `memoryUpdate()`, `memoryArchive()`, `memoryStats()`, `memoryListPaged()`
- `db.ts`: 新增 `checkMemoryDuplicate()` 去重检查（cosine≥0.95）
- `db.ts`: 新增 `scanMemoryThreats()` 安全扫描
- `db.ts`: `memorySave()` 签名改为 `memorySave(text, opts: MemorySaveOptions)`
- `index.ts`: 新增 REST API 路由（`GET/POST/PATCH/DELETE /memories`, `GET /memories/stats`）
- `index.ts`: 新增 `POST /memories/invalidate-snapshot`（内部通知）
- `memory.ts` 工具: `memorySave` 传入 sessionKey + agentId + workspaceDir + source
- `runner.ts`: autoCapture 传入完整上下文 + 通过 SSE 发送 `memory-captured` 事件

**Desktop 端**:
- `Settings.tsx`: 新增 `'memory'` tab
- `MemoryTab.tsx`: 新建组件 — 列表 + 搜索 + 过滤(分类/Agent/项目) + 分页 + 批量操作
- `MemoryEditDialog.tsx`: 编辑弹窗（含置顶开关）
- `MemoryAddDialog.tsx`: 添加弹窗（含去重提示）
- `Chat.tsx`: autoCapture toast 提示 + [撤销] 按钮
- `useGateway.ts`: 新增 memory CRUD hooks

**预估改动**: ~1000 行新增, ~80 行修改  
**测试**: ~25 assertions

### Phase M2: Agent + Workspace 作用域 + 通知（P1）

**Core 端**:
- `db.ts`: `memorySearchScoped()` — 按 agent_id + workspace_dir 过滤的搜索
- `db.ts`: `memoryGetPinned()` — 获取所有 pinned 记忆
- `default-engine.ts`: Recall 改为 pinned + scoped hybrid search
- `default-engine.ts`: `invalidateMemorySnapshots()` — 清空指定 session 的冻结快照
- `runner.ts`: autoCapture 传入 agentId + workspaceDir
- `memory.ts` 工具: memory_search 增加 agent/workspace 上下文过滤

**预估改动**: ~300 行修改  
**测试**: ~15 assertions

### Phase M3: 容量控制 + 时间衰减 + 导入导出（P2）

**Core 端**:
- `db.ts`: `memoryGC()` — 基于 importance 衰减 + 时间的归档策略
- `hybrid-search.ts`: 增加时间衰减因子 `exp(-ln2/30 * ageDays)`（参考 memory-core）
- `index.ts`: `GET /memories/export`, `POST /memories/import`（含安全扫描+去重）
- 可选: compaction 前 flush 钩子（参考 memory-core flush plan）

**Desktop 端**:
- 统计面板 + 容量提示
- 导入/导出按钮
- 高级设置: `MEMORY_AUTO_CAPTURE` 开关

**预估改动**: ~500 行  
**测试**: ~15 assertions

---

## 10. 与参考实现的差异说明

| 维度 | OpenClaw | Hermes | Equality (本设计) |
|------|----------|--------|-------------------|
| **存储** | SQLite + 文件系统 (.md) | Markdown 文件 (§分隔) | SQLite 单文件 (memory.db) |
| **搜索** | FTS5 + 多种 embedding provider | 无搜索（全注入 system prompt） | FTS5 + n-gram embedding hybrid |
| **作用域** | workspace 文件路径 | session_id + agent 身份 | **agent_id + workspace_dir 双维度** |
| **记忆置顶** | 无（靠文件路径永驻） | 无 | **pinned 字段** |
| **去重** | 无（文件追加模式） | 无 | **cosine≥0.95 去重** |
| **安全** | Citations + flush 围栏 | 威胁模式扫描 + 不可见字符检测 | **威胁模式扫描**（借鉴 Hermes） |
| **UI 管理** | 无独立管理界面 | 无 | **设置页 Memory Tab** |
| **autoCapture 可见性** | 无 | 无 | **Toast 提示 + 撤销** |
| **编辑通知** | 无（文件监视自动索引） | 冻结快照（不通知） | **清空快照 + 重新 Recall** |
| **容量控制** | 无硬限制 | 硬限制 2200+1375 chars | **时间衰减 + 软限制 + 归档** |

---

## 11. 相关文件清单

| 文件 | 说明 |
|------|------|
| `packages/core/src/memory/db.ts` | 记忆 CRUD + FTS5 + embedding (334行) |
| `packages/core/src/memory/index.ts` | 导出模块 |
| `packages/core/src/memory/hybrid-search.ts` | BM25 + cosine 混合搜索 (141行) |
| `packages/core/src/memory/embeddings.ts` | 向量计算 (108行) |
| `packages/core/src/tools/builtins/memory.ts` | memory_save / memory_search 工具 (161行) |
| `packages/core/src/context/default-engine.ts` | auto Recall 逻辑 (337行) |
| `packages/core/src/agent/runner.ts` | autoCapture 逻辑 |
| `packages/core/src/index.ts` | REST API 路由 (962行) |
| `packages/core/src/config/agent-scope.ts` | Agent ID 解析 (145行) |
| `packages/core/src/session/key.ts` | SessionKey 格式 (34行) |
| `packages/core/src/session/store.ts` | Session 存储（frozenMemorySnapshot 在这里） |
| `packages/desktop/src/Settings.tsx` | 设置页 (1245行) |
| `packages/desktop/src/Chat.tsx` | 聊天界面（autoCapture toast 将在这里） |
| `packages/desktop/src/useGateway.ts` | API hooks |

---

## 附录 A: OpenClaw memory-core 搜索流程

```
getMemorySearchManager()
  → resolveBackend() → "qmd" | "builtin"
  → MemoryIndexManager (SQLite)
    → search(query)
      1. FTS5 keyword search (BM25)
      2. Vector search (embedding → cosine)
      3. mergeHybridResults(vectorWeight, textWeight)
      4. temporal decay: score × exp(-ln2/halfLife × ageDays)
      5. MMR rerank (Jaccard similarity)
      6. minScore filter → truncate
```

## 附录 B: Hermes MemoryProvider 生命周期

```
initialize(session_id)
  → system_prompt_block()        // 静态段
  → prefetch(query)              // 查询级召回
  → [对话循环]
    → on_turn_start()
    → sync_turn(user, assistant)
    → on_memory_write()          // 内置记忆写入镜像
  → on_pre_compress(messages)    // 压缩前提取
  → on_session_end(messages)     // 会话结束
  → shutdown()
```

## 附录 C: 安全扫描模式列表（从 Hermes + memory-lancedb 汇总）

```
prompt_injection:
  - /ignore (previous|all) instructions/i
  - /system prompt/i
  - /<(system|assistant|developer|tool)\b/i
  - /you are now/i

exfiltration:
  - /curl.*\$(KEY|TOKEN|SECRET)/i
  - /wget.*password/i

ssh_backdoor:
  - /authorized_keys/i
  - /id_rsa/i
```
