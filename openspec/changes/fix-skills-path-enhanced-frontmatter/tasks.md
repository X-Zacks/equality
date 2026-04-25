# Tasks: 修复 Skills 路径 & 增强 Frontmatter

## Part A：路径修复

- [x] A1. `system-prompt.ts`：`skillsDir` → `managedSkillsDir`（变量 + prompt 文本）
- [x] A2. `path-guard.ts`：添加 `%APPDATA%/Equality/` 白名单
- [x] A3. 删除 `system-prompt.ts` 中未使用的 `getBundledSkillsDir` import

## Part B：增强 Frontmatter

- [x] B1. `types.ts`：`SkillMetadata` 新增 `version`、`tags`、`author`、`platforms` 字段
- [x] B2. `frontmatter.ts`：解析新字段
- [x] B3. `loader.ts`：平台过滤逻辑
- [x] B4. `skill-creator/SKILL.md`：更新 frontmatter 模板（core + desktop 两份）
- [x] B5. `system-prompt.ts`：更新 Crew 模式的 frontmatter 模板

## Part C：验证

- [x] C1. TypeCheck 通过
- [x] C2. 确认 system-prompt 输出中路径指向 managed 目录
- [x] C3. 确认 path-guard 放行 AppData/Equality 路径
