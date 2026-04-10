# Proposal: Multi-Skill @ 选取

## 背景与问题

当前 `@` Skill 选取只支持选择**一个** Skill（`skillTag: string | null`），选第二个 `@` 会直接覆盖前一个。proposal 里也明确写了"多个 Skill 同时 @ 指定——暂时只支持一个"。

### 问题

1. **复杂任务往往跨多个 Skill**：例如用户想"先用 openspec Skill 写规格，再用 git Skill 提交"，目前只能选一个，另一个只能靠 Agent 自动匹配
2. **用户失去精确控制**：只能指定一个 Skill 意味着其他 Skill 退回到"Agent 自行判断"模式，如果自动匹配失败，用户无法补救
3. **与 `#` Tool 多选体验不对称**：Tool 支持多选（`toolTags: string[]`），Skill 只能单选，UI 和心智模型不一致

---

## 目标

1. `@` Skill 选取支持多个（0–N 个），UI 体验与 `#` Tool 多选一致
2. Agent 收到多个 Skill 时，根据**任务语义**自主决定使用顺序、使用哪些、跳过哪些
3. 向后兼容：单 Skill 场景行为不变，零 Skill 场景（自动匹配）不受影响

---

## 用户故事

**US-1 多 Skill 选取**
> 作为用户，我想在输入框中连续 `@` 选择多个 Skill，每个显示为独立 chip，可单独删除。

**US-2 Agent 自主编排**
> 作为用户，我指定了 `@openspec` 和 `@git` 两个 Skill 后发送消息，Agent 应该能理解当前任务的上下文，自己决定先用哪个 Skill、后用哪个，甚至判断某个 Skill 不适用而跳过。

**US-3 Skill 顺序无关**
> 作为用户，我选择 Skill 的顺序不影响结果——Agent 根据任务语义而非选择顺序来决定执行流程。

---

## 方案概述

### 前端（packages/desktop）

1. `skillTag: string | null` → `skillTags: string[]`，与 `toolTags` 对齐
2. MentionPicker `@` 选中后**追加**到 `skillTags`（去重），不再覆盖
3. chip 渲染：多个绿色 chip 并排显示，每个可 ✕ 删除
4. 消息前缀格式：`[@skill-a,@skill-b]`（逗号分隔）

### 后端（packages/core）

1. `index.ts`：正则改为匹配多个 skill 名称（`/^\[@([a-zA-Z0-9_,@-]+)\]/`）
2. `runner.ts`：`activeSkillName?: string` → `activeSkillNames?: string[]`，查找多个 Skill 对象
3. `system-prompt.ts`：`activeSkill?: Skill` → `activeSkills?: Skill[]`，依次注入所有指定 Skill 的完整内容，加上编排指引让 Agent 自主决策

### Prompt 编排策略

在 system prompt 中注入多 Skill 时，**不指定执行顺序**，而是给 Agent 编排自由度：

```
## 🎯 用户指定 Skills（共 N 个）

用户通过 @ 指定了以下 Skills，请根据任务需要自行决定：
- 使用顺序（先用哪个、后用哪个）
- 是否全部使用（某个 Skill 与当前任务无关时可跳过）
- 是否需要组合使用（一个 Skill 的输出作为另一个的输入）

### Skill 1：openspec
[完整 body]

### Skill 2：git
[完整 body]
```

---

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| skillTag → skillTags | `packages/desktop/src/Chat.tsx` | 中等修改 |
| MentionPicker 多选行为 | `packages/desktop/src/MentionPicker.tsx` | 小修改（无需改，追加逻辑在 Chat.tsx） |
| 消息前缀解析 | `packages/core/src/index.ts` | 小修改 |
| runner 多 Skill 查找 | `packages/core/src/agent/runner.ts` | 小修改 |
| system-prompt 多 Skill 注入 | `packages/core/src/agent/system-prompt.ts` | 中等修改 |
| 快照更新 | `packages/core/src/__tests__/__snapshots__/system-prompt.snap.json` | 自动 |

---

## 不在本次范围内

- Skill 权重/优先级排序（全靠 Agent 语义判断）
- Skill 之间的显式依赖声明（未来可在 SKILL.md frontmatter 加）
- @ 选中后自动建议关联 Skill（智能推荐）
- 选择上限限制（理论上无限，但 prompt 长度是天然上限）

---

## 成功标准

| 指标 | 目标 |
|------|------|
| 可选多个 Skill | 输入框连续 `@` 选择 2+ 个 Skill，均显示为 chip |
| Agent 收到所有 Skill | system prompt 中包含所有指定 Skill 的完整 body |
| Agent 自主编排 | 给定 2 个 Skill + 一个任务，Agent 正确选择使用顺序 |
| 向后兼容 | 单 Skill / 零 Skill 场景行为不变 |
| tsc --noEmit 零错误 | ✅ |
