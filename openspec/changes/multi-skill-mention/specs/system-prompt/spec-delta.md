# Delta: System Prompt — Multi-Skill Injection

## MODIFIED Requirements

### Requirement: Active Skill Injection (from system-prompt.ts)

`buildSystemPrompt` SHALL accept an optional `activeSkills?: Skill[]` parameter (replacing `activeSkill?: Skill`).

When multiple Skills are provided, all SHALL be injected into the system prompt with an orchestration preamble that gives the Agent autonomy over execution order.

(Previously: `activeSkill?: Skill` — only a single Skill was injected with a fixed "严格按照以下 Skill 的步骤执行" instruction)

#### Scenario: 单 Skill（向后兼容）
- GIVEN `activeSkills` 包含 1 个 Skill（openspec）
- WHEN buildSystemPrompt 构建 prompt
- THEN prompt 中包含 `## 🎯 用户指定 Skill：openspec`
- AND 包含 "严格按照以下 Skill 的步骤执行"
- AND Skill body 完整注入

#### Scenario: 多 Skill
- GIVEN `activeSkills` 包含 2 个 Skill（openspec, git）
- WHEN buildSystemPrompt 构建 prompt
- THEN prompt 中包含 `## 🎯 用户指定 Skills（共 2 个）`
- AND 包含编排指引："根据任务需要自行决定使用顺序"
- AND 包含 "是否全部使用（某个 Skill 与当前任务无关时可跳过）"
- AND 两个 Skill 的 body 均完整注入，分别在 `### Skill 1：openspec` 和 `### Skill 2：git` 下

#### Scenario: 零 Skill
- GIVEN `activeSkills` 为 undefined 或空数组
- WHEN buildSystemPrompt 构建 prompt
- THEN prompt 中不包含任何 `🎯 用户指定` 段落

---

## MODIFIED Requirements

### Requirement: SystemPromptOptions Interface

```typescript
export interface SystemPromptOptions {
  // ... existing fields ...
  activeSkills?: Skill[]   // 替换原来的 activeSkill?: Skill
}
```

(Previously: `activeSkill?: Skill`)

---
