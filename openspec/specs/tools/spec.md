# Tools Specification

> 描述工具注册、执行、策略和循环检测的完整行为。  
> 依赖：[agent-runner/spec.md](../agent-runner/spec.md)

---

## Requirements

### Requirement: 工具注册

系统 SHALL 维护一个工具注册表（Tool Registry）。每个工具 MUST 声明：

```typescript
interface ToolDefinition {
  name: string;               // 工具名，全局唯一，字母数字和下划线
  description: string;        // 给 LLM 看的功能描述
  inputSchema: JSONSchema;    // 参数 JSON Schema（用于 LLM Function Calling）
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  policy?: ToolPolicy;        // 权限策略（可选）
}
```

Phase 2 MUST 支持以下内置工具（最小集合）：

| 工具名 | 功能 |
|--------|------|
| `bash` | 在受限环境中执行 shell 命令 |
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件内容 |
| `glob` | 文件路径模式匹配 |
| `web_fetch` | 抓取网页内容（HTTP GET）|

#### Scenario: LLM 调用未注册的工具
- GIVEN LLM 输出了工具调用 `"unknown_tool"`
- WHEN 工具分发器查找工具注册表
- THEN 系统 SHALL 返回 `tool_result` 错误："未知工具 unknown_tool"
- AND Agent 继续运行（不崩溃）

---

### Requirement: 工具名称容错匹配

系统 MUST 对 LLM 输出的工具名进行容错标准化处理。

匹配策略（按优先级）：
1. 精确匹配（大小写敏感）
2. 标准化后匹配（统一下划线 / 中划线）
3. 命名空间剥离后匹配（取最后一段：`mcp.github.create_issue` → `create_issue`）
4. 大小写不敏感匹配（最后兜底）

#### Scenario: LLM 输出带命名空间的工具名
- GIVEN 注册表中有工具 `bash`
- AND LLM 输出工具调用 `"mcp.shell.bash"`
- WHEN 工具分发器处理
- THEN 命名空间剥离后匹配到 `bash`
- AND 工具正常执行

---

### Requirement: Tool Result 截断

单个工具结果 MUST 在注入对话历史前进行截断控制：

- 单个结果字符上限：400,000 字符（约 10 万 tokens）
- 当结果超过上下文预算 30% 时：按 head+tail 策略截断（保留头部和尾部各一半）
- 截断时 MUST 附加截断提示，告知 LLM 内容已被截断

#### Scenario: bash 命令输出过长
- GIVEN `bash` 工具执行后返回 500,000 字符的输出
- WHEN 结果准备注入对话历史
- THEN 结果被截断为约 400,000 字符
- AND 截断处附加 "[...内容已截断，原始输出 500000 字符...]"

---

### Requirement: Tool Result Context Guard

系统 MUST 在每次 LLM 调用前执行 Context Guard，确保对话历史中的工具结果总量不超过上下文预算。

预算公式：
```
contextBudgetChars = contextWindowTokens × 4 × 0.75
// 预留 25% 给 System Prompt 和生成输出
```

超出预算时：就地移除最旧的工具结果（in-place mutation），直到总量在预算内。  
实现方式：通过 Monkey Patch 拦截 Agent 内部的 `transformContext` 方法注入（RAII 模式，运行结束后恢复）。

---

### Requirement: 工具调用循环检测（Loop Detection）

系统 MUST 实现四种循环检测器，防止 Agent 陷入无限工具调用循环：

> **Phase 分期说明**：检测器 1（generic_repeat）和检测器 4（global_circuit_breaker）在 **Phase 2** 实现。  
> 检测器 2（known_poll_no_progress）和检测器 3（ping_pong）在 **Phase 3** 实现。

#### 检测器 1：通用重复检测（generic_repeat）【Phase 2】
- 同一工具以相同参数（argsHash 相同）连续调用且结果不变（resultHash 相同）
- 警告阈值：10 次；终止阈值：20 次

#### 检测器 2：轮询无进展（known_poll_no_progress）【Phase 3】
- 专门针对轮询类工具（`bash` 执行长时间进程时的状态检查等）
- 检测相同参数下结果无变化
- 比通用检测器更早触发

#### 检测器 3：乒乓循环（ping_pong）【Phase 3】
- 检测 A→B→A→B 交替循环模式
- 需同时满足：交替次数 ≥ 20 次 AND 双方结果均稳定（无进展）
- 两个条件都满足才判定为终止（避免误杀）

#### 检测器 4：全局断路器（global_circuit_breaker）【Phase 2】
- 单次 `runAttempt` 内任意工具调用总数 > 30
- 立即终止并返回错误

所有检测器默认 MUST 启用。

Hash 算法：工具调用参数 → JSON stringify（键排序）→ SHA-256 → hex 前 8 位。

#### Scenario: Agent 陷入 bash 轮询循环
- GIVEN Agent 用 `bash` 检查某进程状态，进程始终未完成
- AND Agent 已重复调用 `bash` 20 次，每次结果相同
- WHEN 第 21 次调用触发
- THEN `generic_repeat` 检测器触发终止
- AND Agent 收到错误："检测到工具调用循环，已终止"
- AND `runAttempt` 返回包含该错误的结果
