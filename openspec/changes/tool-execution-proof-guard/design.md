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
