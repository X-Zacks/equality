# Phase O: 自我进化闭环 — 技术设计

---

## 架构总览

```
用户输入
  ↓
DefaultContextEngine.assemble()
  ├─ Session 恢复 (store.ts → persist.ts → JSON)
  ├─ System Prompt 构建 (system-prompt.ts)
  ├─ ★ O1: 冻结记忆快照（会话首轮冻结，后续不变）
  ├─ Memory Recall (memory/db.ts → SQLite FTS5)
  ├─ Tool Result Budget 截断（已有）
  └─ ★ O2: 上下文压缩（LLM 摘要 + 迭代更新）
  ↓
Runner.toolLoop (runner.ts)
  ├─ while (loopCount < maxLlmTurns)
  ├─ ★ O1: 迭代预算压力警告（70%/90%）
  ├─ streamChat → 工具调用 → 执行
  ├─ ★ O3: Skill 自动沉淀（任务完成后检测）
  └─ ★ O4: session_search 工具（新增）
  ↓
DefaultContextEngine.afterTurn()
  ├─ 追加消息到 Session + persist()
  ├─ record() → cost-ledger.db
  └─ ★ O4: 写入 session-search.db FTS5 索引
```

---

## O1: 记忆增强 + 迭代预算

### O1.1 冻结记忆快照

**问题**: 当前 `assemble()` 每轮都调用 `memorySearch()` 做 recall，结果可能轮轮不同（因为中途 memory_save 了新条目），导致 system prompt 不稳定，破坏 prompt cache。

**方案**: 借鉴 hermes-agent 的 frozen snapshot 模式。

```typescript
// DefaultContextEngine.assemble() 中：
interface AssembleContext {
  // ... 现有字段
  /** 会话级冻结记忆快照（首轮生成，后续复用） */
  frozenMemorySnapshot?: string
}

// 首轮（session.messages 中只有 1 条 user message）:
//   调用 memorySearch(userMessage) → 生成快照 → 存入 session.frozenMemorySnapshot
// 后续轮:
//   直接使用 session.frozenMemorySnapshot，不再调用 memorySearch

// memory_save 工具调用时：
//   写入 SQLite（正常）
//   不更新当前 session 的快照
//   下个会话才能看到新写入的记忆
```

**数据模型变更**: Session 类型新增可选字段：
```typescript
interface Session {
  // ... 现有字段
  frozenMemorySnapshot?: string   // O1.1: 冻结的记忆文本
}
```

**文件影响**:
- `packages/core/src/context/default-engine.ts` — assemble() 中的 memory recall 逻辑
- `packages/core/src/session/types.ts` — Session 类型扩展
- `packages/core/src/session/persist.ts` — 持久化时包含快照

### O1.2 记忆容量管理

**问题**: 当前 memory 存储无限增长，长期使用后 recall 结果质量下降。

**方案**: 为 memory recall 结果设置 token 预算上限。

```typescript
const MEMORY_RECALL_MAX_CHARS = 4000  // ≈1000 tokens

// assemble() 中 recall 结果超过预算时：
// 1. 按 importance DESC, created_at DESC 排序
// 2. 逐条累加字符，超预算则截断
```

**文件影响**:
- `packages/core/src/context/default-engine.ts` — recall 结果截断逻辑

### O1.3 迭代预算压力警告

**问题**: 当前 `AGENT_MAX_LLM_TURNS` 到达上限时直接硬截断（break），LLM 不知道自己快用完预算了，经常在最后一轮还在调用工具而不是给出最终回复。

**方案**: 在工具结果中注入预算提醒。

```typescript
// runner.ts toolLoop 内，每轮结束时检查：
const turnsUsed = loopCount
const turnsMax = maxLlmTurns
const ratio = turnsUsed / turnsMax

if (ratio >= 0.9) {
  // 注入到最后一个 tool result 消息的末尾
  lastToolResult.content += `\n\n[BUDGET: ${turnsUsed}/${turnsMax} iterations used. ` +
    `You MUST provide your final response NOW. Do not make more tool calls.]`
} else if (ratio >= 0.7) {
  lastToolResult.content += `\n\n[BUDGET: ${turnsUsed}/${turnsMax} iterations used. ` +
    `Start wrapping up — summarize progress and plan remaining work concisely.]`
}

// 同时通过 onDelta 向 UI 发送可视化提醒
if (ratio >= 0.7) {
  onDelta?.(`\n⚠️ 迭代预算: ${turnsUsed}/${turnsMax}\n`)
}
```

**文件影响**:
- `packages/core/src/agent/runner.ts` — toolLoop 中注入警告

---

## O2: 上下文压缩

### 核心算法

```
触发条件: token 估算 ≥ contextWindow × 50% 或 消息数 ≥ 30
  ↓
Step 1: 预剪枝 — 旧 tool result 替换为 "[output cleared]"
  ↓
Step 2: 保护头部 — system prompt + 前 2 条消息（首轮交换）
  ↓
Step 3: 保护尾部 — 最近 N 条消息（token 预算 = contextWindow × 20%）
  ↓
Step 4: 摘要中间 — 用当前对话同模型生成结构化摘要
  ↓
Step 5: 替换 — 用摘要消息替换中间消息
  ↓
Step 6: 迭代更新 — 下次压缩时基于上次摘要增量更新
```

### 摘要 Prompt 模板

```
以下是一段对话的中间部分，请生成结构化摘要：

## 目标
[用户在这段对话中试图完成什么]

## 已完成
[已经完成的步骤和结果]

## 关键决策
[做出的技术选择和原因]

## 修改的文件
[已修改的文件列表]

## 下一步
[接下来需要做什么]
```

### 压缩消息格式

```typescript
// 压缩摘要作为 system 消息插入到头部消息之后：
{
  role: 'system',
  content: `[上下文压缩] 以下是之前对话的摘要。之前的工作可能已经反映在当前文件状态中。\n\n${summary}`
}
```

### 关键参数

```typescript
interface CompressionConfig {
  /** 触发阈值：token 使用率 */
  thresholdPercent: 0.50
  /** 触发阈值：消息数量 */
  thresholdMessages: 30
  /** 保护头部消息数 */
  protectHeadN: 2
  /** 尾部 token 预算（占 contextWindow 比例） */
  tailBudgetRatio: 0.20
  /** 摘要最大 token */
  summaryMaxTokens: 4000
  /** 压缩失败冷却期（秒） */
  failureCooldownSeconds: 600
}
```

### 使用当前对话同模型压缩

考虑到 Copilot 的按次计费模型（Business 300 requests/月），每次压缩消耗 1 个 premium request。这比引入独立的廉价模型更简单，且不需要额外 API Key 配置。如果用户使用的是按 token 计费的模型（如通义千问），成本也在可接受范围内（压缩 prompt ≈2K input tokens + 1K output tokens）。

**文件影响**:
- `packages/core/src/context/default-engine.ts` — 新增 `compactMessages()` 方法
- `packages/core/src/context/compressor.ts` — **新文件**: 压缩逻辑独立模块
- `packages/core/src/agent/runner.ts` — 每轮循环前检查是否需要压缩

---

## O3: 技能系统增强

### 当前状态

Equality 已有 Skills 基础设施：
- `skills/prompt.ts` — XML 索引注入 system prompt（name + description + location）
- `skills/loader.ts` — 从多来源加载 SKILL.md
- `system-prompt.ts` — "Skill 沉淀"指令（已引导 Agent 在完成复杂任务后创建 Skill）

### 需要增强的部分

#### O3.1 技能存储位置

存储在 workspace 目录：`~/Equality/workspace/skills/`（用户决策 Q2=A）

Agent 用现有的 `write_file` 工具在此目录下创建 SKILL.md 即可，无需新工具。

#### O3.2 System Prompt 中 Skill 自动触发增强

当前已通过 `<available_skills>` XML 索引注入。每个 Skill ≈200-300 字符（name+description+location），上限 150 个 / 30K 字符 ≈ 7500 tokens。

**增强**: Skill description 中已要求包含 `Use when:` 和 `NOT for:` 标记（见 system-prompt.ts 中的 frontmatter 格式规范）。进一步强化 system prompt 中的匹配指令：

```
回复前：扫描 <available_skills> 中每个 <description>。
- 如果某个 Skill 的 "Use when" 场景匹配用户请求：用 read_file 读取其 SKILL.md，严格按步骤执行。
- 执行 Skill 时如果发现步骤过时或有误，用 write_file 直接修补该 SKILL.md（不要等到下次）。
```

#### O3.3 Skill 沉淀主动提醒增强

当前 system prompt 已有"Skill 沉淀"指令。增强提醒的触发条件和措辞：

在 system prompt 的 `## Skill 沉淀` 部分追加：

```
完成以下任一场景时，必须主动询问用户是否保存为 Skill：
1. 使用了 3 个以上不同工具调用来完成一个任务
2. 修复了一个需要多步调试的问题
3. 完成了涉及特定 API / 框架 / 工具链的配置流程
4. 用户说了"不错"、"很好"、"以后还用得到"等肯定反馈

提议格式：
> 💡 这个任务可以保存为 Skill "xxx"，下次遇到类似问题时我会自动使用。要保存吗？
```

**文件影响**:
- `packages/core/src/agent/system-prompt.ts` — 增强 Skill 匹配和沉淀指令

---

## O4: 会话搜索

### 架构

```
session_search 工具
  ↓
session-search.db (SQLite FTS5)
  ├─ sessions 表 (key, title, created_at, message_count)
  └─ session_messages_fts (session_key, role, content)  ← FTS5
  ↓
搜索流程:
  1. FTS5 查询匹配消息
  2. 按 session 分组，取 top 3
  3. 加载匹配 session 的消息上下文
  4. 用当前对话同模型生成摘要
  5. 返回结构化的每 session 摘要
```

### SQLite Schema

```sql
-- session-search.db
CREATE TABLE IF NOT EXISTS session_index (
  session_key  TEXT PRIMARY KEY,
  title        TEXT,
  created_at   INTEGER NOT NULL,
  last_active  INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS session_messages_fts USING fts5(
  session_key,
  role,
  content,
  tokenize='unicode61'
);
```

### 索引时机

在 `DefaultContextEngine.afterTurn()` 中，persist 之后将 user/assistant 消息写入 FTS5 索引：

```typescript
// afterTurn() 尾部追加：
sessionSearchDb.indexMessage(sessionKey, 'user', userMessage)
sessionSearchDb.indexMessage(sessionKey, 'assistant', assistantResponse)
sessionSearchDb.upsertSession(sessionKey, session.title, session.messages.length)
```

### session_search 工具定义

```typescript
{
  name: 'session_search',
  description: 'Search past conversation sessions by keyword. Use this when the user references ' +
    'something from a previous conversation, asks "did we discuss...", or you need cross-session context. ' +
    'Returns summarized results from matching sessions.',
  parameters: {
    query: { type: 'string', description: 'Search query (keywords or natural language)' },
    max_results: { type: 'number', description: 'Maximum sessions to return (default 3, max 5)' },
  },
  required: ['query'],
}
```

### Session Search Guidance in System Prompt

在 `## 长期记忆系统` 部分追加：

```
**何时使用 session_search**：
- 用户提到"上次我们讨论的…"、"之前那个项目…"
- 需要查找之前对话中的代码、决策或步骤
- memory_search 找不到相关内容时，尝试搜索历史会话

session_search 搜索的是完整对话历史，而 memory_search 搜索的是你主动保存的摘要。两者互补使用。
```

**文件影响**:
- `packages/core/src/session/search-db.ts` — **新文件**: FTS5 索引管理
- `packages/core/src/tools/builtins/session-search.ts` — **新文件**: 工具定义
- `packages/core/src/context/default-engine.ts` — afterTurn() 中写索引
- `packages/core/src/agent/system-prompt.ts` — 添加 session_search guidance

---

## 数据库布局（最终状态）

```
%APPDATA%/Equality/
├── sessions/           ← JSON 文件（已有）
│   └── {key}.json
├── memory.db           ← 长期记忆 FTS5（已有）
├── cost-ledger.db      ← 费用追踪（已有）
└── session-search.db   ← ★ 新增: 会话搜索 FTS5
```

---

## 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 压缩消耗额外 Copilot request | 🟡 | 阈值设 50%，避免过早触发；长对话才压缩 |
| 冻结快照导致新记忆不可见 | 🟢 | memory_save 工具回复中告知用户"将在下次对话生效" |
| Session FTS5 数据库膨胀 | 🟡 | 只索引 user + assistant 消息；定期清理 > 90 天的条目 |
| 压缩摘要质量不够 | 🟡 | 使用当前对话同模型；结构化摘要模板保证关键信息 |
| 预算警告干扰 LLM 正常工作 | 🟢 | 注入到 tool result 末尾（非独立消息），对 prompt cache 影响最小 |
