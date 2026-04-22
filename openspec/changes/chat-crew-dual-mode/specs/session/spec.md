# Delta Spec: Session — Chat / Crew 双模态

> **Delta Type**: MODIFIED
> **Base Spec**: `openspec/specs/session/spec.md`

---

## ADDED Requirements

### Requirement: Session Mode 字段

每个 Session MUST 包含 `mode` 字段，值为 `'chat'` 或 `'crew'`。

#### Scenario: 默认创建 Chat 会话

- GIVEN 用户点击"新建聊天"或直接开始输入
- WHEN 系统创建新 Session
- THEN Session.mode MUST 为 `'chat'`

#### Scenario: 通过 Crew 创建会话

- GIVEN 用户选择某个 Crew Template 并开始对话
- WHEN 系统创建新 Session
- THEN Session.mode MUST 为 `'crew'`
- AND Session.crewId MUST 为所选 Crew Template 的 ID

### Requirement: Briefing 注入

Crew Session MAY 包含 Briefing（从 Chat 导入的上下文）。

#### Scenario: 用户从 Chat 导入到 Crew

- GIVEN 用户在 Chat 中对话 ≥ 3 轮后点击"导入到 Crew"
- WHEN 系统生成 Briefing
- THEN Briefing MUST 通过 LLM 从 Chat 历史中提取关键决策和上下文
- AND Briefing MUST 注入到 Crew Session 的 System Prompt 中
