# Design: Chat / Crew 双模态 + Skills 按需分发

## 1. 数据模型

### 1.1 Crew Template

存储位置：`%APPDATA%/Equality/crews/<id>.json`

```typescript
interface CrewTemplate {
  id: string                    // nanoid 生成
  name: string                  // 显示名称
  description: string           // 一句话描述
  emoji?: string                // 头像 emoji
  systemPromptExtra?: string    // 追加到默认 System Prompt 后
  skillNames: string[]          // 绑定的 Skill 名称列表
  toolAllow?: string[]          // 工具白名单（不设则全量）
  toolDeny?: string[]           // 工具黑名单
  preferredModel?: string       // 模型偏好覆盖
  maxToolLoops?: number         // 工具循环上限覆盖
  source: 'builtin' | 'user-created' | 'gallery-downloaded' | 'chat-generated'
  createdAt: string
  updatedAt: string
}
```

### 1.2 Session 扩展

```typescript
interface SessionData {
  // ... 现有字段 ...
  mode: 'chat' | 'crew'         // 会话模式（默认 'chat'）
  crewId?: string                // Crew 模式时关联的模板 ID
  briefing?: {
    sourceSessionKey: string     // 来源 Chat 的 session key
    summary: string              // LLM 生成的上下文摘要
  }
}
```

### 1.3 Skill Retriever

```typescript
interface SkillRetriever {
  /** 关键词 + BM25 检索，返回 top-K */
  search(query: string, topK?: number): ScoredSkill[]
  /** 重建索引（Skills 变更时调用） */
  rebuild(skills: Skill[]): void
}
```

## 2. System Prompt 分支逻辑

```typescript
// buildSystemPrompt 修改
if (mode === 'chat') {
  // 只注入 always=true 的 Skills（≤5 个）
  // 不注入 <available_skills> 索引
  // 不注入 O3 匹配规则
  // 注入 skill_search 工具提示
} else if (mode === 'crew') {
  // 注入 Crew.systemPromptExtra
  // 注入 Crew 绑定的 skillNames 对应的 Skills 索引
  // 注入 O3 匹配规则（但范围仅限绑定的 Skills）
  // 注入 skill_search 工具提示（作为补充）
  // 如果有 briefing，注入为 <briefing> 块
}
```

## 3. Gateway API 新增

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/crews` | 列出所有 Crew Template |
| POST | `/crews` | 创建 Crew Template |
| GET | `/crews/:id` | 获取单个 Crew |
| PUT | `/crews/:id` | 更新 Crew |
| DELETE | `/crews/:id` | 删除 Crew |
| POST | `/crews/:id/session` | 以此 Crew 创建新 Session |
| POST | `/briefing/generate` | 从 Chat 历史生成 Briefing |

## 4. Desktop UI 变更

### 4.1 左侧栏

```
💬 Chat（新建 Chat 会话）
─── Crews ───
🤖 Crew 1    → 点击创建 Crew Session
🤖 Crew 2
＋ 新建 Crew
─── 更多 ───
⚙️ 设置 | 📦 Skills | 💾 Sessions | 🧠 记忆
```

### 4.2 Chat → Crew 浮动操作

对话 ≥ 3 轮后出现：
```
💡 [🚀 创建 Crew] [📋 导入到已有 Crew]
```

### 4.3 Crew 编辑页

复用截图中已有的三 Tab 结构：基础信息 / System Prompt / Skills 选择

## 5. Briefing 生成

一次 LLM 调用（~2K input → ~500 output）：

```
System: 从以下对话中提取关键决策、技术方案和约束条件，生成结构化简报。
User: [Chat 历史]
```

输出注入 Crew Session 的 System Prompt：
```xml
<briefing source="chat:xxx">
[结构化摘要]
</briefing>
```

## 6. skill_search 工具

```typescript
{
  name: 'skill_search',
  description: '搜索可用的技能。当你觉得当前任务可能有现成的 Skill 可以参考时使用。',
  parameters: {
    query: { type: 'string', description: '搜索关键词或意图描述' },
    topK: { type: 'number', description: '返回数量，默认 5' }
  }
}
```

检索策略：
1. Skill.name 精确/前缀匹配
2. Skill.metadata.category 匹配
3. BM25 on description + body（启动时建索引）
