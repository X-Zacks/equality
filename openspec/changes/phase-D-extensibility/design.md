# Design: Phase D — 可扩展性

> 依赖: [proposal.md](./proposal.md)

---

## 总体架构

```
启动阶段                              运行时（每次 runAttempt）
─────────────                        ────────────────────────
index.ts                              runner.ts toolLoop
  │                                     │
  ├─ 读 MCP_SERVERS 配置         D2     │  LLM 返回 tool_calls
  ├─ 创建 McpClientManager              │
  ├─ 连接 MCP 服务器 → 工具发现          │  ┌─ D1: beforeToolCall hook ──┐
  ├─ 注册 MCP 工具到 ToolRegistry       │  │  resolvePolicyForTool()    │
  │                                     │  │  classifyMutation()        │
  ├─ 构造 beforeToolCall 回调    D1     │  │  → block / allow + audit   │
  ├─ 传入 runAttempt()                  │  └────────────────────────────┘
  │                                     │
  │                                     │  tool.execute()
  │                                     │
  │                                     │  ┌─ D4: afterToolCall hook ──┐
  │                                     │  │  contextEngine.afterTool  │
  │                                     │  └───────────────────────────┘
  │                                     │
  │                                     │  D3: compactIfNeeded()
  │                                     │       分段压缩 + 标识符保护
  │                                     │
  └─────────────────────────────────────┘
```

---

## D1. 安全管道集成缝合

### 核心变更：`index.ts`（约 +30 行）

**问题**：`runner.ts` 的 `beforeToolCall` / `afterToolCall` hook 接口已存在（Phase B 设计），但 `index.ts` 调用 `runAttempt()` 时**从未传入**这两个回调。

**方案**：在 `index.ts` 中构造 `beforeToolCall` 回调，内部调用 C3 的 `resolvePolicyForTool()` + C1 的 `classifyMutation()`。

```typescript
// index.ts — 在 runAttempt 调用处新增 beforeToolCall
import { resolvePolicyForTool, classifyMutation } from './tools/index.js'
import type { PolicyContext, BeforeToolCallInfo } from './agent/runner.js'

// 全局策略上下文（Phase D1：暂为空，后续从设置页读取）
function buildPolicyContext(): PolicyContext {
  // TODO D1+: 从 settings 读取用户配置的策略
  return {}
}

async function beforeToolCall(info: BeforeToolCallInfo) {
  const { name, args } = info

  // 1. C3 策略检查
  const policy = resolvePolicyForTool(name, buildPolicyContext())
  if (!policy.allowed) {
    return { block: true, reason: `策略拒绝: ${policy.decidedBy}` }
  }

  // 2. C1 变异分类（审计，不阻塞）
  const mutation = classifyMutation(name, args)
  console.log(`[audit] ${name}: ${mutation.type}/${mutation.confidence}, risk=${policy.risk}`)

  return undefined // 允许执行
}
```

### 影响范围

| 文件 | 改动 | 说明 |
|------|------|------|
| `index.ts` | ✏️ ~30 行 | 构造 `beforeToolCall` 回调，传入两处 `runAttempt()` 调用 |
| `runner.ts` | **不改** | `beforeToolCall` hook 已存在（line ~560），只需 index.ts 传参 |
| `policy-pipeline.ts` | **不改** | 被 index.ts 调用 |
| `mutation.ts` | **不改** | 被 index.ts 调用 |
| `runner.ts logToolCall()` | ✏️ ~5 行 | 日志条目增加 mutationType、risk 字段 |

### 关键决策

1. **策略 context 从哪来？**
   - D1 阶段：空 PolicyContext（= 全部放行，与现有行为一致）
   - 后续：从 settings.json 读取用户配置的 deny/allow 规则
   - 设计为函数 `buildPolicyContext()`，便于后续扩展

2. **高危操作如何处理？**
   - D1 阶段：仅 **日志记录** risk='high'，不阻塞
   - 不做 UI 弹窗审批（Phase E 考虑）

3. **为什么不在 runner.ts 内部直接调用 C3？**
   - `runner.ts` 是纯运行时引擎，不应知道 `PolicyContext` 从哪来
   - `index.ts` 是应用入口，负责依赖注入
   - 保持 runner.ts 的 hook-based 架构不变

---

## D2. MCP 客户端（GAP-6）

### 新增文件

| 文件 | 行数估算 | 职责 |
|------|---------|------|
| `tools/mcp/client.ts` | ~200 | MCP 客户端核心：子进程管理、JSON-RPC 通信 |
| `tools/mcp/bridge.ts` | ~100 | MCP 工具 → ToolDefinition 适配器 |
| `tools/mcp/types.ts` | ~40 | MCP 配置和协议类型 |
| `tools/mcp/index.ts` | ~20 | 模块导出 |

### 核心数据结构

```typescript
// tools/mcp/types.ts

/** 单个 MCP 服务器配置 */
export interface McpServerConfig {
  /** 服务器名称（唯一标识） */
  name: string
  /** 传输方式 */
  transport: 'stdio' | 'sse'
  /** stdio: 启动命令 */
  command?: string
  /** stdio: 命令参数 */
  args?: string[]
  /** stdio: 环境变量 */
  env?: Record<string, string>
  /** sse: 服务端 URL */
  url?: string
  /** 工具调用超时（毫秒，默认 30000） */
  toolTimeoutMs?: number
  /** 是否启用（默认 true） */
  enabled?: boolean
}

/** MCP 服务器运行时状态 */
export interface McpServerState {
  config: McpServerConfig
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  /** 已发现的工具数量 */
  toolCount: number
  /** 最后一次错误 */
  lastError?: string
  /** 重连计数 */
  reconnectCount: number
}
```

### MCP 客户端设计（stdio）

```
index.ts 启动
    │
    ├─ 读取 MCP_SERVERS 配置（JSON 字符串）
    ├─ 创建 McpClientManager
    │
    ▼ 每个服务器配置
  McpClient
    │
    ├─ spawn 子进程（command + args）
    ├─ stdin/stdout JSON-RPC 通信
    │
    ├─ 发送 initialize → 收到 capabilities
    ├─ 发送 tools/list → 收到工具列表
    │
    ├─ 为每个 MCP 工具创建 ToolDefinition:
    │    name: `mcp_{serverName}_{toolName}`
    │    execute: → 发送 tools/call → 返回 ToolResult
    │
    └─ 注册到全局 ToolRegistry
```

### MCP 配置存储

```typescript
// config/secrets.ts — KEY_NAMES 新增
'MCP_SERVERS'   // JSON 字符串: McpServerConfig[]
```

**配置示例**（设置页 JSON 编辑器输入）：
```json
[
  {
    "name": "filesystem",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\zz\\projects"]
  },
  {
    "name": "github",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "ghp_xxx" }
  }
]
```

### 影响范围

| 文件 | 改动 | 说明 |
|------|------|------|
| `tools/mcp/*` | ✨ 新增 ~360 行 | MCP 客户端、桥接、类型 |
| `tools/index.ts` | ✏️ ~3 行 | 导出 MCP 模块 |
| `index.ts` | ✏️ ~25 行 | 启动时创建 McpClientManager，注册工具 |
| `config/secrets.ts` | ✏️ +1 行 | KEY_NAMES 新增 `MCP_SERVERS` |

### 关键决策

1. **为什么优先 stdio 而非 SSE？**
   - Windows 桌面应用场景，本地工具服务器占多数
   - stdio 不需要额外端口，适合桌面端
   - SSE 作为 D2+ 后续支持

2. **工具名冲突处理？**
   - MCP 工具统一前缀 `mcp_{serverName}_`，不与内置工具冲突
   - 如果两个 MCP 服务器有同名工具，后注册的覆盖前者（日志警告）

3. **子进程生命周期？**
   - 服务启动时创建，服务关闭时销毁
   - 进程异常退出 → 自动重连（最多 3 次，指数退避 1s/2s/4s）
   - 超过 3 次 → 标记 status='error'，不再重连

4. **Windows 路径处理？**
   - `command` 字段支持 `npx`、`node`、绝对路径
   - 子进程 `cwd` 默认为 `getWorkspaceDir()`
   - `PATH` 继承当前进程（包含 `.cargo\bin` 等）

---

## D3. Compaction 分段压缩（GAP-7）

### 文件：`context/compaction.ts`（改造）+ 新增 `context/identifier-shield.ts`

### 分段策略

```
原始压缩区（去除 system[0] 和保护尾部后）
    │
    ▼ 估算 tokens
    │
    ├─ < CHUNK_TOKEN_THRESHOLD（4000）→ 原有单次摘要（不变）
    │
    └─ ≥ CHUNK_TOKEN_THRESHOLD → 分段逻辑：
         │
         ├─ 1. 计算 chunkRatio（自适应：0.15~0.4）
         ├─ 2. 按 chunkRatio × 总 tokens 划分 chunk
         ├─ 3. tool_call/tool_result 不拆分（边界修正）
         ├─ 4. 每个 chunk 独立调用 LLM 摘要
         ├─ 5. 合并所有摘要为一条消息
         └─ 6. 替换压缩区
```

### 标识符保护设计

```typescript
// context/identifier-shield.ts

/** 预提取消息中的关键标识符 */
export function extractIdentifiers(text: string): string[] {
  const patterns = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,  // UUID
    /(?:https?:\/\/|ftp:\/\/)\S+/gi,                                       // URL
    /(?:[A-Za-z]:\\|\/)[^\s"'<>|:*?]+\.\w+/g,                              // 文件路径
    /\b[0-9a-f]{7,40}\b/gi,                                                 // Git hash
  ]
  const result = new Set<string>()
  for (const pat of patterns) {
    for (const match of text.matchAll(pat)) {
      result.add(match[0])
    }
  }
  return [...result]
}

/** 验证摘要中是否保留了关键标识符 */
export function validateIdentifiers(summary: string, expected: string[]): string[] {
  return expected.filter(id => !summary.includes(id))
}
```

**摘要 prompt 增强**：
```
请将以下对话历史压缩为简洁摘要。

⚠️ 以下标识符 MUST 原样保留（不可缩写、改写或省略）：
${identifiers.join('\n')}

[原有的保留/省略规则]
```

### 重试与降级

```
compactIfNeeded()
    │
    ├─ 分段模式？
    │   ├─ 是 → compactChunked() → 每个 chunk 调用 LLM
    │   └─ 否 → compactSingle()（原有逻辑）
    │
    ├─ 失败？
    │   ├─ 重试 1（1s + jitter）
    │   ├─ 重试 2（2s + jitter）
    │   ├─ 重试 3（4s + jitter）
    │   └─ 全部失败 → trimMessages()
    │
    └─ 成功 → 标识符验证 → 缺失的标识符追加到摘要末尾
```

### 影响范围

| 文件 | 改动 | 说明 |
|------|------|------|
| `context/compaction.ts` | ✏️ 重写核心 | 新增分段逻辑、重试逻辑、标识符 prompt 注入 |
| `context/identifier-shield.ts` | ✨ 新增 ~60 行 | 标识符提取和验证 |
| `context/default-engine.ts` | **不改** | 仍调用 `compactIfNeeded()`，接口不变 |
| `context/types.ts` | **不改** | CompactionResult 接口不变 |

### 关键决策

1. **为什么 4000 tokens 作为分段阈值？**
   - 参考 OpenClaw 的 `splitMessagesByTokenShare()` 分块策略
   - 4000 tokens ≈ 15-20 条消息，单次摘要质量可保证
   - 低于此阈值的历史用原有单次摘要（向后兼容）

2. **tool_call/tool_result 为什么不能拆分？**
   - LLM API 要求 tool_call 和 tool_result 配对出现
   - 摘要 LLM 需要看到完整的"调用→结果"才能生成有意义的摘要

3. **标识符验证失败怎么办？**
   - 不重试（LLM 摘要不保证完美保留）
   - 将缺失的标识符附加到摘要末尾（兜底策略）

---

## D4. 可插拔上下文引擎（GAP-11）

### 文件：`context/types.ts`（扩展）+ `context/default-engine.ts`（实现）+ `runner.ts`（调用点）

### 接口扩展

```typescript
// context/types.ts — 新增可选生命周期方法

export interface ContextEngine {
  readonly engineId: string

  // 已有
  assemble(params: AssembleParams): Promise<AssembleResult>
  afterTurn(params: AfterTurnParams): Promise<void>
  dispose?(): Promise<void>

  // D4 新增（全部可选，不实现 = no-op）
  beforeTurn?(params: BeforeTurnParams): Promise<void>
  afterToolCall?(params: AfterToolCallParams): Promise<void>
  beforeCompaction?(params: BeforeCompactionParams): Promise<void>
}

export interface BeforeTurnParams {
  sessionKey: string
  userMessage: string
}

export interface AfterToolCallParams {
  sessionKey: string
  toolName: string
  args: Record<string, unknown>
  result: string
  isError: boolean
  /** C1 变异分类 */
  mutationType: 'read' | 'write' | 'exec'
  /** D1 策略决策 */
  risk: 'low' | 'medium' | 'high'
}

export interface BeforeCompactionParams {
  sessionKey: string
  /** 即将被压缩的消息数 */
  compressCount: number
  /** 当前 token 使用率 */
  tokenUsageRatio: number
}
```

### runner.ts 调用点

```
runner.ts toolLoop 中新增 2 个调用点（约 +15 行）：

1. 工具执行完毕后（settled 处理循环内）：
   if (contextEngine?.afterToolCall) {
     await contextEngine.afterToolCall({ ... })
   }

2. beforeCompaction → 已通过 compactIfNeeded 内部 hook 实现（不改 runner）
```

### 影响范围

| 文件 | 改动 | 说明 |
|------|------|------|
| `context/types.ts` | ✏️ ~25 行 | 新增 3 个可选方法 + 参数接口 |
| `context/default-engine.ts` | ✏️ ~20 行 | 实现 `afterToolCall`（审计日志） |
| `runner.ts` | ✏️ ~15 行 | 新增 `RunAttemptParams.contextEngine?` + 调用 afterToolCall |
| `index.ts` | ✏️ ~3 行 | 传入 contextEngine 实例 |

### 关键决策

1. **为什么所有新方法都是可选的？**
   - 向后兼容：现有 `DefaultContextEngine` 不被强制实现
   - 第三方引擎可以选择性实现需要的钩子

2. **contextEngine 从哪传入 runner？**
   - 方案 A：作为 `RunAttemptParams.contextEngine` 传入 ← **选此方案**
   - 方案 B：runner 内部自建 → 不灵活，无法替换
   - `index.ts` 创建 `DefaultContextEngine`，传入每次 `runAttempt()` 调用

3. **afterToolCall 在 runner 的哪个位置调用？**
   - 在工具执行 settled 循环内，`messages.push(tool result)` 之后
   - 在 LoopDetector.check() 之前
   - 异步但 await（保证写入审计后再继续）

---

## 全局影响矩阵

| 文件 | D1 | D2 | D3 | D4 | 总改动 |
|------|:--:|:--:|:--:|:--:|--------|
| `index.ts` | ✏️ +30 | ✏️ +25 | — | ✏️ +3 | ~58 行 |
| `runner.ts` | ✏️ +5 | — | — | ✏️ +15 | ~20 行 |
| `config/secrets.ts` | — | ✏️ +1 | — | — | +1 行 |
| `tools/index.ts` | — | ✏️ +3 | — | — | +3 行 |
| `tools/mcp/*` | — | ✨ ~360 | — | — | 新增模块 |
| `context/compaction.ts` | — | — | ✏️ 重写 | — | ~250 行 |
| `context/identifier-shield.ts` | — | — | ✨ ~60 | — | 新增 |
| `context/types.ts` | — | — | — | ✏️ +25 | +25 行 |
| `context/default-engine.ts` | — | — | — | ✏️ +20 | +20 行 |
| `__tests__/d1-integration.test.ts` | ✨ | — | — | — | 新增 |
| `__tests__/mcp-client.test.ts` | — | ✨ | — | — | 新增 |
| `__tests__/compaction-v2.test.ts` | — | — | ✨ | — | 新增 |
| `__tests__/context-engine-v2.test.ts` | — | — | — | ✨ | 新增 |

**风险评估**：
- D1：**低风险** — 只在 index.ts 注入回调，runner.ts 不改
- D2：**中风险** — 新增模块，子进程管理复杂度
- D3：**中风险** — 重写 compaction 核心逻辑
- D4：**低风险** — 扩展接口，新增可选方法
