# Chat vs Crew：双模态交互设计

> 2026-04-22 · Equality 架构讨论 v2

---

## 0. 命名

| 概念 | 名称 | 为什么 |
|------|------|--------|
| 无目的的自由对话 | **Chat** | 直觉、通用 |
| 有目的的任务执行体 | **Crew** | 比 Agent/Role 更有"团队协作"感，暗示它背后是一组 Skills 的协作 |
| Crew 的可复用配置模板 | **Crew Template** | 用户创建/下载的，如截图中的"话唠员工""高冷员工" |
| 从 Chat 提炼给 Crew 的上下文 | **Briefing** | 简报——把聊天中的关键信息打包交给 Crew |

> "Crew"也呼应了 CrewAI 生态中的概念，用户有认知基础。如果不喜欢，备选：**Craft**（工匠）、**Pilot**（领航员）。

---

## 1. 核心理念

```
┌─────────────────────────────────────────────────────────────────┐
│                        Equality Desktop                         │
│                                                                 │
│   ┌───────────┐        Briefing         ┌──────────────────┐   │
│   │           │  ──────────────────────► │                  │   │
│   │   Chat    │   "一键导入聊天上下文"     │   Crew Session   │   │
│   │   Mode    │                          │   Mode           │   │
│   │           │  ◄────────────────────── │                  │   │
│   │ 自由交谈   │    "我搞定了，结果如下"    │ 目标驱动任务执行  │   │
│   └───────────┘                          └──────────────────┘   │
│        │                                         │              │
│        │  用户想法成熟                             │              │
│        ▼                                         │              │
│   ┌───────────┐                                  │              │
│   │  Crew     │ ◄────────── 复用 ────────────────┘              │
│   │  Builder  │                                                 │
│   │  创建/编辑 │                                                 │
│   └───────────┘                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**两个模式，一个入口**：

- **Chat Mode**：自由对话，无 Skills 注入（或仅 always=true 的极少量），轻量、快速、省 token
- **Crew Session**：选择一个 Crew 后开启，绑定该 Crew 的 Skills、System Prompt、工具白名单，目标驱动

---

## 2. 用户旅程

### 旅程 A：用户有明确目标

```
1. 用户打开 Equality → 左侧看到 Crew 列表
2. 点击 "前端开发 Crew" → 自动创建 Crew Session
   - System Prompt 注入 Crew 的身份描述
   - 只加载绑定的 5 个 Skills 索引（react-dev, css-layout, git-workflow...）
   - 工具集按 Crew 配置过滤
3. 用户："帮我用 React 写一个登录表单"
4. LLM 看到 react-dev Skill 索引 → skill_view 读取 → 按步骤执行
```

### 旅程 B：用户没有明确目标（聊天探索 → 构建 Crew）

```
1. 用户打开 Equality → 点击"聊天"（Chat Mode）
2. 用户："我想做一个自动化测试框架，不知道从哪开始"
3. LLM（Chat 模式，无 Skills 注入）自由讨论
   - 推荐技术栈、讨论方案、画架构图
   - 多轮对话后，用户心中有了方案
4. 用户觉得可以开始干了：
   
   方式 a）手动创建 Crew
   - 点击"新建 Crew" → 命名"自动化测试" → 勾选 Skills
   
   方式 b）AI 辅助创建 Crew（推荐）
   - 用户："帮我根据我们的讨论创建一个 Crew"
   - LLM 分析聊天历史 → 提议 Crew 配置：
     "建议创建 Crew '自动化测试工程师'，绑定以下 Skills：
      ✅ pytest-workflow
      ✅ python-data
      ✅ git-workflow
      [确认创建] [调整] [取消]"
   - 用户确认 → 系统创建 Crew

5. 一键导入 Briefing：
   - 系统自动从聊天历史中提取关键决策和上下文
   - 注入到新 Crew Session 的首条系统消息中
   - Crew 开始工作时已经知道之前讨论的所有背景
```

### 旅程 C：使用已有 Crew 但遇到新需求

```
1. 用户在 "前端开发 Crew" 中工作
2. 突然需要写后端 API
3. LLM 发现当前 Crew 没有后端相关 Skill
4. 两种处理方式：
   a) skill_search 工具按需搜索：找到 "fastify-api" Skill → 临时使用
   b) 建议用户切换/新建 Crew："当前 Crew 主要是前端技能，建议切到全栈 Crew"
```

---

## 3. 数据模型

### 3.1 Crew Template（对应截图中的 Agent 配置）

```typescript
interface CrewTemplate {
  /** 唯一 ID */
  id: string
  /** 显示名称（如"话唠员工""前端开发"） */
  name: string
  /** 一句话描述 */
  description: string
  /** 头像/图标 emoji */
  emoji?: string
  /** 自定义 System Prompt 片段（追加到默认 prompt 后面） */
  systemPromptExtra?: string
  /** 绑定的 Skill 名称列表（只注入这些到上下文） */
  skillNames: string[]
  /** 工具白名单（可选，不设则全量） */
  toolAllow?: string[]
  /** 工具黑名单 */
  toolDeny?: string[]
  /** 模型偏好（可选覆盖全局默认） */
  preferredModel?: string
  /** 工具循环上限覆盖 */
  maxToolLoops?: number
  /** 来源 */
  source: 'builtin' | 'user-created' | 'gallery-downloaded' | 'chat-generated'
  /** 创建时间 */
  createdAt: string
}
```

### 3.2 Session 扩展

```typescript
// 现有 Session 扩展
interface SessionData {
  // ... 现有字段 ...
  
  /** 会话模式 */
  mode: 'chat' | 'crew'
  
  /** 如果是 crew 模式，关联的 Crew Template ID */
  crewId?: string
  
  /** Briefing：从 Chat 导入的上下文摘要 */
  briefing?: {
    /** 来源 Chat Session Key */
    sourceSessionKey: string
    /** 提取的关键上下文（LLM 生成的摘要） */
    summary: string
    /** 原始消息范围 */
    messageRange: [number, number]
  }
}
```

### 3.3 Briefing 生成

```typescript
interface BriefingGenerator {
  /**
   * 从 Chat 历史中提取关键上下文，生成 Briefing
   * 用一次 LLM 调用完成（~2K input → ~500 output）
   */
  generate(chatMessages: Message[]): Promise<{
    summary: string        // 结构化摘要
    suggestedCrewName?: string
    suggestedSkills?: string[]
  }>
}
```

---

## 4. UI 布局设计

### 4.1 左侧栏重构

```
┌──────────────────┐
│  🦀 Equality     │
│                  │
│  ┌────────────┐  │      当前：只有一个"聊天"+"Session Messages" 列表
│  │ 💬 Chat    │  │      改造后：
│  └────────────┘  │
│                  │      💬 Chat      → 自由对话（轻量模式）
│  ─── Crews ───   │      ─── Crews ── → 可复用的任务执行体列表
│  🤖 话唠员工    │      🤖 xxx       → 点击进入 Crew Session
│  😎 高冷员工    │      ＋ 新建      → 创建 Crew Template
│  🔧 前端开发    │
│  📊 数据分析    │      ─── 更多 ──── 
│  ＋ 新建 Crew   │      ⚙️ 设置
│                  │      📦 Skills 管理
│  ─── 更多 ───   │      💾 Session Messages
│  ⚙️ 设置        │      🧠 记忆
│  📦 Skills      │
│  💾 Sessions    │
│  🧠 记忆       │
└──────────────────┘
```

### 4.2 Chat → Crew 的转换按钮

```
Chat 对话区域底部，当对话 ≥ 3 轮后出现浮动提示：

┌───────────────────────────────────────────────────┐
│  💡 讨论得差不多了？                                │
│  [🚀 创建 Crew 开始干活]  [📋 导入到已有 Crew]     │
└───────────────────────────────────────────────────┘

点击后：
- "创建 Crew"：LLM 分析聊天历史 → 推荐 Crew 配置 → 用户确认
- "导入到已有 Crew"：选择已有 Crew → 生成 Briefing → 开启 Crew Session
```

### 4.3 Crew Session 界面（复用现有 Chat 组件）

```
┌─────────────────────────────────────────────────────────┐
│  🔧 前端开发 Crew                          [Skills: 5] │
│  ─────────────────────────────────────────────────────  │
│  📋 Briefing（来自聊天讨论）：                          │
│  "用户要做一个 React 登录表单，需要表单验证和..."        │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  [正常聊天/工具执行区域，和现在一样]                     │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  输入框 | 📎附件 | @Skill                               │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 与 Skills 智能化方案的整合

### 之前的三层分发如何映射

| 层 | 在新设计中的位置 |
|---|---|
| **Layer 1: 角色绑定** | → **Crew Template 的 skillNames** — 创建 Crew 时绑定，不再动态推断 |
| **Layer 2: 按需检索** | → **skill_search 工具** — Crew Session 中遇到新需求时触发 |
| **Layer 3: Always-on** | → **Chat Mode 中仅注入 always Skills**；Crew Mode 中也注入 |

### Skills 注入策略

```
Chat Mode:
  System Prompt = 默认 prompt + always Skills（≤5 个）
  无 <available_skills> 索引
  无 O3 匹配规则
  → 纯粹聊天，快速响应

Crew Session:
  System Prompt = 默认 prompt + Crew.systemPromptExtra + Crew 绑定的 Skills 索引
  有 <available_skills>（但只有 Crew 绑定的 N 个，不是全量 300 个）
  有 O3 匹配规则
  有 skill_search 工具（作为补充检索）
  → 目标驱动，Skills 精准
```

### Token 消耗对比

| 场景 | 改造前 | 改造后 |
|------|--------|--------|
| 闲聊"你好" | ~8K tokens Skills 索引 | 0 tokens（Chat Mode 不注入） |
| 明确任务 | ~8K tokens（300 个全量） | ~1K tokens（Crew 绑定的 5-10 个） |
| 复杂任务中途需要新 Skill | 已在 prompt 中（但可能被忽略） | skill_search 按需检索 top-5 |

---

## 6. 实施路径（修订版）

### Phase 1：Chat / Crew 双模态基础

**目标**：区分两种模式，Crew Template CRUD，Session 关联 Crew。

**Core 侧**：
1. `Session.mode` 字段（`'chat' | 'crew'`）
2. Crew Template 存储（JSON 文件，`%APPDATA%/Equality/crews/`）
3. Gateway API：`/crews` CRUD、`/sessions/:key` 增加 `crewId` 字段
4. `buildSystemPrompt` 根据 mode 决定是否注入 Skills 索引

**Desktop 侧**：
1. 左侧栏重构：Chat 入口 + Crew 列表
2. Crew 管理页（复用截图中已有的 UI 结构：基础信息 / System Prompt / Skills 三个 Tab）
3. 新建会话时区分 Chat 和 Crew Session

**改动范围**：
- 新建 `core/src/crew/template.ts`（模板类型 + CRUD）
- 新建 `core/src/crew/store.ts`（文件存储）
- 修改 `core/src/index.ts`（新增 `/crews` 路由）
- 修改 `core/src/agent/system-prompt.ts`（按 mode 分支）
- 修改 `desktop/src/App.tsx`（左侧栏 + 路由）
- 新建 `desktop/src/CrewPanel.tsx`（Crew 列表 + 编辑）
- 修改 `desktop/src/Chat.tsx`（Crew Session 头部显示）

### Phase 2：Briefing 系统

**目标**：Chat → Crew 的上下文桥梁。

1. `BriefingGenerator`：用 LLM 从 Chat 历史生成结构化摘要
2. UI：Chat 中的"创建 Crew / 导入到 Crew"浮动操作
3. Crew Session 首条消息注入 Briefing

**改动范围**：
- 新建 `core/src/crew/briefing.ts`
- 修改 `desktop/src/Chat.tsx`（Briefing 提示条 + 导入流程）

### Phase 3：Skill Retriever + skill_search 工具

**目标**：Crew Session 中遇到未绑定的 Skill 时按需检索。

（同之前分析文档的 Phase 1）

### Phase 4：AI 辅助 Crew 创建

**目标**：LLM 分析聊天内容，推荐 Crew 配置。

1. 分析 Chat 历史 → 推荐 Crew 名称 + Skills + System Prompt
2. Interactive UI 展示推荐 → 用户确认/调整
3. 一键创建 Crew Template

---

## 7. 关键设计决策

### Q1：Chat Mode 要不要完全移除 Skills？

**建议保留 always=true 的（≤5 个）**。理由：
- 有些 Skill 是基础设施（如 `project-dev-workflow`），Chat 中也可能用到
- 用户在 Chat 中说"帮我提交代码"，如果有 `git-workflow` always=true 就能立即响应

### Q2：Crew Session 的历史消息和 Chat 混在一起吗？

**建议分开展示但统一存储**。理由：
- Session 列表中用不同图标区分（💬 Chat / 🤖 Crew）
- 存储格式完全兼容，只是多了 `mode` 和 `crewId` 字段
- 搜索历史时可以跨模式搜索

### Q3：现有的 @ Skill 功能还保留吗？

**保留，但场景变了**：
- Chat Mode 中：`@skill-name` = 临时使用一个 Skill（相当于一次性 Crew）
- Crew Session 中：`@skill-name` = 临时追加一个非绑定的 Skill

### Q4：截图中的"已加载"按钮是什么？

截图显示 Agent（我们的 Crew）配置页中有"保存 Skills"和"已加载"。这映射到：
- **保存 Skills** = 将 skillNames 勾选持久化到 Crew Template
- **已加载** = 查看当前运行时实际加载的 Skills（调试用，可保留）

### Q5：Crew 和 multi-agent 编排的关系？

- **Crew** = 面向用户的单 Agent 配置（有名字、Skills、System Prompt）
- **Multi-agent（supervisor/developer/...）** = 内部编排用的角色，用户不直接接触
- 未来可以让 Crew 内部启用 multi-agent："全栈开发 Crew"内部拆分为 frontend + backend + tester 子 agent

---

## 8. 竞品参考

| 产品 | Chat/Agent 分离 | 上下文导入 |
|------|-----------------|-----------|
| ChatGPT | GPTs（模板）+ 普通对话 | 无 |
| Claude | Projects（绑定文件）+ 普通对话 | Project 内共享 |
| Cursor | Chat / Composer / Agent 三模态 | Composer → Agent 可传递 |
| CrewAI | 无 Chat，纯 Agent 编排 | N/A |
| **Equality** | **Chat + Crew 双模态 + Briefing 桥梁** | **Chat → Crew 一键导入** |

Equality 的独特之处：**Chat 和 Crew 之间有 Briefing 桥梁**——不是割裂的两个功能，而是一个连续的思考→执行流程。

---

## 9. 总结

```
改造前：
  一种模式 → 全量 Skills → 每轮 8K tokens 浪费 → LLM 自行匹配

改造后：
  Chat Mode    → 无 Skills / 仅 always → 轻量快速
       │ Briefing（上下文桥梁）
       ▼
  Crew Session → 绑定 N 个 Skills → 精准高效
       │ skill_search（按需补充）
       ▼
  完成任务 → 结果可反馈回 Chat
```

**下一步**：确认命名（Chat/Crew/Briefing）和 Phase 1 的具体实施范围，然后开始编码。
