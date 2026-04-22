# Skills 智能化分析：从全量加载到按需匹配

> 2026-04-22 · Equality 架构讨论

---

## 1. 现状诊断

### 1.1 当前 Skills 如何注入上下文

```
loadAllSkills(workspaceDir)          // 启动时扫描 6 级目录，全量加载
    ↓
buildSkillsPromptBlock(skills)       // 取 name + description + location，生成 XML 索引
    ↓
<available_skills>                   // 注入 System Prompt 尾部
  <skill>
    <name>...</name>
    <description>...</description>   // 每个 ≤200 chars
    <location>...</location>
  </skill>
  × N 个
</available_skills>
```

**限制阀门**：`MAX_SKILLS_IN_PROMPT = 150`，`MAX_SKILLS_PROMPT_CHARS = 30_000`

**结论：是的，300 个 Skills 会全部加载索引到上下文中**（受 150 个 / 30K 字符的硬限制）。每个 Skill 索引约 ~200 字符，150 个就是 ~30K 字符（约 8K tokens），**每轮对话都在消耗**。

### 1.2 当前的"匹配"机制

System Prompt 里的 `O3` 规则要求 LLM：

> "回复前扫描 `<available_skills>` 中每个 `<description>`，如果恰好有一个匹配就用 `skill_view` 读取全文"

**问题**：这是把"搜索引擎"的工作交给了 LLM——让模型在 150 个 Skill 描述中做文本匹配。这有几个严重缺陷：

| 问题 | 影响 |
|------|------|
| **注意力稀释** | 8K tokens 的技能索引分散了模型对用户意图的注意力，小模型尤其严重 |
| **误选/漏选** | description 相似的 Skill 容易被混淆（如 `git-commit` vs `git-rebase`） |
| **token 浪费** | 300 个 Skill 中用户常用的可能就 10-20 个，其余 280 个纯浪费 |
| **不可控** | 没有 Skill 匹配时模型可能幻觉出一个、或强行套用不相关的 Skill |
| **无检索触发** | 没有"需要时才搜索"机制——全量索引永远在 prompt 里 |

### 1.3 当前 Purpose 系统的局限

`purpose.ts` 实现了纯文本模式匹配的 Purpose 推断：

```typescript
inferPurpose('帮我修复 login 页面的 bug')
// → { goal: '修复 login 页面的 bug', source: 'inferred' }
```

**但 Purpose 和 Skills 之间没有任何连接**——推断出 goal 后并不会据此筛选相关的 Skills。

### 1.4 角色系统（role-config.ts）

已有 5 个预置角色（supervisor/architect/developer/tester/reviewer），每个角色已经绑定了 `skills` 字段：

```typescript
developer: { skills: ['project-dev-workflow'] }
supervisor: { skills: ['supervisor-workflow', 'openspec-skill'] }
```

**但这套角色系统目前只在 multi-agent 编排场景使用，单用户直接对话时不走角色配置。**

---

## 2. 核心问题总结

```
┌─────────────────────────────────────────────────────────────────┐
│  用户有 300 个 Skills                                           │
│  ↓                                                              │
│  每轮对话：150 个索引 → ~8K tokens 注入 System Prompt           │
│  ↓                                                              │
│  LLM 自己在 150 个描述中做匹配 → 注意力稀释 + 可能误选          │
│  ↓                                                              │
│  用户实际只需 20 个 → 280 个是噪音                               │
└─────────────────────────────────────────────────────────────────┘
```

**需要解决的三个问题**：
1. **如何不把全量 Skills 塞进每轮 prompt？** → 按需检索
2. **如何让用户明确"我这个场景用哪些 Skills"？** → 角色 + Skills 绑定
3. **用户不确定时怎么办？** → 智能推荐 / 引导式对话

---

## 3. 方案设计：三层 Skill 分发架构

### 3.1 架构总览

```
                    ┌──────────────────────────┐
    Layer 1         │   Session Role Profile   │
    (会话级)        │   角色 = Purpose + Skills │
                    └──────────┬───────────────┘
                               │
                    ┌──────────▼───────────────┐
    Layer 2         │   Skill Retriever (RAG)  │
    (按需检索)      │   语义搜索 + 关键词匹配   │
                    └──────────┬───────────────┘
                               │
                    ┌──────────▼───────────────┐
    Layer 3         │   Always-on Skills       │
    (固定注入)      │   metadata.always = true  │
                    └──────────────────────────┘
```

### 3.2 Layer 1：Session Role Profile（角色档案）

**核心思想**：从 Purpose 产生角色，角色绑定 Skills 子集。

```typescript
interface SessionRoleProfile {
  /** 角色名称（可自定义或从模板选择） */
  roleName: string
  /** 角色描述（一句话） */
  description: string
  /** 绑定的 Skill 名称列表 */
  skillNames: string[]
  /** 来源 */
  source: 'user-selected' | 'purpose-inferred' | 'template'
}
```

**用户交互流程**：

```
场景 A：用户明确知道要做什么
┌───────────────────────────────────────────────────────┐
│ 用户：新建会话 → 选择角色模板 "前端开发"               │
│ 系统：自动绑定 [react-dev, css-layout, git-workflow]  │
│ 用户：还可以手动 +/- Skills                           │
│ → 只有这些 Skills 索引注入 prompt                      │
└───────────────────────────────────────────────────────┘

场景 B：用户不确定
┌───────────────────────────────────────────────────────┐
│ 用户："帮我做数据分析"                                 │
│ 系统（Purpose 推断）：goal = "数据分析"                │
│ 系统（LLM 推理一次）：推荐角色 "数据分析师"            │
│   推荐 Skills: [python-data, csv-parser, chart-gen]   │
│ 系统："我建议使用以下技能，确认还是调整？"              │
│   [确认] [调整] [跳过，我自己来]                       │
│ → 用户确认后绑定到会话                                 │
└───────────────────────────────────────────────────────┘

场景 C：闲聊/简单问答
┌───────────────────────────────────────────────────────┐
│ 用户："你好" / "JavaScript 闭包是什么"                  │
│ 系统：不绑定角色，不注入任何 Skills 索引                │
│ → 节省 8K tokens                                       │
└───────────────────────────────────────────────────────┘
```

### 3.3 Layer 2：Skill Retriever（按需语义检索）

**当角色未绑定 Skills，或对话中途出现新需求时**，通过检索动态找到相关 Skill。

```typescript
interface SkillRetriever {
  /**
   * 根据用户意图搜索匹配的 Skills
   * @returns top-K 最相关的 Skills（默认 K=5）
   */
  search(query: string, topK?: number): ScoredSkill[]
}

interface ScoredSkill {
  skill: Skill
  score: number      // 0-1 相关性分数
  matchReason: string // "关键词匹配: git" / "语义匹配: 代码审查"
}
```

**检索策略（无需外部向量数据库）**：

```
1. 关键词匹配（快速路径）
   - Skill.name 精确/前缀匹配
   - Skill.metadata.category 匹配
   - Skill.metadata.tools 匹配（用户消息提到了某个工具名）

2. TF-IDF / BM25（轻量级）
   - 对 description + body 建立倒排索引（启动时一次性构建）
   - 用户消息分词后检索

3. LLM 辅助判断（慢速路径，可选）
   - 当 1+2 都没有高置信匹配时
   - 把 top-10 候选的 name+description 发给 LLM，让它选 top-3
   - 这比把 150 个全塞进 prompt 高效得多
```

**触发时机**：

```typescript
// 在 runner.ts 的工具循环中，不再把 skills 索引塞进 system prompt
// 而是提供一个 skill_search 工具让 LLM 主动搜索

// 新增工具：skill_search
{
  name: 'skill_search',
  description: '搜索可用的技能。当你觉得当前任务可能有现成的 Skill 可以参考时使用。',
  parameters: {
    query: { type: 'string', description: '搜索关键词或意图描述' },
  }
}
```

### 3.4 Layer 3：Always-on Skills

`metadata.always = true` 的 Skills 始终注入（如 `project-dev-workflow`）。这些应该极少，建议限制在 **≤ 5 个**。

---

## 4. 对比：改造前 vs 改造后

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| System Prompt 中的 Skills | 全量 150 个索引（~8K tokens） | 角色绑定的 N 个（通常 3-10）+ always（≤5） |
| 匹配方式 | LLM 全文扫描 description | 角色预绑定 + skill_search 工具按需检索 |
| 用户参与 | 只能 @ 手动指定 | 角色选择 / 引导推荐 / @ 手动 三种 |
| Token 消耗（300 Skills） | ~8K tokens/轮 | ~1K tokens/轮（10 个绑定 Skill） |
| 误选风险 | 高（150 个相似描述） | 低（角色预筛 + 语义检索 top-K） |
| 冷启动（新会话） | 立即可用但全量加载 | 角色选择后立即可用，或首轮推理推荐 |

---

## 5. 实施路径

### Phase 1：Skill Retriever 基础（优先级：高）

**目标**：不再全量注入 Skills 索引，改为按需检索。

1. 实现 `SkillRetriever` 类（关键词 + BM25）
2. 新增 `skill_search` 工具，替代 system prompt 中的 `<available_skills>` 全量索引
3. System Prompt 中只保留 `always=true` 的 Skills + 角色绑定的 Skills
4. 修改 `buildSkillsPromptBlock`：接受过滤后的 Skill 子集

**改动范围**：
- 新建 `skills/retriever.ts`
- 修改 `skills/prompt.ts`（缩小注入范围）
- 修改 `agent/system-prompt.ts`（Skills 索引区只放绑定的）
- 新增 `tools/builtins/skill-search.ts`

### Phase 2：Session Role Profile（优先级：高）

**目标**：Purpose → 角色 → Skills 绑定链路。

1. 扩展 `SessionPurpose` 增加 `roleProfile` 字段
2. 创建角色模板库（`roles/templates.ts`），复用现有 `role-config.ts` 的结构
3. 实现 LLM 单次推理的角色推荐（发一个小请求给模型，附带 Skill 名称列表让它选）
4. UI 侧：新建会话时可选角色模板 / 看推荐结果

**改动范围**：
- 新建 `agent/role-profile.ts`
- 扩展 `purpose.ts`
- 修改 `runner.ts`（按 roleProfile 过滤 Skills）
- UI：`Chat.tsx` 新建会话时的角色选择器

### Phase 3：引导式对话（优先级：中）

**目标**：用户不确定时，通过对话引导确定角色和 Skills。

1. 首轮消息分析后，如果 purpose 推断出复杂任务（需要多个工具、多步骤）：
   - 用 interactive UI 展示推荐的角色 + Skills
   - 用户可确认/调整/跳过
2. 对话中途发现需要新 Skill 时：
   - `skill_search` 工具找到候选
   - 模型提议"我找到了 xxx Skill，要使用吗？"

### Phase 4：持续优化（优先级：低）

1. Skill 使用频率统计 → 个性化排序
2. 向量嵌入检索（本地 ONNX 模型）→ 更精准的语义匹配
3. Skill 依赖图（Skill A 经常和 Skill B 一起使用）→ 推荐捆绑

---

## 6. 关键设计决策

### Q1：skill_search 是工具还是自动触发？

**建议：工具**。让 LLM 决定何时搜索，而不是每轮自动搜索。原因：
- 简单问答不需要搜索任何 Skill
- 角色已绑定 Skills 时通常够用
- 模型自主决定 = 更灵活

### Q2：角色推荐用一次 LLM 调用，值得吗？

**值得**。一次小推理（~500 tokens input + ~100 tokens output）换来每轮节省 ~7K tokens。如果对话 10 轮，净节省 ~69K tokens。

### Q3：向后兼容？

- `metadata.always = true` 的 Skill 行为不变
- `@skill-name` 手动指定仍然有效
- 无角色绑定时，fallback 到 `skill_search` 工具

---

## 7. 总结

当前设计的核心问题是 **"全量索引 + LLM 自行匹配"**，在 Skills 数量增长后会导致注意力稀释和 token 浪费。解决方案是 **三层分发**：

1. **角色绑定**（静态、可控）：从 Purpose 推导角色，角色锁定 Skills 子集
2. **按需检索**（动态、精准）：`skill_search` 工具 + 本地 BM25/关键词检索
3. **始终注入**（极少量）：`always=true`，≤5 个

这样 300 个 Skills 的场景下，每轮 prompt 只注入 ~10 个相关 Skill 索引（~1K tokens），而不是 150 个（~8K tokens），同时通过角色绑定和按需检索保证不会漏掉重要的 Skill。
