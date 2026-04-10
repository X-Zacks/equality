# Tasks: Multi-Skill @ 选取

## Phase 1：Desktop 前端

- [x] 1.1 `Chat.tsx`：`skillTag: string | null` → `skillTags: string[]`，初始值 `[]`
- [x] 1.2 `Chat.tsx`：`handleMentionSelect` 中 skill 分支改为 `setSkillTags(prev => prev.includes(name) ? prev : [...prev, name])`
- [x] 1.3 `Chat.tsx`：`handleSend` 消息前缀构建改为 `skillTags.map(s => '@' + s).join(',')`
- [x] 1.4 `Chat.tsx`：chip 渲染改为 `skillTags.map()` 循环，每个 chip 有独立 ✕ 删除
- [x] 1.5 `Chat.tsx`：发送后重置 `setSkillTags([])`
- [x] 1.6 `Chat.tsx`：超过 3 个 Skill 时显示警告提示
- [x] 1.7 Desktop `npx tsc --noEmit` 零错误

## Phase 2：Core 后端

- [x] 2.1 `index.ts`：正则改为 `/^\[(@[a-zA-Z0-9_-]+(?:,@[a-zA-Z0-9_-]+)*)\]/`，解析为 `activeSkillNames: string[]`
- [x] 2.2 `index.ts`：`runAttempt` 调用处 `activeSkillName` → `activeSkillNames`
- [x] 2.3 `runner.ts`：参数 `activeSkillName?: string` → `activeSkillNames?: string[]`
- [x] 2.4 `runner.ts`：查找逻辑从 `.find()` 改为 `.map().filter()`，得到 `activeSkills: Skill[]`
- [x] 2.5 `runner.ts`：传给 `contextEngine.assemble()` 时用 `activeSkills`
- [x] 2.6 `system-prompt.ts`：`SystemPromptOptions.activeSkill` → `activeSkills?: Skill[]`
- [x] 2.7 `system-prompt.ts`：注入逻辑分支——单 Skill 保持严格模式，多 Skill 用编排模式
- [x] 2.8 `context-engine.ts`：`assemble()` 参数和透传从 `activeSkill` → `activeSkills`

## Phase 3：测试与验证

- [x] 3.1 运行 `system-prompt.test.ts`，更新快照（`--update`）— 28 passed, 0 failed
- [x] 3.2 新增 S7 测试场景（多 activeSkills）+ 5 个新断言
- [ ] 3.3 手动验证：单 Skill @选取 → 行为与之前一致
- [ ] 3.4 手动验证：多 Skill @选取 → Agent 收到所有 Skill body
- [ ] 3.5 手动验证：Agent 能自主决定使用顺序
- [x] 3.6 `tsc --noEmit` 零错误（Desktop + Core）
- [x] 3.7 Git commit

---
