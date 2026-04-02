# Delta Spec: Phase D — 工具系统扩展

> 依赖: [../../../specs/tools/spec.md](../../../specs/tools/spec.md)
>
> 本 Delta Spec 覆盖 D1（安全集成）、D2（MCP 客户端）对工具系统的行为变更。

---

## ADDED Requirements

### Requirement: 工具策略运行时检查（D1）

系统 SHALL 在每次工具执行前通过策略管道检查工具是否被允许。

- 策略检查 MUST 在 `tool.execute()` 之前完成
- 被拒绝的工具 MUST 返回 `isError=true` 的结果，内容包含拒绝原因
- 被拒绝的工具 MUST NOT 执行任何副作用
- 策略检查 SHOULD 使用 `resolvePolicyForTool()` 实现（复用 Phase C.3 模块）

#### Scenario: 工具被策略管道拒绝
- GIVEN 一个 PolicyContext 将 `write_file` 加入 deniedTools
- WHEN Agent 调用 `write_file` 工具
- THEN 工具不被执行
- AND LLM 收到 isError=true 的消息，内容包含"策略拒绝"

#### Scenario: 无策略时全部放行
- GIVEN 未配置任何 PolicyContext
- WHEN Agent 调用任意工具
- THEN 工具正常执行（向后兼容）

#### Scenario: 高危工具自动标记
- GIVEN Agent 调用 `bash` 工具，命令为 `rm -rf ./build`
- WHEN 策略管道检查通过
- THEN 工具执行，但决策结果包含 `risk='high'`
- AND 审计日志记录风险等级

---

### Requirement: 变异分类运行时审计（D1）

系统 SHALL 在工具执行后记录变异分类信息到审计日志。

- 每次工具调用 MUST 调用 `classifyMutation()` 获取分类
- 分类结果（type/confidence/reason）MUST 写入工具执行日志
- 变异分类 MUST NOT 阻塞工具执行流程

#### Scenario: bash 读命令的分类审计
- GIVEN Agent 调用 `bash`，命令为 `ls -la`
- WHEN 工具执行完成
- THEN 审计日志包含 `{ type: 'read', confidence: 'heuristic' }`

#### Scenario: write_file 的分类审计
- GIVEN Agent 调用 `write_file`
- WHEN 工具执行完成
- THEN 审计日志包含 `{ type: 'write', confidence: 'static' }`

---

### Requirement: MCP 客户端连接（D2）

系统 SHALL 支持通过 MCP（Model Context Protocol）连接外部工具服务器。

- 系统 MUST 支持 stdio 传输方式（优先）
- 系统 SHOULD 支持 SSE 传输方式
- MCP 连接 MUST 在服务启动时根据配置自动建立
- MCP 连接失败 MUST NOT 阻塞服务启动（降级为日志警告）
- 每个 MCP 服务器的连接 MUST 独立管理生命周期

#### Scenario: 通过 stdio 连接 MCP 服务器
- GIVEN MCP_SERVERS 配置包含一个 stdio 类型的服务器 `{ "name": "my-tools", "command": "npx", "args": ["-y", "my-mcp-server"] }`
- WHEN 服务启动
- THEN 系统创建子进程连接 MCP 服务器
- AND 调用 `tools/list` 发现可用工具
- AND 将工具注册到 ToolRegistry

#### Scenario: MCP 服务器连接失败
- GIVEN MCP_SERVERS 配置包含一个无法启动的命令
- WHEN 服务启动
- THEN 系统记录警告日志
- AND 其他 MCP 服务器和内置工具不受影响

#### Scenario: MCP 服务器断开重连
- GIVEN 一个已连接的 MCP 服务器进程意外退出
- WHEN 检测到连接断开
- THEN 系统尝试重连（最多 3 次，指数退避）
- AND 重连期间该服务器的工具不可用但不影响其他工具

---

### Requirement: MCP 工具注册与调用（D2）

系统 SHALL 将 MCP 服务器发现的工具注册为标准 ToolDefinition。

- MCP 工具 MUST 遵循与内置工具相同的 ToolDefinition 接口
- MCP 工具名 MUST 以 `mcp_{serverName}_{toolName}` 格式注册，避免与内置工具冲突
- MCP 工具 MUST 经过策略管道检查（与内置工具一致，复用 D1）
- MCP 工具的输入/输出 MUST 通过 MCP 协议 JSON-RPC 透传
- 工具调用超时 SHOULD 默认 30 秒，可配置

#### Scenario: Agent 调用 MCP 工具
- GIVEN MCP 服务器 "my-tools" 暴露了工具 "query_db"
- WHEN Agent 决定调用 `mcp_my-tools_query_db`
- THEN 系统通过 JSON-RPC 向 MCP 服务器发送 `tools/call` 请求
- AND 将 MCP 响应转换为 ToolResult 返回给 Agent

---

## MODIFIED Requirements

### Requirement: 工具执行日志（修改）

**原规格**：工具执行日志记录 toolName、args、result、isError、durationMs。

**修改后**：工具执行日志 MUST 额外记录：
- `mutationType`：变异分类（read/write/exec）
- `mutationConfidence`：分类置信度（static/heuristic）
- `policyDecision`：策略决策摘要（allowed/denied + decidedBy）
- `risk`：风险等级（low/medium/high）

#### Scenario: 完整审计日志条目
- GIVEN Agent 调用 `write_file` 写入 `./src/index.ts`
- WHEN 工具执行完成
- THEN 日志条目包含：
  ```
  toolName=write_file, mutationType=write, confidence=static,
  policy=allowed(default), risk=high, durationMs=42
  ```

---

## REMOVED Requirements

（无）
