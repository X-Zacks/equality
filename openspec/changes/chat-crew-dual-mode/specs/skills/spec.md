# Delta Spec: Skills — 按需分发

> **Delta Type**: MODIFIED
> **Base Spec**: `openspec/specs/skills/spec.md`

---

## MODIFIED Requirements

### Requirement: Skills 注入策略（原：全量注入，改为：按模式分发）

**原规格**：`buildSkillsPromptBlock()` 将所有已加载 Skills（上限 150 个）的索引注入 System Prompt。

**修改后**：

- **Chat Mode**：仅注入 `metadata.always = true` 的 Skills（≤ 5 个）
- **Crew Mode**：仅注入 Crew Template 绑定的 `skillNames` 对应的 Skills + always Skills

#### Scenario: Chat 模式不注入全量 Skills

- GIVEN 用户在 Chat 模式下对话
- WHEN 构建 System Prompt
- THEN `<available_skills>` 块 MUST 仅包含 `always=true` 的 Skills
- AND token 消耗 SHOULD 相比全量注入减少 80%+

## ADDED Requirements

### Requirement: skill_search 工具

系统 MUST 提供 `skill_search` 工具，让 LLM 按需搜索可用 Skills。

#### Scenario: LLM 主动搜索 Skill

- GIVEN LLM 在 Crew Session 中遇到未绑定的需求
- WHEN LLM 调用 `skill_search(query: "数据可视化")`
- THEN 系统 MUST 返回 top-K 最相关的 Skills（name + description + score）
- AND 检索方式为关键词匹配 + BM25，不依赖外部服务
