# Delta Spec: Agent Runner — Phase A 可靠性基础

> 变更: phase-A-reliability-foundations
> 基线: [openspec/specs/agent-runner/spec.md](../../../../specs/agent-runner/spec.md)

---

## ADDED Requirements

### Requirement: 编译错误自动重试

当 toolLoop 中 `bash` 工具返回编译或测试错误时，系统 SHALL 自动提取错误信息、注入修复提示、并让 LLM 重试一轮修复。

**错误识别规则**：
- 仅对 `bash` 工具触发（其他工具的 isError 不触发）
- 工具结果内容 MUST 匹配至少一个已知编译/测试错误模式
- 已知模式包括：TypeScript `error TS\d+:`、Python `SyntaxError`/`IndentationError`、Rust `error[E\d+]`、Go `error:`、Node.js `Cannot find module`、测试框架 `FAILED.*\d+ test`/`AssertionError`

**重试机制**：
- 每次 `runAttempt` 最多触发 1 次自动编译重试（`compileRetryUsed` 标志位）
- 重试时 SHALL 注入一条 user 角色的修复提示到 messages，包含提取的错误信息（最多 2000 字符）
- 注入后 `continue toolLoop`，不中断 toolLoop
- 该机制与"伪执行检测重试"（`forcedToolRetryUsed`）独立，不互斥

**错误提取策略**：
- 按行扫描工具结果，收集匹配错误模式的行及其前后各 2 行上下文
- 截断到 2000 字符
- 无具体匹配行时，返回结果末尾 2000 字符

#### Scenario: TypeScript 编译错误自动重试
- GIVEN Agent 调用 bash 执行 `npx tsc --noEmit`
- AND bash 返回 isError=true，内容包含 `error TS2345: Argument of type 'string' is not assignable`
- AND 本次 runAttempt 尚未使用过编译重试配额
- WHEN toolLoop 汇总阶段完成后执行编译错误检测
- THEN 系统 SHALL 提取错误信息并注入修复提示
- AND toolLoop SHALL 继续（continue），进入下一轮 LLM 调用
- AND LLM 的下一轮输入 SHALL 包含该修复提示

#### Scenario: 非编译的 bash 错误不触发重试
- GIVEN Agent 调用 bash 执行 `ls /nonexistent`
- AND bash 返回 isError=true，内容为 `ls: cannot access '/nonexistent': No such file or directory`
- WHEN toolLoop 汇总阶段完成后执行编译错误检测
- THEN 系统 SHALL NOT 注入修复提示
- AND toolLoop SHALL 正常继续（由 LLM 自行决定下一步）

#### Scenario: 重试配额已用完
- GIVEN Agent 在同一次 runAttempt 中已触发过一次编译错误自动重试
- AND bash 再次返回编译错误
- WHEN toolLoop 汇总阶段完成后执行编译错误检测
- THEN 系统 SHALL NOT 再次注入修复提示
- AND toolLoop SHALL 正常继续

---

## MODIFIED Requirements

### Requirement: 工具调用循环检测（Loop Detection）

（修改项：增加滑动窗口约束）

在现有四种检测器基础上，增加以下约束：

- 检测历史 MUST 使用固定大小的滑动窗口（默认 30 条记录）
- 当历史记录超过窗口大小时，MUST 丢弃最旧的记录
- 全局调用计数（`totalCalls`）不受窗口限制，持续累加
- 全局断路器（circuit_breaker）基于 `totalCalls`，不受窗口影响

**行为变化**：
- 窗口外的旧循环记录不再被检测器捕获（合理：若循环已自然中断 30 次以上，说明已恢复正常）
- 内存使用上限固定为 30 条记录，不随对话增长

#### Scenario: 滑动窗口裁剪
- GIVEN LoopDetector 已记录 50 次工具调用
- WHEN 查询内部 history 长度
- THEN history.length SHALL 等于 30（仅保留最近 30 条）
- AND totalCalls SHALL 等于 50（全局计数不受影响）

#### Scenario: 窗口外的旧循环不再触发
- GIVEN Agent 在第 1-15 次调用中形成了 generic_repeat 循环
- AND 第 16-50 次调用为正常不同的工具调用
- WHEN 第 51 次调用时查询 generic_repeat 检测器
- THEN 第 1-15 次的循环记录已被滑动窗口丢弃
- AND 检测器 SHALL NOT 触发（窗口内无循环）
