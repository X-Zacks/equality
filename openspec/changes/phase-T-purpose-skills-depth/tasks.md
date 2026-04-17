# Tasks: Phase T

## T1: Purpose 持久化

- [x] 1.1 在 `persist.ts` save() 中序列化 `purpose` 字段
- [x] 1.2 在 `persist.ts` load() 返回类型中加入 `purpose`
- [x] 1.3 在 `store.ts` getOrCreate() 中恢复 `purpose`

## T2: Skills 渐进式披露

- [x] 2.1 修改 `skills/prompt.ts` buildSkillsPromptBlock()：所有 skill 只输出元数据索引
- [x] 2.2 新建 `tools/builtins/skill-view.ts`：按名称读取 SKILL.md 全文
- [x] 2.3 注册 skill_view 到 catalog 和 builtins/index.ts

## T3: 子代理深度限制

- [x] 3.1 `subagent-manager.ts` spawn() 中已有 `depth >= maxDepth` 检查

## T4: 测试

- [x] 4.1 purpose 持久化测试（save→load→一致，5 assertions）
- [x] 4.2 skill prompt 元数据模式测试（已内联验证）
- [x] 4.3 skill_view 工具测试（3 assertions）
- [x] 4.4 子代理深度限制测试（SubagentManager 层已覆盖）
- [x] 4.5 运行全量测试确认无回归（Phase T 8 + Phase G 64 + Purpose 18 = 90 assertions）
