# Delta Spec: Agent Runner

> 所属变更：[tool-execution-proof-guard](../../)  
> 主规格：[specs/agent-runner/spec.md](../../../specs/agent-runner/spec.md)

---

## ADDED Requirements

### Requirement: 工具执行证据约束

系统 MUST 基于本轮真实工具执行记录约束最终答复，不得允许模型在缺乏执行证据时宣称已经完成修改或命令执行。

- 当本轮没有任何工具调用时，系统 MUST NOT 向用户输出“已修改 / 已更新 / 已写入 / 已执行命令”等完成态表述。
- 当本轮没有任何具备写能力的工具调用时，系统 MUST NOT 向用户输出“文件已修改 / 代码已更新 / 已写入某路径”等文件变更完成态表述。
- 当本轮没有实际调用 `bash` 工具时，系统 MUST NOT 向用户输出伪造的命令执行回执、终端片段或执行结果摘要。
- 若检测到上述无证据成功宣称，系统 MUST 将最终答复改写为安全说明，明确表示尚未实际执行。

#### Scenario: 零工具却宣称已经改文件
- GIVEN 模型本轮没有触发任何工具调用
- AND 最终文本包含“这次真正修改了 `backend/scripts/fetch-news.js`”
- WHEN `runAttempt()` 返回最终答复前执行证据校验
- THEN 用户看到的最终回复 SHALL 被改写为“尚未实际调用工具执行修改”
- AND 原始误导性表述不直接返回给用户

#### Scenario: 只读工具后宣称写入文件
- GIVEN 模型本轮只调用了 `read_file` 和 `glob`
- AND 最终文本包含“已更新 `src/index.ts`”
- WHEN `runAttempt()` 返回最终答复前执行证据校验
- THEN 用户看到的最终回复 SHALL 被改写为“本轮没有实际调用可写入工具，因此并未真正修改文件”

#### Scenario: 未调用 bash 却输出命令回执
- GIVEN 模型本轮没有触发 `bash` 工具
- AND 最终文本包含“✅ 真正执行了！”
- AND 同时包含命令片段 `cd C:\software\github-trending\backend` 和 `node scripts/fetch-news.js`
- WHEN `runAttempt()` 返回最终答复前执行证据校验
- THEN 用户看到的最终回复 SHALL 被改写为“本轮没有实际调用 bash 工具执行命令”
- AND 原始伪造的终端回执不直接返回给用户

---

## MODIFIED Requirements

### Requirement: 工具调用循环

Agent 在单次 `runAttempt` 内 MAY 发起多轮工具调用。执行规则：

- 工具调用 MUST 经过 Loop Detection（见 [tools/spec.md](../tools/spec.md)）
- 单次运行内工具调用总次数 MUST NOT 超过全局断路器阈值（默认 30 次）
- 工具执行完成后，结果 MUST 回填到对话历史，作为下一轮 LLM 输入
- Agent 的最终答复 MUST 以本轮真实工具执行记录为准，不得仅依据模型文本声称某项操作已经完成
