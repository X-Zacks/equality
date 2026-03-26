# Design: 工具执行证据 Guard

> 关联 Proposal：[proposal.md](./proposal.md)

---

## 核心思路

将“是否真的做过”从模型判断，提升为框架判断。

### 1. Prompt 层：提前约束

在 `buildSystemPrompt()` 顶部重要规则中加入：

- 没有收到真实 `tool_result` 前，不得宣称工具已经完成。
- 没有写能力工具的执行证据前，不得宣称文件已修改/已写入/已创建。
- 若当前只是计划或建议，必须用“我准备… / 我将…”而不是“我已经…”。

Prompt 只能降低幻觉概率，不能单独作为可靠性保证。

### 2. Runner 层：最终答复校验

在 `runAttempt()` 内记录本轮真实执行过的工具名，形成 `executedToolNames: Set<string>`。

在最终 `fullText` 返回前，执行 `guardUnsupportedSuccessClaims()`：

#### 校验规则 A：零工具成功宣称

若：
- `executedToolNames.size === 0`
- 最终文本命中“已修改/已更新/已写入/已执行”等成功宣称模式

则将最终文本改写为：

```text
⚠️ 我还没有实际调用任何工具执行修改或命令。
上面的内容只是计划或推测，并非真实执行结果。
如果你要我真正修改，请让我继续使用工具操作。
```

#### 校验规则 B：无写能力却宣称改文件

若：
- 最终文本命中“文件已修改/已更新/已写入/已创建”模式
- 且 `executedToolNames` 中不包含任何写能力工具

则将最终文本改写为：

```text
⚠️ 我本轮没有实际调用可写入的工具，因此并未真正修改文件。
上面的“已修改/已更新”描述不成立；如果需要我真正改动，请继续让我执行工具。
```

#### 校验规则 C：未调用 bash 却输出命令执行回执

若：
- `executedToolNames` 中不包含 `bash`
- 最终文本包含“真正执行了”“执行结果”“抓取结果”“数据库验证”等执行完成语义
- 且同时包含看起来像终端执行片段的命令（如 `cd ...`、`node ...`、`npm ...`、`pnpm ...`、`python ...`）

则将最终文本改写为：

```text
⚠️ 我本轮没有实际调用 bash 工具执行命令。
上面的命令片段和执行结果只是模型描述，不是真实终端输出。
如果你要我真正运行这些命令，请继续让我调用 bash。
```

#### 校验规则 D：自动纠偏重试（一次）

若：
- 本轮 `toolCalls.length === 0`
- 当前请求启用了工具（`hasTools === true`）
- 模型文本命中“伪执行回执 / 命令片段 / 明显工具执行意图”
- 本次运行尚未做过自动纠偏

则框架不立即接受该文本为最终答案，而是：

1. 将该 assistant 文本回填到上下文
2. 自动追加一条 user 纠偏消息：

```text
你还没有实际调用任何工具。
如果需要执行命令，必须调用 bash；如果需要读写文件，必须调用对应工具。
不要再描述计划，直接执行。
```

3. 再继续一轮 `toolLoop`

这是一次性重试，避免无限循环。

### 3. 写能力工具集合

初版按静态集合判断：

```typescript
const MUTATING_TOOLS = new Set([
  'write_file',
  'bash',
  'apply_patch',
  'delete_file',
  'move_file',
  'rename_file',
])
```

说明：
- `bash` 理论上也可只读，但它具备修改文件的能力；初版宁可偏宽松，不做命令语义分析。
- 未来若增加更细粒度工具元数据，可替换为 `tool.capabilities.mutatesFilesystem`。

---

## 实现位置

### `packages/core/src/agent/system-prompt.ts`

增加一段“执行证据规则”。

### `packages/core/src/agent/runner.ts`

新增辅助函数：
- `containsExecutionSuccessClaim(text)`
- `containsFileMutationClaim(text)`
- `containsBashExecutionClaim(text)`
- `containsShellCommandTranscript(text)`
- `shouldForceToolRetry(text, hasTools, alreadyRetried)`
- `guardUnsupportedSuccessClaims(text, executedToolNames)`

并在 `runAttempt()` 中：
- 汇总工具结果时记录 `executedToolNames`
- `afterTurn()` 之前对 `fullText` 进行 guard 改写

---

## 风险与权衡

### 风险 1：误伤正常表述

例如“我已经分析完原因，但还没修改代码”。

应对：
- 正则仅匹配带有“修改/更新/写入/创建/执行命令”等完成态表述
- 不拦截单纯“看了/分析了/检查了”之类只读描述

### 风险 2：`bash` 被视为写能力工具过宽

这是有意的保守选择：
- 目标是先拦住“零证据却说已改”的严重误导
- 不是做完美的文件系统变更审计

后续可再升级为真正的“变更证明链”。

### 风险 3：命令示例被误判为“已执行”

例如模型在回答中只是建议用户运行：

```text
你可以执行：
cd project
node script.js
```

应对：
- 仅当“终端命令片段”与“已执行/执行结果/验证结果/真正执行了”等完成态语义同时出现时才触发
- 纯建议语气（“你可以执行”“建议运行”）不拦截

### 风险 4：自动重试导致额外 token 开销

这是有意的兜底成本：
- 只在“应该调工具却没调”的场景触发
- 每次运行最多触发一次
- 相比“明明没执行却谎称执行成功”，多一次重试的成本可接受
