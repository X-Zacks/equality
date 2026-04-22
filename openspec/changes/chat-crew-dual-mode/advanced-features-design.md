# 设计：Skills 向量嵌入检索 + 使用频率统计 + Crew Multi-Agent 编排

> 状态：Draft  
> 日期：2026-04-22  
> 前置：chat-crew-dual-mode Phase 1-4 已完成

---

## 一、Skills 向量嵌入检索

### 1.1 背景

当前 `SkillRetriever`（Phase 3）使用 BM25 + 关键词匹配做 Skill 检索。对于精确关键词查询效果好，但语义模糊查询（如"帮我画个图" → `canvas-design`、`algorithmic-art`）覆盖率不足。

### 1.2 方案

```
┌──────────────────────────────┐
│        Hybrid Retriever      │
│                              │
│   Query ──┬─► BM25 (fast)  ─┤
│           │                  │  RRF Merge → Top K
│           └─► Vector (deep) ─┤
│                              │
└──────────────────────────────┘
```

**技术选型：**

| 组件 | 选择 | 理由 |
|------|------|------|
| Embedding 模型 | `@xenova/transformers` (onnx) | 本地推理、无网络依赖、~30MB 模型 |
| 模型名 | `all-MiniLM-L6-v2` | 384 维、速度快、英文+中文可用 |
| 向量存储 | 内存 `Float32Array[]` + JSON 缓存 | Skill 数量 ≤500，无需外部数据库 |
| 相似度 | Cosine similarity | 标准选择 |

**索引构建流程：**

```
Skills 加载 / 变更
      │
      ▼
对每个 Skill 拼接文本:  name + " " + description + " " + category
      │
      ▼
transformers pipeline('feature-extraction', model)
      │
      ▼
存入 Float32Array[] + 缓存到 %APPDATA%/Equality/cache/skill-embeddings.json
```

**检索流程：**

```
User Query
    │
    ├─► BM25 检索 → scores_bm25[]
    │
    └─► Embed(query) → cosine_similarity(query_vec, all_vecs) → scores_vec[]
    │
    ▼
RRF (Reciprocal Rank Fusion):
  score(doc) = Σ 1/(k + rank_in_list)   where k=60
    │
    ▼
Top K results
```

**关键接口变更：**

```typescript
// skills/retriever.ts 扩展
interface SkillRetriever {
  // 现有
  search(query: string, topK?: number): ScoredSkill[]
  rebuild(skills: SkillEntry[]): void

  // 新增
  rebuildEmbeddings(skills: SkillEntry[]): Promise<void>  // 异步，首次较慢
  hybridSearch(query: string, topK?: number): Promise<ScoredSkill[]>  // BM25 + Vector
}
```

**性能预估：**
- 首次构建 300 个 Skill 嵌入：~3-5s（模型加载 + 推理）
- 缓存后重建：~200ms（仅增量）
- 单次查询：~50ms（embed + 线性扫描 300 向量）

### 1.3 降级策略

- 模型加载失败 → 回退到纯 BM25（当前行为）
- 首次启动时异步构建嵌入，不阻塞主流程
- 用户可在设置中关闭向量检索以节省内存

---

## 二、Skills 使用频率统计

### 2.1 背景

了解哪些 Skills 被频繁使用，可以优化推荐排序、帮助用户发现高价值 Skills。

### 2.2 数据模型

```typescript
// skills/usage-stats.ts
interface SkillUsageRecord {
  skillName: string
  totalInvocations: number     // 总调用次数
  lastUsedAt: string           // ISO timestamp
  sessionsUsed: number         // 在多少个 session 中使用过
  avgTurnsPerSession: number   // 平均每 session 使用几轮
  createdAt: string
}

interface SkillUsageStore {
  /** 记录一次 Skill 使用 */
  recordUsage(skillName: string, sessionKey: string): void
  
  /** 获取排序后的使用统计 */
  getStats(sortBy?: 'frequency' | 'recency'): SkillUsageRecord[]
  
  /** 获取某个 session 中使用过的 Skills */
  getSessionSkills(sessionKey: string): string[]
}
```

### 2.3 存储

```
%APPDATA%/Equality/skill-usage.json
{
  "skills": {
    "coding": { "totalInvocations": 42, "lastUsedAt": "...", "sessionsUsed": 15, ... },
    "git": { "totalInvocations": 28, ... }
  },
  "sessions": {
    "session-abc": ["coding", "git", "bash"],
    "session-def": ["frontend-design"]
  }
}
```

### 2.4 采集时机

```
Agent Runner → tool_result 解析
  │
  ├─ Skill 被 O3 匹配激活 → recordUsage(skillName, sessionKey)
  │
  └─ skill_search 返回结果后用户实际使用 → recordUsage(skillName, sessionKey)
```

**具体切入点：**
- `agent/runner.ts`：在 Skill 激活逻辑处调用 `recordUsage()`
- `tools/builtins/skill-search.ts`：在返回结果时不记录（仅搜索），实际使用时由 runner 记录

### 2.5 应用场景

1. **Retriever 加权**：`hybridSearch` 结果用 `log(totalInvocations + 1)` 给频繁使用的 Skill 加分
2. **Crew 推荐**：`recommender.ts` 参考使用频率推荐常用 Skills
3. **Desktop UI**：CrewPanel Skills 列表按使用频率排序，显示使用次数 badge
4. **Getting Started**：向新用户推荐高频 Skills

---

## 三、Crew 内部 Multi-Agent 编排

### 3.1 背景

当前 Crew 是单 Agent + 多 Skills 模式。对于复杂任务（如"全栈开发"需要前端 + 后端 + 测试协作），需要 Crew 内部支持多个 Agent 角色分工。

### 3.2 架构

```
                     Crew Session
                          │
                          ▼
                 ┌─────────────────┐
                 │   Orchestrator  │  ← 主控 Agent（规划 + 分发）
                 └────┬───┬───┬───┘
                      │   │   │
               ┌──────┘   │   └──────┐
               ▼          ▼          ▼
          ┌────────┐ ┌────────┐ ┌────────┐
          │ Agent A│ │ Agent B│ │ Agent C│
          │前端开发│ │后端开发│ │ 测试   │
          └────────┘ └────────┘ └────────┘
              │          │          │
              Skills     Skills     Skills
```

### 3.3 数据模型

```typescript
// crew/types.ts 扩展
interface CrewTemplate {
  // ... 现有字段 ...

  /** Multi-Agent 编排配置（可选，不设则为单 Agent 模式） */
  agents?: CrewAgentConfig[]

  /** 编排策略 */
  orchestration?: OrchestrationType
}

interface CrewAgentConfig {
  role: string                  // 角色标识: 'frontend', 'backend', 'tester'
  name: string                  // 显示名称
  systemPromptExtra: string     // 该角色的专属 System Prompt
  skillNames: string[]          // 该角色绑定的 Skills
  toolAllow?: string[]          // 该角色可用的工具白名单
  toolDeny?: string[]           // 该角色不可用的工具
  model?: string                // 该角色偏好模型
}

type OrchestrationType =
  | 'sequential'    // 顺序执行：A → B → C
  | 'parallel'      // 并行执行：A || B || C → 汇总
  | 'orchestrator'  // 主控分发：Orchestrator 决定调用哪个 Agent
  | 'round-robin'   // 轮流发言
```

### 3.4 编排引擎

```typescript
// crew/orchestrator.ts
interface OrchestrationEngine {
  /**
   * 执行一轮编排
   * @param userMessage 用户输入
   * @param crew 当前 Crew 配置
   * @param session 当前 Session
   * @returns 编排后的响应流
   */
  execute(
    userMessage: string,
    crew: CrewTemplate,
    session: Session,
  ): AsyncGenerator<OrchestrationEvent>
}

type OrchestrationEvent =
  | { type: 'agent_start'; role: string; name: string }
  | { type: 'agent_text'; role: string; text: string }
  | { type: 'agent_tool_call'; role: string; toolCall: ToolCallEvent }
  | { type: 'agent_done'; role: string }
  | { type: 'orchestrator_thinking'; text: string }
  | { type: 'summary'; text: string }
```

### 3.5 Orchestrator 策略

**Sequential（顺序执行）：**
```
User: "实现一个登录页面"
  → Agent A (前端): 创建 LoginPage.tsx + CSS
  → Agent B (后端): 创建 /api/auth 路由
  → Agent C (测试): 写 LoginPage.test.tsx + auth.test.ts
  → Summary: 汇总三个 Agent 的工作
```

**Orchestrator（主控分发）：**
```
User: "实现一个登录页面"
  → Orchestrator 分析任务，生成执行计划:
      1. [frontend] 创建登录页面组件
      2. [backend] 创建认证 API
      3. [frontend] 对接 API
      4. [tester] 写端到端测试
  → 按计划逐步分发给对应 Agent
  → 每步完成后 Orchestrator 审查并决定下一步
```

### 3.6 Sub-Session 隔离

每个 Agent 使用独立的 sub-session 保持上下文隔离：

```
Crew Session: crew-session-abc
  ├── Sub-session: crew-session-abc::agent::frontend
  ├── Sub-session: crew-session-abc::agent::backend
  └── Sub-session: crew-session-abc::agent::tester
```

共享信息通过 Orchestrator 的 summary 传递，避免上下文膨胀。

### 3.7 Desktop UI

```
┌─────────────────────────────────────────┐
│ 🤖 全栈开发 Crew                        │
├─────────┬─────────┬─────────────────────┤
│ 💬 Chat │ 📋 Plan │ 🔄 Agent Activity   │
├─────────┴─────────┴─────────────────────┤
│                                         │
│ [Orchestrator] 正在分析任务...           │
│                                         │
│ ┌─ 🎨 前端 Agent ─────────────────────┐ │
│ │ 正在创建 LoginPage.tsx...           │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ ⚙️ 后端 Agent ─────────────────────┐ │
│ │ ⏳ 等待前端完成...                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### 3.8 实施分期

| 阶段 | 内容 | 复杂度 |
|------|------|--------|
| **M1** | Sequential 模式 + 基础 UI | 中等 |
| **M2** | Orchestrator 模式 + 执行计划 UI | 高 |
| **M3** | Parallel 模式 + 并发控制 | 高 |
| **M4** | Agent 间通信协议 + 冲突检测 | 很高 |

---

## 四、实施优先级

```
 优先级   功能                  依赖          预估工期
 ─────────────────────────────────────────────────────
  P0     使用频率统计            无            1-2 天
  P1     向量嵌入检索            无            2-3 天
  P2     Multi-Agent Sequential  频率统计      3-5 天
  P3     Multi-Agent Orchestrator Sequential   5-7 天
```

**建议路线：** P0 → P1 → P2 → P3

- P0（频率统计）最简单且立刻有业务价值，可以优化所有检索和推荐
- P1（向量嵌入）是检索质量的质变，对 skill_search 和 Crew 推荐都有提升
- P2/P3 是较大的架构变更，建议在 P0/P1 稳定后再启动

---

## 五、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| ONNX 模型加载慢 | 首次启动延迟 3-5s | 异步加载 + 缓存嵌入结果 |
| 中文嵌入质量差 | 语义检索不准 | 可选 `paraphrase-multilingual-MiniLM-L12-v2`（更大但多语言更好） |
| Multi-Agent token 消耗 | 每轮多个 Agent 调用 | Orchestrator 智能跳过不相关 Agent |
| 并发工具执行冲突 | Agent A 和 B 同时编辑同一文件 | 文件锁 + Orchestrator 调度避免冲突 |
| 使用频率数据膨胀 | 长期使用后 JSON 文件变大 | 定期 GC（>90 天的 session 记录自动清理） |
