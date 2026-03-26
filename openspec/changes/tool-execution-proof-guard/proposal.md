# Proposal: 工具执行证据 Guard

> 优先级：🟡 P1  
> 关联 Specs：[specs/agent-runner/spec.md](../../specs/agent-runner/spec.md)

## 意图

当前部分模型（尤其是 OpenAI 兼容接口下的某些模型）会在**没有真正触发工具调用**时，直接在自然语言中声称“已经修改文件”“已经写入代码”“已经执行命令”。这会破坏 Equality 作为 Agent 的可信度。

本变更引入“工具执行证据 Guard”：

1. **Prompt 约束**：system prompt 明确要求：没有收到工具结果前，不得宣称已经完成修改/写入/执行。
2. **Runner 校验**：在 `runAttempt()` 最终返回前，基于本轮真实工具调用记录校验最终答复。
3. **降级改写**：若发现“无证据成功宣称”，将最终回复改写为安全提示，明确说明尚未实际执行。

## 目标

- 当本轮 **零工具调用** 时，模型不得最终宣称“已修改/已写入/已更新/已执行命令”。
- 当本轮 **没有任何写能力工具调用** 时，模型不得宣称文件已修改。
- Guard 在模型层失效时仍能从框架层兜底，避免对用户造成误导。

## 范围

**包含：**
- `packages/core/src/agent/system-prompt.ts`
- `packages/core/src/agent/runner.ts`
- `openspec/changes/tool-execution-proof-guard/**`

**不包含：**
- UI 证据标签展示
- 用户确认弹窗
- 基于 AST/补丁的更精细文件变更验证

## 成功标准

- 模型未触发任何工具时，若输出“这次真正修改了/已更新某文件”等表述，最终用户看到的回复会被改写为“尚未实际修改”。
- 模型只调用了只读工具（如 `read_file` / `glob`）时，若声称已改文件，也会被 Guard 拦截。
- TypeScript 编译无新增错误。
