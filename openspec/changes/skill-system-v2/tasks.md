# Tasks: Skill System v2

## Phase 1：修改 system-prompt.ts（Skill 沉淀指令）

- [ ] **1.1** 打开 `packages/core/src/agent/system-prompt.ts`，找到 `## Skill 沉淀` 指令块（约第 98-113 行）
- [ ] **1.2** 将指令块替换为 `design.md §2.3` 定义的新版本，核心变化：
  - frontmatter 模板新增 description 双分区格式注释
  - description 长度上限从 120 改为 200 字符
  - 新增"脚本放置原则"段落（超 50 行 → scripts/，大表格 → references/）
  - 保留 Windows 兼容规则和 PRC 镜像规则
- [ ] **1.3** 运行 `pnpm typecheck` 确认无 TypeScript 错误

---

## Phase 2：重写 skill-creator/SKILL.md

- [ ] **2.1** 打开 `packages/core/skills/skill-creator/SKILL.md`
- [ ] **2.2** 更新 frontmatter：
  - description 改为双分区格式，加入 "Use when:" + "NOT for:" 边界
  - 删除 `tools:` 字段（OpenClaw 规范：frontmatter 只含 name + description）
  - 删除 `equality:` 字段（同上）
  - 保留 `user-invocable: true`（Equality 自有扩展字段）
- [ ] **2.3** 新增"创建流程"章节（6 步骤）：
  - Step 1: 澄清使用场景与排除场景
  - Step 2: 规划 scripts/references/assets 内容
  - Step 3: 创建 SKILL.md（双分区 description）
  - Step 4: 提取脚本到 scripts/（超 50 行时）
  - Step 5: 验证（手动检查清单）
  - Step 6: 迭代改进
- [ ] **2.4** 新增"description 写作指南"小节，含正面/反面示例
- [ ] **2.5** 保留现有内容（Windows 兼容规则、PRC 镜像、渐进式披露、目录结构模板）
- [ ] **2.6** 控制总行数 ≤ 200 行

---

## Phase 3：验证

- [ ] **3.1** 重启 Core 服务（让 system-prompt 更新生效）
- [ ] **3.2** 执行一个多步骤任务（如 Excel 处理），完成后让 Agent 保存为 Skill
  - 验证：自动生成的 SKILL.md 的 description 包含 "NOT for:" 分区 ✓
  - 验证：脚本单独存放在 scripts/ 中（不内联在正文）✓
- [ ] **3.3** 触发 skill-creator（说"创建一个 skill"）
  - 验证：Agent 在创建文件前询问触发场景和排除场景 ✓
- [ ] **3.4** 让 Agent 审查现有的 `excel-quarterly-cost-diff-analysis/SKILL.md`
  - 验证：Agent 发现 "NOT for:" 缺失并主动询问并建议补充 ✓
- [ ] **3.5** 检查更新后的 skill-creator/SKILL.md 总行数 ≤ 200 行 ✓

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
