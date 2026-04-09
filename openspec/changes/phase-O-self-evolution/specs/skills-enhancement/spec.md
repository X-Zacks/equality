# Delta Spec: 技能增强

---

## ADDED Requirements

### Requirement: 增强的技能匹配提示

system prompt MUST 包含更精确的技能匹配与使用指引。

- 指引 Agent 如何根据用户问题选择匹配的技能
- 指引 Agent 在使用技能时引用技能名称
- 指引 Agent 完成任务后判断是否需要沉淀新技能

#### Scenario: 技能引用
- GIVEN available_skills 包含 "git-commit-convention"
- AND 用户问 "帮我提交代码"
- WHEN Agent 回复
- THEN Agent 提及正在使用 "git-commit-convention" 技能

#### Scenario: 无匹配技能
- GIVEN available_skills 不包含与当前任务相关的技能
- AND Agent 成功完成了一项复杂任务
- WHEN Agent 生成回复
- THEN Agent 建议将此操作步骤沉淀为新技能

### Requirement: 主动技能沉淀提示

当 Agent 完成复杂任务后 SHOULD 主动建议创建技能。

触发条件（任一满足）：
- toolLoop 使用 ≥ 5 次工具调用完成任务
- 任务涉及多步骤工作流
- 用户口头表达 "以后也这样做"

#### Scenario: 多步骤任务后建议
- GIVEN Agent 使用 7 次工具调用完成一项任务
- WHEN 任务完成
- THEN Agent 在最终回复中追加："💡 这个操作涉及多个步骤，要不要我把它沉淀为技能？"

#### Scenario: 已有技能不重复建议
- GIVEN 当前任务完全匹配已有技能
- WHEN 任务完成
- THEN Agent 不建议创建技能

### Requirement: 技能 Patch 指引

system prompt MUST 指引 Agent 在发现已有技能需要更新时进行 patch 而非新建。

#### Scenario: 技能需要更新
- GIVEN available_skills 包含 "deploy-to-prod" 
- AND 用户说 "现在部署流程改了，多了一步审批"
- WHEN Agent 完成任务
- THEN Agent 建议更新现有技能而非创建新技能

---

## MODIFIED Requirements

### Requirement: system-prompt.ts 技能区块

现有的 `Skills沉淀` 指引 MUST 扩展为包含匹配、引用、沉淀、Patch 四项指引。

（原有 frontmatter 格式不变）
