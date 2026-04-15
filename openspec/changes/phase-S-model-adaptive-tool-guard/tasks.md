# Tasks: Phase S — Model-Adaptive Tool Guard

> 基于 design.md + specs/agent/spec.md

## 第一阶段：Answer Evidence Guard 核心实现

- [x] S-T1: 在 `runner.ts` 中定义 `EvidenceCategory` 类型和断言检测函数 `detectFactualClaims`
  - 定义 5 个证据类别：`git_status`, `file_change`, `command_result`, `compile_result`, `service_status`
  - 用正则匹配模型回答中的事实性断言
  - 区分"事实断言"和"建议/计划"（如"建议你推送"不是断言）
  - 返回 `Set<EvidenceCategory>`

- [x] S-T2: 实现 `hasMatchingEvidence` 函数
  - 输入：证据类别 + executedToolNames + messages（含工具结果）
  - 对每个证据类别，检查是否有匹配的工具调用
  - 对 bash 工具：从 tool messages 中检查是否含有相关命令（git / tsc / npm 等）
  - 返回 `Map<EvidenceCategory, boolean>`

- [x] S-T3: 实现 `guardUnverifiedClaims` 主函数
  - 输入：text, executedToolNames, messages
  - 调用 detectFactualClaims → hasMatchingEvidence
  - 对无证据的断言类别，在回答末尾追加 ⚠️ 提示
  - 返回改写后的文本（或原文）

- [x] S-T4: 在 `runner.ts` 的 `runAttempt` 中接入 `guardUnverifiedClaims`
  - 在 guardUnsupportedSuccessClaims 之后调用
  - 传入 fullText, executedToolNames, messages

## 第二阶段：测试

- [x] S-T5: 编写 `phase-S-evidence-guard.test.ts` 单元测试
  - 测试 detectFactualClaims：各类别断言检测 + 非断言不误判（16 项）
  - 测试 hasMatchingEvidence：各类工具组合（8 项）
  - 测试 guardUnverifiedClaims：端到端（有证据放行 + 无证据改写）（6 项）
  - ✅ 30 个断言全部通过

- [x] S-T6: 更新 system-prompt 快照测试
  - ✅ 28 个快照匹配

## 第三阶段：系统提示增强

- [x] S-T7: 在 system-prompt.ts 中增强证据意识提示
  - 在"执行证据规则"段落补充："回答涉及 Git 状态、编译结果、服务状态等事实性问题时，应优先通过工具获取真实证据"
