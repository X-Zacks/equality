# Delta: System Prompt — Snapshot Testing

## ADDED Requirements

### Requirement: Prompt Snapshot Regression Tests

The system prompt module MUST have snapshot-based regression tests covering at least 6 scenarios.

#### Scenario: Baseline prompt (no options)
- GIVEN `buildSystemPrompt()` called with no arguments
- WHEN the test runs
- THEN the output matches the golden snapshot for scenario S1

#### Scenario: Prompt with workspace directory
- GIVEN `buildSystemPrompt({ workspaceDir: 'C:\\project' })`
- WHEN the test runs
- THEN the output includes the workspace path
- AND matches the golden snapshot for scenario S2

#### Scenario: Prompt with Skills
- GIVEN `buildSystemPrompt({ skills: [mockSkill1, mockSkill2] })`
- WHEN the test runs
- THEN the output includes both skill names
- AND matches the golden snapshot for scenario S3

#### Scenario: Prompt with activeSkill (@ specified)
- GIVEN `buildSystemPrompt({ activeSkill: mockSkill })`
- WHEN the test runs
- THEN the output includes the "用户指定 Skill" section
- AND matches the golden snapshot for scenario S4

#### Scenario: Full combination
- GIVEN `buildSystemPrompt({ workspaceDir, skills, activeSkill, modelName })`
- WHEN the test runs
- THEN the output matches the golden snapshot for scenario S5

#### Scenario: Empty options object
- GIVEN `buildSystemPrompt({})`
- WHEN the test runs
- THEN the output matches the golden snapshot for scenario S6

### Requirement: Snapshot Update Workflow

Snapshots MUST be updatable via a `--update` flag.

#### Scenario: Intentional prompt change
- GIVEN a developer modifies `system-prompt.ts`
- WHEN they run `npx tsx src/__tests__/system-prompt.test.ts --update`
- THEN the golden snapshot file is overwritten with new values
- AND subsequent test runs pass

#### Scenario: Accidental prompt change
- GIVEN a developer accidentally modifies `system-prompt.ts`
- WHEN they run `npx tsx src/__tests__/system-prompt.test.ts`
- THEN the test fails with a clear diff showing what changed
