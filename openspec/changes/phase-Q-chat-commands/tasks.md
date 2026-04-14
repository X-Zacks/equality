# Tasks: Phase Q — Chat Commands

> Status: ✅ complete | Completed: 17/20 (Q4 前端集成留待 desktop 侧实施)

---

## Q1: 基础框架

- [x] **Q1.T1** 新建 `commands/types.ts` — ChatCommandDefinition, ChatCommandContext, ChatCommandResult 类型
- [x] **Q1.T2** 新建 `commands/parser.ts` — `parseChatCommand()` + `isChatCommand()` 函数
- [x] **Q1.T3** 新建 `commands/registry.ts` — ChatCommandRegistry 类（register/get/list/unregister/size）

## Q2: 内建指令实现

- [x] **Q2.T1** 新建 `commands/builtins/help.ts` — /help 指令
- [x] **Q2.T2** 新建 `commands/builtins/status.ts` — /status 指令
- [x] **Q2.T3** 新建 `commands/builtins/new-session.ts` — /new 指令
- [x] **Q2.T4** 新建 `commands/builtins/reset.ts` — /reset 指令
- [x] **Q2.T5** 新建 `commands/builtins/compact.ts` — /compact 指令
- [x] **Q2.T6** 新建 `commands/builtins/usage.ts` — /usage 指令
- [x] **Q2.T7** 新建 `commands/builtins/model.ts` — /model 指令
- [x] **Q2.T8** 新建 `commands/builtins/index.ts` — 注册全部 7 个内建指令

## Q3: Gateway 路由集成

- [x] **Q3.T1** 在 `index.ts` 中导入 ChatCommandRegistry 并初始化
- [x] **Q3.T2** 添加 `POST /chat/command` 路由
- [x] **Q3.T3** 添加 `GET /chat/commands` 路由
- [ ] **Q3.T4** 在 `/chat/stream` 路由中添加指令拦截（可选优化，暂留前端实现）

## Q4: 前端集成（留待 desktop 侧实施）

- [ ] **Q4.T1** desktop 侧添加指令发送逻辑（调用 `/chat/command` 而非 `/chat/stream`）
- [ ] **Q4.T2** desktop 侧添加 `/` 触发的指令补全菜单

## Q5: 测试与验证

- [x] **Q5.T1** 新建 `__tests__/phase-Q.test.ts` — 62 assertions 全部通过 ✅
- [x] **Q5.T2** `tsc --noEmit` 零错误 ✅
