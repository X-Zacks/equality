# Tasks: 工具执行证据 Guard

> 状态：🔲 未开始

---

## 1. OpenSpec 文档

- [x] 1.1 创建 `proposal.md`
- [x] 1.2 创建 `design.md`
- [x] 1.3 创建 delta spec

---

## 2. Prompt 约束

- [x] 2.1 在 `system-prompt.ts` 中加入“无 tool_result 不得宣称成功”的硬规则
- [x] 2.2 明确区分“准备执行”和“已经执行”措辞

---

## 3. Runner Guard

- [x] 3.1 在 `runAttempt()` 中记录本轮真实执行过的工具名
- [x] 3.2 增加“零工具成功宣称”检测与改写
- [x] 3.3 增加“无写能力却宣称改文件”检测与改写
- [x] 3.4 在 `afterTurn()` 之前对最终 `fullText` 应用 guard
- [x] 3.5 增加“未调用 bash 却输出命令执行回执/终端片段”检测与改写

---

## 4. 验证

- [x] 4.1 TypeScript 编译零新增错误
- [x] 4.2 更新 tasks 状态
- [x] 4.3 覆盖 `cd ...` / `node ...` 这类伪执行回执场景
