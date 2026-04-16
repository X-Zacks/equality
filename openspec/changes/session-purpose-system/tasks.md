# Tasks: Session Purpose System

## 1. 数据层

- [ ] 1.1 在 `session/types.ts` 新增 `SessionPurpose` 接口
- [ ] 1.2 在 `Session` 接口新增 `purpose?: SessionPurpose` 字段

## 2. Purpose 推断模块

- [ ] 2.1 创建 `agent/purpose.ts`，实现 `inferPurpose(message: string): SessionPurpose | undefined`
- [ ] 2.2 实现 `formatPurposeBlock(purpose?: SessionPurpose): string`

## 3. 引导系统瘦身

- [ ] 3.1 从 `workspace-bootstrap.ts` 移除 SOUL_TEMPLATE / IDENTITY_TEMPLATE / USER_TEMPLATE
- [ ] 3.2 从 `BootstrapFileName` 类型和 `BOOTSTRAP_FILENAMES` 数组移除 'IDENTITY.md' / 'USER.md' / 'SOUL.md'
- [ ] 3.3 更新 BOOTSTRAP_TEMPLATE：简化引导流程（用 memory 工具代替写文件）
- [ ] 3.4 更新 AGENTS_TEMPLATE：移除对三文件的引用

## 4. System Prompt 集成

- [ ] 4.1 在 `system-prompt.ts` 新增行为准则段落（内置原 SOUL.md 核心内容）
- [ ] 4.2 新增 `purposeBlock` 选项，注入 `<session-purpose>` 块
- [ ] 4.3 在 `default-engine.ts` assemble() 中：无 purpose 时调用 inferPurpose，注入 purposeBlock

## 5. 测试

- [ ] 5.1 创建 `__tests__/purpose.test.ts`：inferPurpose 各场景 + formatPurposeBlock
- [ ] 5.2 更新 `__tests__/phase-G.test.ts`：适配新的 3 文件列表
- [ ] 5.3 运行全量测试确认无回归
