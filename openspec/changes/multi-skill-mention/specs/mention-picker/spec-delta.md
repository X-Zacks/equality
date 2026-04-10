# Delta: MentionPicker — Multi-Skill Selection

## MODIFIED Requirements

### Requirement: @ Skill 选取行为 (from chat-mention-picker spec §1.1)

The MentionPicker SHALL allow selecting **multiple** Skills via `@`.

(Previously: 选中一个 Skill 会覆盖已有的，一次只能激活一个 Skill)

#### Scenario: 选择第二个 Skill
- GIVEN 用户已选中 `@openspec`（显示为 chip）
- WHEN 用户再次输入 `@git` 并从菜单选中
- THEN `@git` 作为第二个 chip 追加显示
- AND `@openspec` chip 保持不变
- AND 两个 chip 均可独立 ✕ 删除

#### Scenario: 去重
- GIVEN 用户已选中 `@openspec`
- WHEN 用户再次输入 `@openspec` 并选中
- THEN 不重复添加，skillTags 仍然只有一个 `openspec`

#### Scenario: 全部删除
- GIVEN 用户已选中 `@openspec` 和 `@git` 两个 Skill
- WHEN 用户点击 `@openspec` chip 的 ✕
- THEN 只移除 `@openspec`，`@git` 保持
- AND 消息前缀更新为 `[@git]`

---

### Requirement: 消息前缀格式 (from chat-mention-picker spec §3.1)

When multiple Skills are selected, the message prefix SHALL use comma-separated format.

(Previously: `[@skill-name]` 只包含一个 skill 名称)

#### Scenario: 单 Skill 前缀（向后兼容）
- GIVEN 用户只选了 `@openspec`
- WHEN 用户发送消息
- THEN 消息前缀为 `[@openspec]`（与之前格式完全一致）

#### Scenario: 多 Skill 前缀
- GIVEN 用户选了 `@openspec` 和 `@git`
- WHEN 用户发送消息
- THEN 消息前缀为 `[@openspec,@git]`

#### Scenario: Skill + Tool 前缀共存
- GIVEN 用户选了 `@openspec` 和 `#bash`
- WHEN 用户发送消息
- THEN 消息为 `[@openspec] [#bash] 用户消息...`

---

## ADDED Requirements

### Requirement: Skill Chip 上限提示

The UI SHOULD display a visual hint when the total prompt size of selected Skills exceeds a threshold.

#### Scenario: 超过 3 个 Skill
- GIVEN 用户已选中 4 个 Skill
- WHEN 第 4 个 chip 出现
- THEN chip 区域显示一个小提示："⚠ 已选 4 个 Skill，可能影响响应质量"

---
