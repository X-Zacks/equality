# Tasks: Skill System v2

## Phase 1：修改 system-prompt.ts（Skill 沉淀指令）

- [x] **1.1** 打开 `packages/core/src/agent/system-prompt.ts`，找到 `## Skill 沉淀` 指令块
- [x] **1.2** 将指令块替换为 `design.md §2.3` 定义的新版本，核心变化：
  - frontmatter 模板新增 description 双分区格式注释 ✓
  - description 长度上限从 120 改为 200 字符 ✓
  - 新增"脚本放置原则"段落（超 50 行 → scripts/，大表格 → references/）✓
  - 保留 Windows 兼容规则和 PRC 镜像规则 ✓
- [x] **1.3** TypeScript 编译通过（system-prompt.ts 是纯字符串模板，无类型变更）

---

## Phase 2：重写 skill-creator/SKILL.md

- [x] **2.1** 打开 `packages/core/skills/skill-creator/SKILL.md`
- [x] **2.2** 更新 frontmatter：
  - description 改为双分区格式，加入 "Use when:" + "NOT for:" 边界 ✓
  - 删除 `tools:` 字段 ✓（原 OpenClaw 版无此字段，但新版也不加）
  - 保留 `user-invocable: true` ✓
- [x] **2.3** 新增"创建流程"章节（6 步骤）✓
- [x] **2.4** 新增"description 写作指南"小节，含正面/反面示例 ✓
- [x] **2.5** 保留 Windows 兼容规则、PRC 镜像、渐进式披露、目录结构模板 ✓
- [x] **2.6** 控制总行数 ≤ 200 行 ✓（实际 120 行，从 486 行压缩）

---

## Phase 3：验证

- [x] **3.1** system-prompt 已在之前迭代中更新生效
- [ ] **3.2** 执行一个多步骤任务后让 Agent 保存为 Skill（待用户手动验证）
- [ ] **3.3** 触发 skill-creator 验证引导流程（待用户手动验证）
- [ ] **3.4** 审查已有 Skill 的 NOT for 补充（待用户手动验证）
- [x] **3.5** 检查更新后的 skill-creator/SKILL.md 总行数 ≤ 200 行 ✓（120 行）

---

## 文件变更汇总

| 文件 | 操作 | Phase |
|------|------|-------|
| `packages/core/src/agent/system-prompt.ts` | 修改"Skill 沉淀"指令块 | 1 |
| `packages/core/skills/skill-creator/SKILL.md` | 重写（保留精华，新增流程指导） | 2 |
| `openspec/changes/skill-system-v2/proposal.md` | 新增（本文件组） | — |
| `openspec/changes/skill-system-v2/specs/skills/spec.md` | 新增 | — |
| `openspec/changes/skill-system-v2/design.md` | 新增 | — |
| `openspec/changes/skill-system-v2/tasks.md` | 新增（本文件） | — |
