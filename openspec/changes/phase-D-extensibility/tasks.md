# Tasks: Phase D — 可扩展性

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)
>
> 现有代码基线:
> - `index.ts`: 两处 `runAttempt()` 调用，均未传 `beforeToolCall` / `afterToolCall` → D1 注入
> - `runner.ts`: `beforeToolCall` hook 已存在（line ~560），无需修改 → D1 零改动
> - `policy-pipeline.ts`: `resolvePolicyForTool()` 已就绪 → D1 直接调用
> - `mutation.ts`: `classifyMutation()` 已就绪 → D1 直接调用
> - `compaction.ts`: 单次摘要（202 行）→ D3 分段重写
> - `context/types.ts`: `ContextEngine` 接口仅 `assemble` / `afterTurn` → D4 扩展
> - `config/secrets.ts`: KEY_NAMES 40 个 → D2 新增 `MCP_SERVERS`

---

## 1. D1 安全管道集成缝合

### 1.1 核心实现（`packages/core/src/index.ts`）

**影响范围**：仅 `index.ts`。`runner.ts`、`policy-pipeline.ts`、`mutation.ts` 均不改。

- [ ] 1.1.1 导入 `resolvePolicyForTool`、`classifyMutation`、`PolicyContext`
- [ ] 1.1.2 创建 `buildPolicyContext(): PolicyContext` 函数
  - D1 阶段返回空对象（= 全部放行，向后兼容）
  - 预留从 settings 读取 deny/allow 的扩展点
- [ ] 1.1.3 创建 `beforeToolCall` 回调函数
  - 调用 `resolvePolicyForTool(name, buildPolicyContext())`
  - 若 `allowed=false` → 返回 `{ block: true, reason: '策略拒绝: ...' }`
  - 调用 `classifyMutation(name, args)` 记录审计日志
  - 返回 `undefined`（允许执行）
- [ ] 1.1.4 将 `beforeToolCall` 传入两处 `runAttempt()` 调用
  - `/chat/stream` 端点（line ~235）
  - CronScheduler `runAgentTurn` 回调（line ~90）

### 1.2 增强审计日志（`packages/core/src/agent/runner.ts`）

- [ ] 1.2.1 修改 `logToolCall()` 签名：新增可选参数 `mutationType?`, `risk?`
- [ ] 1.2.2 日志条目输出增加 mutation/risk 信息

### 1.3 单元测试（`packages/core/src/__tests__/d1-integration.test.ts`）

- [ ] 1.3.1 T1 — 空策略：所有工具放行（beforeToolCall 返回 undefined）
- [ ] 1.3.2 T2 — deny 策略：write_file 被拦截（返回 block）
- [ ] 1.3.3 T3 — classifyMutation 审计：bash ls 记录为 read
- [ ] 1.3.4 T4 — classifyMutation 审计：write_file 记录为 write
- [ ] 1.3.5 T5 — 高危工具标记：bash rm → risk=high
- [ ] 1.3.6 T6 — 向后兼容：不传 beforeToolCall 时全部放行

---

## 2. D2 MCP 客户端（GAP-6）

### 2.1 类型定义（`packages/core/src/tools/mcp/types.ts`）

- [ ] 2.1.1 定义 `McpServerConfig` 接口（name/transport/command/args/env/url/timeout）
- [ ] 2.1.2 定义 `McpServerState` 接口（config/status/toolCount/lastError/reconnectCount）
- [ ] 2.1.3 定义 MCP JSON-RPC 消息类型（Request/Response/Notification）

### 2.2 客户端核心（`packages/core/src/tools/mcp/client.ts`）

**影响范围**：纯新增模块，不改现有文件。

- [ ] 2.2.1 实现 `McpClient` 类
  - 构造函数接收 `McpServerConfig`
  - `connect()`: spawn 子进程，建立 JSON-RPC 通信
  - `disconnect()`: 发送 shutdown → exit，关闭子进程
  - `initialize()`: 发送 `initialize` 请求，协商 capabilities
  - `listTools()`: 发送 `tools/list`，返回工具列表
  - `callTool(name, args)`: 发送 `tools/call`，返回结果

- [ ] 2.2.2 JSON-RPC 帧解析器（Content-Length 协议，复用 Phase B 的帧解析模式）
- [ ] 2.2.3 子进程生命周期管理（spawn / exit 监听 / 清理）
- [ ] 2.2.4 重连逻辑：进程异常退出 → 重连（最多 3 次，指数退避 1s/2s/4s）

### 2.3 工具桥接（`packages/core/src/tools/mcp/bridge.ts`）

- [ ] 2.3.1 实现 `mcpToolToDefinition(serverName, mcpTool, client): ToolDefinition`
  - 工具名：`mcp_{serverName}_{toolName}`
  - inputSchema：从 MCP 工具 schema 转换
  - execute：通过 `client.callTool()` 调用 → 转换为 `ToolResult`

### 2.4 管理器（`packages/core/src/tools/mcp/index.ts`）

- [ ] 2.4.1 实现 `McpClientManager`
  - 接收 `McpServerConfig[]` 和 `ToolRegistry`
  - `start()`: 并行连接所有服务器，注册工具
  - `stop()`: 断开所有连接，注销工具
  - `getStatus()`: 返回所有服务器状态

### 2.5 集成到入口（`packages/core/src/index.ts` + `config/secrets.ts`）

- [ ] 2.5.1 `config/secrets.ts`: KEY_NAMES 新增 `MCP_SERVERS`
- [ ] 2.5.2 `index.ts`: 启动时读取 `MCP_SERVERS` 配置
- [ ] 2.5.3 `index.ts`: 创建 McpClientManager，连接并注册工具
- [ ] 2.5.4 `index.ts`: 服务关闭时调用 `manager.stop()`

### 2.6 单元测试（`packages/core/src/__tests__/mcp-client.test.ts`）

- [ ] 2.6.1 T7 — McpServerConfig 解析：有效配置 → 通过
- [ ] 2.6.2 T8 — McpServerConfig 解析：缺少 command → 报错
- [ ] 2.6.3 T9 — 工具名生成：mcp_{server}_{tool} 格式
- [ ] 2.6.4 T10 — MCP 工具 schema → ToolDefinition 转换
- [ ] 2.6.5 T11 — 连接失败不阻塞启动
- [ ] 2.6.6 T12 — 重连计数器：3 次后停止

---

## 3. D3 Compaction 分段压缩（GAP-7）

### 3.1 标识符保护（`packages/core/src/context/identifier-shield.ts`）

**影响范围**：纯新增模块。

- [ ] 3.1.1 实现 `extractIdentifiers(text): string[]`
  - UUID 正则：`/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi`
  - URL 正则：`/(?:https?:\/\/|ftp:\/\/)\S+/gi`
  - 文件路径正则：`/(?:[A-Za-z]:\\|\/)[^\s"'<>|:*?]+\.\w+/g`
  - Git hash 正则：`/\b[0-9a-f]{7,40}\b/gi`
- [ ] 3.1.2 实现 `validateIdentifiers(summary, expected): string[]`
  - 返回摘要中缺失的标识符列表
- [ ] 3.1.3 实现 `buildProtectionPrompt(identifiers): string`
  - 生成注入到摘要 prompt 中的标识符保护指令

### 3.2 分段压缩（`packages/core/src/context/compaction.ts` 改造）

**影响范围**：`compaction.ts` 核心逻辑重写，`default-engine.ts` 不改。

- [ ] 3.2.1 新增常量 `CHUNK_TOKEN_THRESHOLD = 4000`
- [ ] 3.2.2 新增常量 `MAX_RETRIES = 3`、`RETRY_BASE_MS = 1000`
- [ ] 3.2.3 实现 `splitIntoChunks(messages, chunkTokens): ChatCompletionMessageParam[][]`
  - 自适应分块比例（0.15~0.4）
  - tool_call/tool_result 配对不拆分
- [ ] 3.2.4 实现 `compactChunked()` 分段压缩函数
  - 每个 chunk 独立调用 LLM 摘要
  - 摘要 prompt 包含标识符保护指令
  - 合并所有摘要为一条消息
- [ ] 3.2.5 修改 `compactWithTimeout()` → `compactWithRetry()`
  - 超时 + 最多 3 次重试 + 指数退避 + 抖动
  - 根据压缩区大小选择单次/分段模式
- [ ] 3.2.6 标识符验证：摘要后检查缺失标识符，追加到摘要末尾

### 3.3 单元测试（`packages/core/src/__tests__/compaction-v2.test.ts`）

- [ ] 3.3.1 T13 — extractIdentifiers：提取 UUID
- [ ] 3.3.2 T14 — extractIdentifiers：提取文件路径（Windows + Unix）
- [ ] 3.3.3 T15 — extractIdentifiers：提取 URL
- [ ] 3.3.4 T16 — extractIdentifiers：提取 Git hash
- [ ] 3.3.5 T17 — validateIdentifiers：检测缺失标识符
- [ ] 3.3.6 T18 — splitIntoChunks：小于阈值 → 不分块
- [ ] 3.3.7 T19 — splitIntoChunks：超过阈值 → 分为多块
- [ ] 3.3.8 T20 — splitIntoChunks：tool_call/tool_result 不拆分
- [ ] 3.3.9 T21 — buildProtectionPrompt：标识符注入到 prompt
- [ ] 3.3.10 T22 — 重试逻辑：模拟失败 → 重试 → 成功

---

## 4. D4 可插拔上下文引擎（GAP-11）

### 4.1 接口扩展（`packages/core/src/context/types.ts`）

**影响范围**：类型定义，不影响运行时。

- [ ] 4.1.1 新增 `BeforeTurnParams` 接口
- [ ] 4.1.2 新增 `AfterToolCallParams` 接口（含 mutationType、risk）
- [ ] 4.1.3 新增 `BeforeCompactionParams` 接口
- [ ] 4.1.4 扩展 `ContextEngine` 接口：新增三个可选方法

### 4.2 默认实现（`packages/core/src/context/default-engine.ts`）

- [ ] 4.2.1 实现 `afterToolCall()`：审计日志输出
- [ ] 4.2.2 实现 `beforeCompaction()`：日志输出（可选）
- [ ] 4.2.3 `beforeTurn()` 保持 no-op（DefaultContextEngine 不需要）

### 4.3 Runner 集成（`packages/core/src/agent/runner.ts`）

**影响范围**：`runner.ts` 仅新增调用点，不改现有逻辑。

- [ ] 4.3.1 `RunAttemptParams` 新增 `contextEngine?: ContextEngine`
- [ ] 4.3.2 工具执行 settled 循环内调用 `contextEngine?.afterToolCall?.()`
- [ ] 4.3.3 `index.ts`: 创建 `DefaultContextEngine` 并传入 `runAttempt()`

### 4.4 单元测试（`packages/core/src/__tests__/context-engine-v2.test.ts`）

- [ ] 4.4.1 T23 — ContextEngine 接口：新方法可选不实现
- [ ] 4.4.2 T24 — afterToolCall 被调用：参数包含 mutationType
- [ ] 4.4.3 T25 — beforeCompaction 被调用：参数包含 compressCount
- [ ] 4.4.4 T26 — 自定义引擎替换 default 引擎

---

## 5. 回归验证

- [ ] 5.1 Phase A 回归：`pnpm --filter @equality/core test:phase-A`（18 tests）
- [ ] 5.2 Phase B 回归：`pnpm --filter @equality/core test:lsp`（26 tests）
- [ ] 5.3 Phase C.1 回归：`pnpm --filter @equality/core test:mutation`（46 tests）
- [ ] 5.4 Phase C.2 回归：`pnpm --filter @equality/core test:sandbox`（31 tests）
- [ ] 5.5 Phase C.3 回归：`pnpm --filter @equality/core test:policy`（34 tests）
- [ ] 5.6 TypeScript 编译检查：`pnpm --filter @equality/core typecheck`（0 errors）

---

## 测试矩阵

| 编号 | 测试 | 子阶段 | spec 场景 |
|------|------|--------|-----------|
| T1 | 空策略全部放行 | D1 | 工具策略运行时检查 S2 |
| T2 | deny 策略拦截 | D1 | 工具策略运行时检查 S1 |
| T3 | bash ls 审计为 read | D1 | 变异分类运行时审计 S1 |
| T4 | write_file 审计为 write | D1 | 变异分类运行时审计 S2 |
| T5 | bash rm → risk=high | D1 | 工具策略运行时检查 S3 |
| T6 | 向后兼容（无 hook） | D1 | 工具策略运行时检查 S2 |
| T7 | MCP 配置解析（有效） | D2 | MCP 客户端连接 S1 |
| T8 | MCP 配置解析（无效） | D2 | MCP 客户端连接 S2 |
| T9 | MCP 工具名格式 | D2 | MCP 工具注册与调用 |
| T10 | MCP schema 转换 | D2 | MCP 工具注册与调用 |
| T11 | 连接失败不阻塞 | D2 | MCP 客户端连接 S2 |
| T12 | 重连 3 次后停止 | D2 | MCP 客户端连接 S3 |
| T13 | 提取 UUID | D3 | 标识符保护 S1 |
| T14 | 提取文件路径 | D3 | 标识符保护 S2 |
| T15 | 提取 URL | D3 | 标识符保护 |
| T16 | 提取 Git hash | D3 | 标识符保护 |
| T17 | 验证缺失标识符 | D3 | 标识符保护 |
| T18 | 小历史不分块 | D3 | Compaction 触发条件 S1 |
| T19 | 大历史分段 | D3 | Compaction 分段压缩 S1 |
| T20 | tool 配对不拆分 | D3 | Compaction 分段压缩 S2 |
| T21 | 保护 prompt 注入 | D3 | 标识符保护 |
| T22 | 重试逻辑 | D3 | Compaction 重试与降级 S1 |
| T23 | 可选方法 no-op | D4 | 上下文引擎生命周期 S2 |
| T24 | afterToolCall 参数 | D4 | 上下文引擎生命周期 S1 |
| T25 | beforeCompaction 参数 | D4 | 上下文引擎生命周期 |
| T26 | 自定义引擎替换 | D4 | 上下文引擎生命周期 |

**D1: 6 tests · D2: 6 tests · D3: 10 tests · D4: 4 tests = 26 新增测试**
**回归: 155 tests（Phase A:18 + B:26 + C:111）**
**总计: 181 tests**
