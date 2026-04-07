# Phase I 设计文档

## I1 — Tool Catalog & Profiles

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 工具定义存储 | 静态常量数组 | 工具集在编译时确定，无需动态加载 |
| Profile 语义 | allow-list 模式 | 与 OpenClaw 一致；`full` 返回 undefined（不过滤） |
| Section 分组 | 独立于 ToolRegistry | Catalog 是元数据层，不侵入执行层 |

### 新增文件

- `tools/catalog.ts` — 工具目录 + Profile 定义 + 分组映射

### 修改文件

- `tools/types.ts` — ToolDefinition 增加 `sectionId?` 和 `profiles?`
- `tools/registry.ts` — `getToolSchemas()` 支持 `{ profile }` 参数

### 类型定义

```typescript
type ToolProfileId = 'minimal' | 'coding' | 'messaging' | 'full'

type ToolProfilePolicy = {
  allow?: string[]
  deny?: string[]
}

type CoreToolSection = {
  id: string
  label: string
  tools: Array<{ id: string; label: string; description: string }>
}
```

### 数据流

```
ToolCatalog (static definitions)
  → resolveCoreToolProfilePolicy(profile)
  → ToolProfilePolicy { allow: [...] }
  → ToolRegistry.getToolSchemas({ profile })
  → filtered OpenAIToolSchema[]
```

---

## I2 — Agent Scoping

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 配置格式 | JSON 文件 | 与现有 secrets/proxy 一致 |
| Agent ID 归一化 | lowercase + trim | 防止大小写不一致 |
| Session key 格式 | `agent:{id}:{suffix}` | 可逆解析，不影响现有 session key |
| 默认 agent | 第一个或 default:true | 兼容无配置场景 |

### 新增文件

- `config/agent-scope.ts` — Agent 配置解析（listAgentIds, resolveAgentConfig, resolveDefaultAgentId, resolveAgentIdFromSessionKey）
- `config/agent-types.ts` — AgentEntry, ResolvedAgentConfig 类型

### 修改文件

- `agent/system-prompt.ts` — buildSystemPrompt 接受 agentConfig 参数注入 identity

### 类型定义

```typescript
type AgentEntry = {
  id: string
  name?: string
  default?: boolean
  workspace?: string
  model?: string
  tools?: { profile?: ToolProfileId; allow?: string[]; deny?: string[] }
  identity?: string
}

type ResolvedAgentConfig = {
  name?: string
  workspace?: string
  model?: string
  toolProfile?: ToolProfileId
  identity?: string
}

type EqualityConfig = {
  agents?: {
    defaults?: { model?: string; workspace?: string }
    list?: AgentEntry[]
  }
}
```

### 数据流

```
equality.config.json → loadEqualityConfig()
  → resolveAgentIdFromSessionKey(sessionKey)
  → resolveAgentConfig(config, agentId)
  → { workspace, model, toolProfile, identity }
  → buildSystemPrompt({ agentConfig }) / getToolSchemas({ profile })
```

---

## I3 — Security Audit

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 审计粒度 | 6 类检查 | 覆盖 Equality 实际配置项（不含 Docker/Gateway） |
| 输出格式 | 结构化 JSON | 可被 UI 渲染 |
| 严重级别 | info/warn/critical | 与 OpenClaw 一致 |

### 新增文件

- `security/audit.ts` — runSecurityAudit() + 6 类检查函数
- `security/audit-types.ts` — SecurityAuditFinding, SecurityAuditReport 类型

### 修改文件

- `index.ts` — 添加 `GET /api/security-audit` 路由

### 检查项

| checkId | 严重级别 | 检查内容 |
|---------|---------|---------|
| `sandbox.disabled` | warn | bash sandbox 未启用 |
| `secrets.plain_env` | info | API key 仅在环境变量中 |
| `tools.dangerous_unrestricted` | warn | exec/bash 无 deny 规则 |
| `security.no_content_wrapping` | warn | 外部内容未启用安全包装 |
| `proxy.insecure` | warn | 代理未使用 HTTPS |
| `workspace.missing` | info | 工作目录不存在 |

---

## I4 — Cache Trace

### 决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 输出格式 | JSONL | 每行一个事件，append-only，不阻塞 |
| 写入方式 | 异步队列写入 | 不阻塞主线程 |
| 消息指纹 | SHA-256 | 稳定、可比较 |
| 默认关闭 | 环境变量开关 | 生产环境不增加 I/O |

### 新增文件

- `diagnostics/cache-trace.ts` — createCacheTrace(), CacheTrace 接口, 7 阶段记录
- `diagnostics/redact.ts` — sanitizeDiagnosticPayload() 敏感数据脱敏
- `diagnostics/queued-writer.ts` — QueuedFileWriter 异步文件写入

### 类型定义

```typescript
type CacheTraceStage =
  | 'session:loaded'
  | 'session:sanitized'
  | 'session:limited'
  | 'prompt:before'
  | 'prompt:images'
  | 'stream:context'
  | 'session:after'

type CacheTraceEvent = {
  ts: string
  seq: number
  stage: CacheTraceStage
  sessionKey?: string
  provider?: string
  modelId?: string
  messageCount?: number
  messageRoles?: string[]
  messagesDigest?: string
  systemDigest?: string
  system?: unknown
  messages?: unknown[]
  options?: Record<string, unknown>
  note?: string
  error?: string
}

type CacheTrace = {
  enabled: true
  filePath: string
  recordStage: (stage: CacheTraceStage, payload?: Partial<CacheTraceEvent>) => void
}
```

### 数据流

```
EQUALITY_CACHE_TRACE=1
  → createCacheTrace({ sessionKey, provider, modelId })
  → trace.recordStage('session:loaded', { messages })
  → trace.recordStage('prompt:before', { system })
  → trace.recordStage('stream:context', { messages, options })
  → QueuedFileWriter → {stateDir}/logs/cache-trace.jsonl
```
