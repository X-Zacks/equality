# Tasks: Project Dev Workflow Skill

## Phase 1：Skill 文件编写

- [ ] 1.1 创建 `packages/core/skills/project-dev-workflow/SKILL.md`
  - frontmatter：name + description（含 Use when / NOT for）
  - 需求澄清阶段指导（问题模板 + 数量限制）
  - OpenSpec 目录结构规范（与 design.md 对齐）
  - tasks.md checkpoint 格式模板
  - Phase 推进节奏规则
  - memory_save 使用时机
  - 续接流程（读 tasks.md → 找未完成 Phase）

## Phase 2：验收

- [ ] 2.1 手动测试：说"帮我做一个 Todo 管理系统"，验证 Agent 先问澄清问题
- [ ] 2.2 验证 Agent 生成完整 OpenSpec 目录（proposal + specs + design + tasks）
- [ ] 2.3 验证 tasks.md 格式符合 checkpoint 规范
- [ ] 2.4 新开 session 说"继续上次的项目"，验证 Agent 读取进度并续接
