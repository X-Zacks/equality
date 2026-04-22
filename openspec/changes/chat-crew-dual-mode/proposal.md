# Proposal: Chat / Crew 双模态 + Skills 按需分发

## 背景与问题

### 问题 1：全量 Skills 注入导致 token 浪费与注意力稀释

当前 `loadAllSkills()` 将所有 Skills 的 name + description 生成 XML 索引注入 System Prompt（上限 150 个 / 30K 字符）。300 个 Skills 时每轮对话消耗 ~8K tokens，其中用户实际需要的可能仅 10-20 个。LLM 被迫在 150 个 description 中做文本匹配，小模型尤其容易误选/漏选。

### 问题 2：无目的的闲聊与有目的的任务执行使用相同 prompt

用户说"你好"和用户说"帮我重构 auth 模块"走的是同一套 System Prompt，后者的 ~8K tokens Skills 索引对前者完全是浪费。两种使用模式没有区分。

### 问题 3：Purpose 系统和 Skills 之间无连接

`inferPurpose()` 能推断出用户目标，但不会据此筛选相关 Skills。已有的 `role-config.ts` 角色系统只在 multi-agent 编排场景使用，普通对话不走角色配置。

### 问题 4：用户缺乏"先讨论再执行"的工作流

用户经常在聊天中探索想法，想法成熟后想让 AI 执行。当前没有机制将聊天中的上下文传递给任务执行过程。

---

## 目标

1. **区分 Chat 和 Crew 两种会话模式**：Chat 轻量无 Skills，Crew 绑定精选 Skills
2. **Crew Template** 作为可复用的任务执行体配置（名称、Skills、System Prompt、工具过滤）
3. **按需 Skill 检索**替代全量注入，提供 `skill_search` 工具
4. **Briefing 系统**：Chat → Crew 的上下文桥梁，一键导入聊天背景

---

## 范围

| 变更 | 影响 |
|------|------|
| Session 增加 `mode` 字段 | 会话存储、持久化 |
| Crew Template CRUD + 存储 | 新模块 `crew/` |
| System Prompt 按模式分支 | Skills 注入逻辑 |
| Skill Retriever + skill_search 工具 | 新模块 `skills/retriever.ts` |
| Desktop 左侧栏重构 | App.tsx、新建 CrewPanel |
| Briefing 生成 | 新模块 `crew/briefing.ts` |

---

## 方案概述

### 核心架构

```
Chat Mode  ─── 无/仅 always Skills ──→  轻量快速
    │ Briefing（LLM 一次调用提炼上下文）
    ▼
Crew Session ── Crew 绑定的 N 个 Skills ──→  精准高效
    │ skill_search（遇到未绑定需求时按需检索）
    ▼
完成任务
```

### 四阶段实施

- **Phase 1**: Chat/Crew 双模态 + Crew Template CRUD + System Prompt 分支
- **Phase 2**: Briefing 系统（Chat → Crew 上下文桥梁）
- **Phase 3**: Skill Retriever + `skill_search` 工具
- **Phase 4**: AI 辅助 Crew 创建（从聊天推荐 Crew 配置）

---

## 不在本次范围内

- 向量嵌入检索（Phase 4+ 优化）
- Skill 使用频率统计
- Crew 内部 multi-agent 编排（未来增强）
- Crew Gallery（在线分享/下载 Crew 模板）
