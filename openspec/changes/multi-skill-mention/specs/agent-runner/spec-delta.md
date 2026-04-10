# Delta: Agent Runner — Multi-Skill Passthrough

## MODIFIED Requirements

### Requirement: Skill Name Extraction (from index.ts)

The `/chat/stream` endpoint SHALL extract **multiple** Skill names from the message prefix.

(Previously: regex `/^\[@([a-zA-Z0-9_-]+)\]/` only captured a single skill name)

#### Scenario: 单 Skill 消息（向后兼容）
- GIVEN 用户消息为 `[@openspec] 帮我写规格`
- WHEN index.ts 解析消息
- THEN `activeSkillNames` = `['openspec']`

#### Scenario: 多 Skill 消息
- GIVEN 用户消息为 `[@openspec,@git] 帮我写规格并提交`
- WHEN index.ts 解析消息
- THEN `activeSkillNames` = `['openspec', 'git']`

#### Scenario: 无 Skill 消息
- GIVEN 用户消息为 `帮我写代码`
- WHEN index.ts 解析消息
- THEN `activeSkillNames` = `undefined`

---

### Requirement: RunAttempt Skill Parameters (from runner.ts)

`runAttempt` SHALL accept `activeSkillNames?: string[]` (replacing `activeSkillName?: string`).

When multiple names are provided, runner SHALL resolve all matching Skill objects and pass them to `buildSystemPrompt` as `activeSkills`.

(Previously: `activeSkillName?: string` — only resolved a single Skill)

#### Scenario: 多 Skill 解析
- GIVEN `activeSkillNames` = `['openspec', 'git']`
- AND `skills` 列表中包含 openspec 和 git 两个 Skill
- WHEN runner 解析
- THEN `activeSkills` = 两个 Skill 对象
- AND 两个 Skill 均传入 `buildSystemPrompt`

#### Scenario: 部分匹配
- GIVEN `activeSkillNames` = `['openspec', 'nonexistent']`
- AND `skills` 列表中只有 openspec
- WHEN runner 解析
- THEN `activeSkills` = 只有 openspec 一个 Skill 对象
- AND 不存在的 `nonexistent` 被静默忽略

---
