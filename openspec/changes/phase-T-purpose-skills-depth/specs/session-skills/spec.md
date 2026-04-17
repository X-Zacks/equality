# Delta for Session & Skills & SubAgent

## MODIFIED Requirements

### Requirement: Session Persistence
Session 持久化 SHALL 包含 `purpose` 字段。

（Previously: 只持久化 messages, costLines, createdAt, title, frozenMemorySnapshot）

#### Scenario: Purpose persisted
- GIVEN 一个有 purpose 的 session
- WHEN persist.save() 被调用
- THEN JSON 文件包含 purpose 字段

#### Scenario: Purpose restored
- GIVEN 一个持久化的 session 文件含 purpose
- WHEN store.getOrCreate() 加载该 session
- THEN session.purpose 被正确恢复

### Requirement: Skills System Prompt Injection
system prompt 中的 skill 块 SHALL 只包含元数据（name + description），不包含完整 body。

（Previously: 全量注入 skill body 到 system prompt）

#### Scenario: Skills metadata only in prompt
- GIVEN 10 个已加载 skill
- WHEN buildSkillsPromptBlock() 被调用
- THEN 输出只包含 name 和 description，不包含 body 内容
- AND 输出包含"使用 skill_view 工具查看完整指令"的引导

#### Scenario: Active skill injected fully
- GIVEN 用户通过 @ 指定了某个 skill
- WHEN buildSystemPrompt() 被调用
- THEN 被 @ 指定的 skill 全量注入（保持现有行为）
- AND 其余 skill 只注入元数据

## ADDED Requirements

### Requirement: skill_view Tool
系统 SHALL 提供 `skill_view` 工具，允许 Agent 按需读取 skill 完整内容。

```
skill_view(name: string) → string (SKILL.md 全文)
```

#### Scenario: View existing skill
- GIVEN skill "git" 存在
- WHEN skill_view({ name: "git" }) 被调用
- THEN 返回 git/SKILL.md 的完整内容

#### Scenario: View non-existent skill
- GIVEN skill "nonexistent" 不存在
- WHEN skill_view({ name: "nonexistent" }) 被调用
- THEN 返回错误信息

### Requirement: Sub-agent Depth Limit
subagent_spawn SHALL 检查当前代理深度，超过 MAX_DEPTH 时拒绝创建。

#### Scenario: Depth within limit
- GIVEN 当前深度 = 1, MAX_DEPTH = 3
- WHEN subagent_spawn 被调用
- THEN 正常创建子代理，深度设为 2

#### Scenario: Depth exceeds limit
- GIVEN 当前深度 = 3, MAX_DEPTH = 3
- WHEN subagent_spawn 被调用
- THEN 返回错误 "子代理深度超过限制 (3/3)"
