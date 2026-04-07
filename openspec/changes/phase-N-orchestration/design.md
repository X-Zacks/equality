# Design: Phase N — 多角色编排引擎技术设计

> 本文档为 Phase N 的技术方案、架构决策和数据流设计。
> 所有借鉴自 claw-code-main 的设计模式均在各节标注 `[claw-code]`。

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                       Gateway (Fastify)                      │
│  GET /sessions       ← 含 parentSessionKey 字段             │
│  GET /tasks/tree     ← 新增：返回任务 DAG 树                │
│  GET /tasks/:id      ← 新增：任务详情 + 子任务列表          │
│  WS  /ws             ← 新增：task:progress 事件推送         │
├─────────────────────────────────────────────────────────────┤
│                    PlanExecutor (编排核心)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐            │
│  │ PlanDAG  │ │ PlanNode │ │ ExecutionContext  │            │
│  │  (图)    │→│  (节点)  │→│ (运行时上下文)    │            │
│  └──────────┘ └──────────┘ └──────────────────┘            │
│       ↕              ↕              ↕                       │
│  ┌────────────────────────────────────────────┐            │
│  │         SubagentManager (增强)              │            │
│  │  spawnParallel() / depth=2 / onComplete    │            │
│  └────────────────────────────────────────────┘            │
│       ↕                                                     │
│  ┌────────────────────────────────────────────┐            │
│  │         TaskRegistry (已有 + 增强)          │            │
│  │  依赖订阅 / 完成回调 / 树查询              │            │
│  └────────────────────────────────────────────┘            │
├─────────────────────────────────────────────────────────────┤
│                    CodeIndexer (新增)                        │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ FileScanner │ │ ChunkIndexer │ │ SearchEngine │         │
│  │ (增量扫描) │→│ (向量化)     │→│ (混合检索)   │         │
│  └────────────┘ └──────────────┘ └──────────────┘         │
├─────────────────────────────────────────────────────────────┤
│                   BootstrapGraph [claw-code]                │
│  分阶段启动日志 + 耗时追踪 + 阶段可视化                     │
├─────────────────────────────────────────────────────────────┤
│            Desktop Frontend (React + Tauri v2)              │
│  SessionTree / TaskProgressBar / DiffPreview                │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、N1: Plan DAG 编排引擎

### 2.1 核心类型

```typescript
// orchestration/plan-types.ts

/** Plan 节点：DAG 中的一个任务单元 */
interface PlanNode {
  id: string                           // UUID
  role: AgentRole                      // 执行角色
  task: string                         // 任务描述（给 Agent 的 prompt 基础）
  dependsOn: string[]                  // 前置节点 ID 列表（DAG 边）
  status: PlanNodeStatus               // 节点状态
  assignedTaskId?: string              // 映射到 TaskRegistry 的 taskId
  output?: string                      // 产出路径/摘要
  retryCount: number                   // 已重试次数
  maxRetries: number                   // 最大重试次数（默认 2）
  timeoutMs: number                    // 单节点超时（默认 300000 = 5min）
  priority: number                     // 优先级（0=最高），同层节点按此排序
  metadata?: Record<string, unknown>   // 扩展元数据
}

type AgentRole = 'supervisor' | 'architect' | 'developer' | 'tester' | 'reviewer'

type PlanNodeStatus =
  | 'pending'        // 等待前置完成
  | 'ready'          // 前置已完成，等待调度
  | 'running'        // 正在执行
  | 'completed'      // 成功完成
  | 'failed'         // 失败（可重试）
  | 'exhausted'      // 重试耗尽
  | 'skipped'        // 被 Supervisor 主动跳过
  | 'cancelled'      // 被取消（全局 abort 或手动）

/** Plan 图：完整的任务 DAG */
interface PlanGraph {
  id: string
  title: string
  nodes: PlanNode[]
  createdAt: number
  updatedAt: number
  globalTimeoutMs: number              // 全局超时（默认 3600000 = 1h）
  maxConcurrent: number                // 最大并行节点数（默认 3）
  maxTotalNodes: number                // 节点数上限（默认 50，防止无限膨胀）
}

/** Plan 执行结果 */
interface PlanExecutionResult {
  planId: string
  status: 'completed' | 'partial' | 'failed' | 'cancelled' | 'timed_out'
  completedNodes: number
  totalNodes: number
  failedNodes: string[]                // 失败的节点 ID
  durationMs: number
  summary: string                      // Supervisor 生成的总结
}
```

### 2.2 DAG 引擎核心算法

```typescript
// orchestration/plan-dag.ts

class PlanDAG {
  private adjacency: Map<string, string[]>   // nodeId → dependsOn
  private reverseAdj: Map<string, string[]>  // nodeId → 依赖它的节点

  constructor(graph: PlanGraph)

  /** 拓扑排序——用于验证 DAG 无环 */
  topologicalSort(): string[]

  /** 环检测——Kahn 算法 */
  detectCycle(): string[] | null

  /** 获取当前就绪节点（前置全部 completed，自身 pending） */
  getReadyNodes(): PlanNode[]

  /** 获取可并行调度的节点（就绪 + 不超过 maxConcurrent） */
  getSchedulableNodes(runningCount: number, maxConcurrent: number): PlanNode[]

  /** 判断 Plan 是否已终结（所有节点都在终止态） */
  isTerminated(): boolean

  /** 获取关键路径（最长依赖链），用于进度估算 */
  criticalPath(): PlanNode[]

  /** 获取节点的所有后代（级联取消时使用） */
  getDescendants(nodeId: string): Set<string>

  /** 验证 DAG 合法性：无环 + 无孤立节点 + 无自引用 */
  validate(): { valid: boolean; errors: string[] }
}
```

### 2.3 Plan 执行器

```typescript
// orchestration/plan-executor.ts

interface PlanExecutorDeps {
  subagentManager: SubagentManager
  taskRegistry: TaskRegistry
  roleConfigs: Map<AgentRole, AgentRoleConfig>
  onNodeStatusChange?: (nodeId: string, status: PlanNodeStatus) => void
  onPlanProgress?: (progress: PlanProgress) => void
}

interface PlanProgress {
  planId: string
  completedNodes: number
  totalNodes: number
  runningNodes: string[]
  failedNodes: string[]
  estimatedRemainingMs: number
}

class PlanExecutor {
  constructor(deps: PlanExecutorDeps)

  /** 启动 Plan 执行——核心调度循环 */
  async execute(plan: PlanGraph, supervisorSessionKey: string): Promise<PlanExecutionResult>

  /** 暂停——停止调度新节点，等待运行中节点完成 */
  pause(): void

  /** 恢复——继续调度 */
  resume(): void

  /** 取消——abort 所有运行中节点，级联取消下游 */
  cancel(reason?: string): void

  /** 重试失败节点——将 failed/exhausted 节点重置为 pending */
  retryFailed(nodeId: string): void

  /** 跳过节点——标记为 skipped，其下游可以继续 */
  skipNode(nodeId: string): void

  /** 注入额外上下文——Supervisor steer 机制 */
  steerNode(nodeId: string, message: string): void

  /** 获取当前进度快照 */
  getProgress(): PlanProgress
}
```

**核心调度循环设计：**

```
while (!dag.isTerminated() && !cancelled && !globalTimedOut) {
  1. 计算就绪节点 readyNodes = dag.getReadyNodes()
  2. 过滤已达并发上限 schedulable = dag.getSchedulableNodes(runningCount, maxConcurrent)
  3. 对每个 schedulable 节点:
     a. 创建 AgentRoleConfig → system prompt
     b. spawnParallel() → 子 Agent 开始运行
     c. 注册 onComplete 回调:
        - 成功 → node.status = 'completed'
        - 失败 → retryCount < maxRetries ? retry : 'exhausted'
        - 超时 → 'failed' + 可重试
  4. 等待任意一个节点完成（Promise.race 或事件驱动）
  5. 回调中更新 DAG → 触发 onNodeStatusChange / onPlanProgress
  6. 检查是否有新就绪节点 → 继续循环
}
```

### 2.4 Plan 序列化 [claw-code: PortManifest 模式]

借鉴 claw-code 的 `PortManifest.to_markdown()` + `parity_audit` 模式，Plan 与 Markdown 双向转换：

```typescript
// orchestration/plan-serializer.ts

class PlanSerializer {
  /** tasks.md → PlanGraph */
  static fromMarkdown(markdown: string): PlanGraph

  /** PlanGraph → tasks.md（带状态标记） */
  static toMarkdown(plan: PlanGraph): string

  /** PlanGraph → JSON（持久化用） */
  static toJSON(plan: PlanGraph): string

  /** JSON → PlanGraph */
  static fromJSON(json: string): PlanGraph
}
```

tasks.md 格式约定（与 OpenSpec 兼容）：

```markdown
# Plan: XX 系统开发

> Status: in-progress | Completed: 3/8 | Running: 2

## Phase 1: 架构设计
- [x] N001 [architect] 系统架构设计 → design.md ✅
  - depends: (none)
  - output: openspec/changes/xx/design.md

## Phase 2: 详细设计（并行）
- [x] N002 [developer] 模块 A 详细 spec → specs/module-a/spec.md ✅
  - depends: N001
- [ ] N003 [developer] 模块 B 详细 spec → specs/module-b/spec.md 🔄
  - depends: N001
- [ ] N004 [tester] 测试计划 → specs/test-plan/spec.md ⏳
  - depends: N001

## Phase 3: 实现
- [ ] N005 [developer] 模块 A 实现 ⏳
  - depends: N002, N004
...
```

### 2.5 Parity Audit 自动化 [claw-code: parity_audit]

借鉴 claw-code 的 `ParityAuditResult` 模式，自动检测 Plan 执行与 Spec 的一致性：

```typescript
// orchestration/parity-audit.ts

interface ParityAuditResult {
  planId: string
  specCoverage: { covered: number; total: number }       // spec 中需求 vs 已实现
  testCoverage: { passing: number; total: number }       // 测试通过率
  missingSpecs: string[]                                 // 未覆盖的 spec requirement
  missingTests: string[]                                 // 缺少测试的模块
  uncommittedChanges: string[]                           // 未提交的文件
  report: string                                         // Markdown 报告
}

class ParityAuditor {
  /** 对比 Plan 完成度 vs openspec/specs/ 覆盖度 */
  async audit(planId: string, specRoot: string): Promise<ParityAuditResult>
}
```

---

## 三、N2: SubagentManager 深度增强

### 3.1 解除 depth 限制

```typescript
// 改动：subagent-manager.ts

// 旧：depth >= 1 → 拒绝
// 新：depth >= maxDepth → 拒绝（maxDepth 默认 = 3）

interface SubagentManagerConfig {
  maxDepth: number           // 默认 3（Supervisor → Role → Sub-task → 最内层）
  maxTotalAgents: number     // 全局子 Agent 数量上限（默认 20）
  maxConcurrent: number      // 并行上限（默认 5）
}
```

### 3.2 并行 spawn

```typescript
// 新增方法

interface ParallelSpawnItem {
  params: SpawnSubagentParams
  onComplete?: (result: SubagentResult) => void
}

/** 并行启动多个子 Agent，不阻塞，返回统一结果 */
async spawnParallel(
  parentSessionKey: string,
  items: ParallelSpawnItem[],
  opts?: { depth?: number; maxConcurrent?: number }
): Promise<SubagentResult[]>
```

实现要点：
- 使用 `Promise.allSettled()` 确保不会因一个失败而全部中断
- 内部维护并发信号量，确保不超过 `maxConcurrent`
- 每个子 Agent 完成后立即触发 `onComplete` 回调

### 3.3 完成事件通知 [claw-code: TranscriptStore flush 模式]

借鉴 claw-code TranscriptStore 的 `flush()` 设计——子 Agent 完成时自动 flush 结果到父级：

```typescript
// 改动：SubagentManager.spawn() 增加 onComplete 回调

async spawn(
  parentSessionKey: string,
  params: SpawnSubagentParams,
  opts?: {
    depth?: number
    onComplete?: (result: SubagentResult) => void
  }
): Promise<SubagentResult>
```

### 3.4 级联终止

```typescript
// kill 增强：级联终止所有后代子 Agent

kill(taskId: string, opts?: { cascade?: boolean }): void
```

当 `cascade=true` 时，遍历 TaskRegistry 找到所有 `parentTaskId === taskId` 的任务，递归终止。

---

## 四、N3: 代码索引 + codebase_search

### 4.1 架构

```
FileScanner ──→ ChunkIndexer ──→ VectorStore ──→ SearchEngine
   (增量)          (分块+嵌入)       (内存/SQLite)     (混合检索)
```

### 4.2 FileScanner [claw-code: PortContext 模式]

借鉴 claw-code 的 `build_port_context()` 模式——启动时自动扫描项目结构：

```typescript
// indexer/file-scanner.ts

interface ScanResult {
  totalFiles: number
  indexedFiles: number
  skippedFiles: number
  skippedReasons: Map<string, number>   // 原因 → 数量
  durationMs: number
}

interface FileScannerConfig {
  rootDir: string
  include: string[]              // glob 模式，默认 ['**/*.{ts,tsx,js,jsx,py,md,json}']
  exclude: string[]              // 默认 ['node_modules/**', '.git/**', 'dist/**', '*.lock']
  maxFileSize: number            // 默认 100KB
  maxTotalFiles: number          // 默认 10000
  watchMode: boolean             // 增量模式（监听文件变化）
}

class FileScanner {
  constructor(config: FileScannerConfig)

  /** 全量扫描 */
  async scanAll(): Promise<ScanResult>

  /** 增量更新（仅处理 changed 文件） */
  async scanIncremental(changedPaths: string[]): Promise<ScanResult>

  /** 获取项目概览 [claw-code: PortManifest 模式] */
  getManifest(): ProjectManifest
}

/** 借鉴 claw-code PortManifest */
interface ProjectManifest {
  rootDir: string
  totalFiles: number
  filesByExtension: Map<string, number>
  topLevelModules: Array<{
    name: string
    path: string
    fileCount: number
    description?: string
  }>
  lastScanAt: number
}
```

### 4.3 ChunkIndexer

复用 Phase K 的 `memory/chunking.ts` + `memory/embeddings.ts`，扩展为项目级：

```typescript
// indexer/chunk-indexer.ts

interface CodeChunk {
  id: string                     // hash(filePath + startLine + endLine)
  filePath: string
  startLine: number
  endLine: number
  content: string
  language: string
  type: 'function' | 'class' | 'import' | 'comment' | 'block'
  symbols: string[]              // 提取的标识符名称
  embedding?: number[]           // 向量（延迟计算）
}

interface ChunkIndexerConfig {
  chunkSize: number              // 默认 1500 字符
  chunkOverlap: number           // 默认 200 字符
  embeddingProvider: EmbeddingProvider
}

class ChunkIndexer {
  constructor(config: ChunkIndexerConfig)

  /** 将文件内容分块 + 提取符号 + 计算嵌入 */
  async indexFile(filePath: string, content: string): Promise<CodeChunk[]>

  /** 批量索引 */
  async indexBatch(files: Array<{ path: string; content: string }>): Promise<number>
}
```

### 4.4 SearchEngine

复用 Phase K 的 `memory/hybrid-search.ts`（RRF 融合），扩展为代码搜索：

```typescript
// indexer/search-engine.ts

interface CodeSearchResult {
  filePath: string
  startLine: number
  endLine: number
  content: string
  score: number
  matchType: 'semantic' | 'keyword' | 'symbol'
  symbols: string[]
}

interface CodeSearchOptions {
  query: string
  maxResults?: number            // 默认 10
  fileFilter?: string[]          // glob 过滤
  languageFilter?: string[]      // 语言过滤
  symbolOnly?: boolean           // 仅搜索符号名
}

class CodeSearchEngine {
  constructor(indexer: ChunkIndexer, scanner: FileScanner)

  /** 混合搜索：语义 + 关键词 + 符号 */
  async search(options: CodeSearchOptions): Promise<CodeSearchResult[]>

  /** 强制重建索引 */
  async rebuild(): Promise<ScanResult>

  /** 索引统计 */
  getStats(): IndexStats
}
```

### 4.5 codebase_search 工具

注册为 Equality 的内建工具：

```typescript
// tools/builtins/codebase-search.ts

const codebaseSearchTool: ToolDefinition = {
  name: 'codebase_search',
  description: '搜索项目代码库中的相关代码片段。使用语义搜索 + 关键词搜索混合检索。',
  parameters: {
    query: { type: 'string', description: '搜索查询' },
    file_pattern: { type: 'string', description: '文件 glob 过滤', optional: true },
    max_results: { type: 'number', description: '最大返回数量', optional: true },
  },
}
```

---

## 五、N4: Session 树形 UI + 进度推送

### 5.1 后端 API 改造

```typescript
// Gateway 新增 API

// GET /sessions 响应增强
interface SessionListItem {
  key: string
  title: string
  messageCount: number
  createdAt: number
  updatedAt: number
  parentSessionKey?: string        // 新增：从 key 解析 ::sub:: 关系
  agentRole?: AgentRole            // 新增：角色标识
  taskState?: TaskState            // 新增：关联任务状态
}

// GET /tasks/tree 新增
interface TaskTreeNode {
  taskId: string
  title: string
  role: AgentRole
  state: TaskState
  sessionKey: string
  children: TaskTreeNode[]
  progress?: number                // 0-100
  durationMs?: number
}

// WebSocket 事件
interface TaskProgressEvent {
  type: 'task:progress'
  planId: string
  nodeId: string
  status: PlanNodeStatus
  progress: PlanProgress
}
```

### 5.2 前端组件

```
SessionPanel (改造)
├─ SessionTreeView                  ← 树形会话列表
│   ├─ SessionTreeItem              ← 单个会话项（可展开/折叠）
│   │   ├─ RoleIcon                 ← 角色图标
│   │   ├─ StatusBadge              ← 状态指示（🔄✅❌⏳）
│   │   └─ ProgressBar              ← 子节点进度条
│   └─ SessionTreeItem (children)
├─ PlanProgressPanel                ← Plan 整体进度面板
│   ├─ PlanDAGVisualization         ← DAG 可视化（可选）
│   └─ PlanSummaryText              ← 文字进度摘要
└─ 普通会话列表（无父子关系的）
```

### 5.3 Session Key 解析

```typescript
// utils/session-tree.ts

function parseSessionHierarchy(sessions: SessionListItem[]): SessionTreeNode[] {
  // 1. 识别包含 ::sub:: 的 key
  // 2. 提取 parentKey = key.split('::sub::')[0]
  // 3. 构建 parentKey → children 映射
  // 4. 返回树形结构（顶层 = 无 ::sub:: 的 session）
}
```

---

## 六、N5: Supervisor Skill + 角色配置

### 6.1 角色 Agent 配置 [claw-code: ToolPool + ToolPermissionContext 模式]

借鉴 claw-code 的 `ToolPool.assemble()` + `ToolPermissionContext.blocks()` 模式：

```typescript
// orchestration/role-config.ts

interface AgentRoleConfig {
  role: AgentRole
  displayName: string
  identity: string                              // system prompt 核心身份描述
  model?: string                                // 覆盖默认模型
  toolProfile: 'coding' | 'minimal' | 'readonly'
  toolAllow?: string[]                          // 工具白名单
  toolDeny?: string[]                           // 工具黑名单（精确名称）
  toolDenyPrefixes?: string[]                   // [claw-code] 工具黑名单前缀
  skills?: string[]                             // 加载的 Skill 列表
  maxToolLoops?: number                         // 工具循环上限
  contextBudget?: number                        // context token 预算
}

// 预置配置
const DEFAULT_ROLE_CONFIGS: Record<AgentRole, AgentRoleConfig> = {
  supervisor: {
    role: 'supervisor',
    displayName: '项目监管',
    identity: '你是项目监管 Agent。你负责需求澄清、任务拆分、进度监控和最终汇总。你不直接编写代码，而是通过 subagent_spawn 委派给专业角色。你关注全局进度、阻塞问题和跨模块协调。',
    toolProfile: 'minimal',
    toolAllow: ['subagent_spawn', 'subagent_list', 'subagent_steer', 'subagent_kill', 'read_file', 'write_file', 'list_dir', 'glob', 'memory_save', 'memory_search', 'codebase_search'],
    toolDeny: ['bash', 'edit_file', 'apply_patch'],
    skills: ['supervisor-workflow', 'openspec-skill'],
    maxToolLoops: 100,
  },
  architect: {
    role: 'architect',
    displayName: '架构师',
    identity: '你是架构师 Agent。你负责技术选型、模块划分、接口设计。你输出 design.md 和模块 spec.md。你可以读取代码但不应该直接修改生产代码，只写设计文档。',
    toolProfile: 'coding',
    toolDeny: ['bash'],
    toolDenyPrefixes: ['subagent_'],
    skills: ['openspec-skill'],
    maxToolLoops: 50,
  },
  developer: {
    role: 'developer',
    displayName: '开发者',
    identity: '你是开发 Agent。你严格按照 Spec 和 design.md 编写代码、运行测试、修复 bug。你遵循 tasks.md 中分配给你的具体任务，不偏离范围。完成后更新 tasks.md 标记进度。',
    toolProfile: 'coding',
    toolDenyPrefixes: ['subagent_'],
    skills: ['project-dev-workflow'],
    maxToolLoops: 80,
  },
  tester: {
    role: 'tester',
    displayName: '测试者',
    identity: '你是测试 Agent。你编写测试用例、执行测试、验证覆盖率、报告 bug。你关注边界情况、错误处理和回归测试。发现问题后写明确的 bug 描述到 tasks.md。',
    toolProfile: 'coding',
    toolDenyPrefixes: ['subagent_'],
    skills: ['testing-workflow'],
    maxToolLoops: 60,
  },
  reviewer: {
    role: 'reviewer',
    displayName: '审查者',
    identity: '你是代码审查 Agent。你审查代码质量、Spec 一致性、安全性。你只读代码，输出审查报告到 reviews/ 目录。你不修改任何代码文件。',
    toolProfile: 'coding',
    toolDeny: ['write_file', 'edit_file', 'apply_patch', 'bash'],
    toolDenyPrefixes: ['subagent_'],
    skills: ['review-workflow'],
    maxToolLoops: 40,
  },
}
```

### 6.2 ToolPermissionContext [claw-code]

直接移植 claw-code 的 `ToolPermissionContext` deny_prefixes 概念：

```typescript
// tools/permission-context.ts

interface ToolPermissionContext {
  denyNames: ReadonlySet<string>
  denyPrefixes: readonly string[]
}

function createPermissionContext(config: AgentRoleConfig): ToolPermissionContext {
  return {
    denyNames: new Set((config.toolDeny ?? []).map(n => n.toLowerCase())),
    denyPrefixes: (config.toolDenyPrefixes ?? []).map(p => p.toLowerCase()),
  }
}

function isToolBlocked(name: string, ctx: ToolPermissionContext): boolean {
  const lowered = name.toLowerCase()
  if (ctx.denyNames.has(lowered)) return true
  return ctx.denyPrefixes.some(prefix => lowered.startsWith(prefix))
}
```

### 6.3 Supervisor Skill

```
packages/core/skills/supervisor-workflow/SKILL.md
```

提供完整的多角色协作编排流程指导。

### 6.4 ExecutionRegistry [claw-code: 统一命令+工具注册]

借鉴 claw-code 的 `ExecutionRegistry`——将命令（斜杠命令/快捷操作）和工具统一注册：

```typescript
// orchestration/execution-registry.ts

interface ExecutionEntry {
  name: string
  kind: 'tool' | 'command' | 'skill'
  sourceHint: string               // 来源模块路径
  available: boolean               // 当前是否可用
}

class ExecutionRegistry {
  private entries = new Map<string, ExecutionEntry>()

  register(entry: ExecutionEntry): void
  get(name: string): ExecutionEntry | undefined
  getByKind(kind: ExecutionEntry['kind']): ExecutionEntry[]
  isAvailable(name: string): boolean

  /** [claw-code: CommandGraph 模式] 按来源分类 */
  getGraph(): {
    builtins: ExecutionEntry[]
    plugins: ExecutionEntry[]
    skills: ExecutionEntry[]
  }
}
```

---

## 七、N6: Diff 预览 + Bootstrap 日志

### 7.1 Diff 预览

```typescript
// 前端 DiffPreview 组件
interface DiffPreviewProps {
  filePath: string
  originalContent: string
  newContent: string
  onAccept: () => void
  onReject: () => void
}

// 后端：write_file / edit_file 工具改造
// 当 Agent 调用 write_file 时：
// 1. 不立即写入文件
// 2. 返回 { pending: true, diff: string, filePath: string }
// 3. 前端展示 DiffPreview
// 4. 用户 Accept → 实际写入；Reject → 放弃
// 5. 自动模式（auto-approve）下跳过预览直接写入
```

### 7.2 BootstrapGraph [claw-code]

完全借鉴 claw-code 的 `BootstrapGraph` 7 阶段启动模式：

```typescript
// bootstrap/bootstrap-graph.ts

interface BootstrapStage {
  name: string
  order: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  durationMs?: number
  detail?: string
}

const BOOTSTRAP_STAGES: BootstrapStage[] = [
  { name: 'prefetch', order: 0, status: 'pending', detail: '预加载项目配置和缓存' },
  { name: 'env-guards', order: 1, status: 'pending', detail: '环境检查：Node 版本、工具链' },
  { name: 'config-load', order: 2, status: 'pending', detail: '加载 equality.config + 模型配置' },
  { name: 'tool-registry', order: 3, status: 'pending', detail: '注册内建工具 + 插件工具 + MCP' },
  { name: 'skill-loader', order: 4, status: 'pending', detail: '加载 Skill 定义' },
  { name: 'code-indexer', order: 5, status: 'pending', detail: '项目代码索引（增量）' },
  { name: 'gateway-ready', order: 6, status: 'pending', detail: 'HTTP/WS 服务就绪' },
]

class BootstrapGraph {
  private stages: BootstrapStage[]

  /** 标记阶段开始 */
  start(name: string): void

  /** 标记阶段完成 */
  complete(name: string): void

  /** 标记阶段失败（不阻塞后续——降级模式） */
  fail(name: string, error: string): void

  /** 生成启动报告 [claw-code: as_markdown()] */
  toMarkdown(): string

  /** 生成结构化日志行 */
  toLogLines(): string[]
}
```

### 7.3 TranscriptStore compact 机制 [claw-code]

借鉴 claw-code `TranscriptStore.compact(keep_last)` 机制，增强 session 对话记录管理：

```typescript
// session/transcript-compact.ts

interface TranscriptCompactConfig {
  keepLast: number           // 默认 10 条消息
  compactThreshold: number   // 超过此数量触发自动 compact（默认 30）
  preserveSystemPrompt: boolean   // 是否保留 system prompt（默认 true）
}

/** 与现有 context compaction 协同工作 */
function compactTranscript(
  messages: Message[],
  config: TranscriptCompactConfig
): Message[]
```

### 7.4 HistoryLog [claw-code]

借鉴 claw-code 的 `HistoryLog` 模式，为每个 Plan 执行保留结构化历史：

```typescript
// orchestration/history-log.ts

interface HistoryEvent {
  timestamp: number
  title: string
  detail: string
  nodeId?: string
  role?: AgentRole
}

class HistoryLog {
  private events: HistoryEvent[] = []

  add(title: string, detail: string, opts?: { nodeId?: string; role?: AgentRole }): void
  asMarkdown(): string
  toJSON(): string
}
```

### 7.5 SessionStore 结构化快照 [claw-code: RuntimeSession]

借鉴 claw-code `RuntimeSession` 的全量快照概念：

```typescript
// session/session-snapshot.ts

interface SessionSnapshot {
  sessionKey: string
  prompt: string
  manifest: ProjectManifest        // [claw-code: PortManifest]
  setupReport: BootstrapStage[]    // [claw-code: SetupReport]
  historyLog: HistoryEvent[]       // [claw-code: HistoryLog]
  routedMatches: string[]          // 使用了哪些工具
  turnCount: number
  tokenUsage: { input: number; output: number }
  persistedAt: number
}

function captureSnapshot(session: SessionData): SessionSnapshot
function restoreFromSnapshot(snapshot: SessionSnapshot): SessionData
```

---

## 八、数据流与交互序列

### 8.1 完整工程任务生命周期

```
用户: "帮我开发一个 XX 系统"
  │
  ▼
Gateway → 创建 Supervisor session
  │
  ▼
Supervisor Agent (identity: supervisor-workflow Skill)
  │
  ├─ Step 1: 需求澄清
  │   Supervisor ↔ 用户对话（2-3 轮澄清）
  │
  ├─ Step 2: 生成 Plan DAG
  │   Supervisor 调用 write_file → openspec/changes/xx/tasks.md
  │   PlanSerializer.fromMarkdown() → PlanGraph
  │
  ├─ Step 3: PlanExecutor.execute(plan)
  │   │
  │   ├─ Phase 1: 架构设计
  │   │   PlanExecutor → spawnParallel([{role: architect}])
  │   │   Architect Agent → 输出 design.md + specs/
  │   │   → onComplete → node.status = 'completed'
  │   │
  │   ├─ Phase 2: 详细设计 + 测试计划（并行）
  │   │   PlanExecutor → spawnParallel([
  │   │     {role: developer, task: 'spec Module A'},
  │   │     {role: developer, task: 'spec Module B'},
  │   │     {role: tester, task: 'test plan'},
  │   │   ])
  │   │   → 所有完成 → 进入 Phase 3
  │   │
  │   ├─ Phase 3~N: 分 Phase 编码 + 测试
  │   │   Developer Agent → 编码
  │   │   → onComplete → Tester Agent 启动
  │   │   → 测试失败 → steer Developer 修复
  │   │   → 测试通过 → 下一 Phase
  │   │
  │   └─ Phase N+1: 代码审查
  │       Reviewer Agent → 审查报告
  │
  ├─ Step 4: Parity Audit
  │   ParityAuditor.audit() → 报告
  │
  └─ Step 5: 汇总报告
      Supervisor → 生成总结 → 通知用户
```

### 8.2 Agent 间协作：基于文件系统 [核心设计决策]

Agent 间不需要复杂的消息传递——**它们通过文件系统协作**：

```
openspec/changes/my-feature/
  ├── proposal.md          ← Supervisor 写 / Architect 补充
  ├── design.md            ← Architect 写
  ├── tasks.md             ← PlanSerializer 维护（DAG 状态实时同步）
  ├── specs/
  │    ├── module-a/spec.md  ← Developer 写
  │    ├── module-b/spec.md  ← Developer 写
  │    └── test-plan/spec.md ← Tester 写
  ├── reviews/
  │    └── review-1.md      ← Reviewer 写
  └── history.md            ← HistoryLog 自动维护
```

优势：
1. **无需消息总线** — 读文件即知其他 Agent 产出
2. **天然持久化** — 断电重启后读文件恢复
3. **人类可审查** — 所有中间产物是 Markdown/代码
4. **与 OpenSpec 完美兼容**

---

## 九、claw-code 借鉴清单（完整）

| # | claw-code 模式 | 文件来源 | Equality 对应设计 | 所属子阶段 |
|---|---------------|----------|-------------------|-----------|
| 1 | PortManifest — 模块清单 + 状态 | `port_manifest.py` | `ProjectManifest` in FileScanner | N3 |
| 2 | ParityAudit — 覆盖率自动对比 | `parity_audit.py` | `ParityAuditor.audit()` | N1 |
| 3 | ExecutionRegistry — 统一命令+工具注册 | `execution_registry.py` | `ExecutionRegistry` | N5 |
| 4 | ToolPool — 动态工具集组装 | `tool_pool.py` | `AgentRoleConfig.toolProfile` + allow/deny | N5 |
| 5 | ToolPermissionContext — deny_names + deny_prefixes | `permissions.py` | `ToolPermissionContext` + `isToolBlocked()` | N5 |
| 6 | BootstrapGraph — 7 阶段启动 | `bootstrap_graph.py` | `BootstrapGraph` class | N6 |
| 7 | TranscriptStore — compact(keep_last) + replay + flush | `transcript.py` | `compactTranscript()` | N6 |
| 8 | RuntimeSession — 全量 session 快照 | `runtime.py` | `SessionSnapshot` | N6 |
| 9 | HistoryLog — 结构化事件日志 | `history.py` | `HistoryLog` class | N6 |
| 10 | CostTracker — 费用追踪 + 事件记录 | `cost_tracker.py` + `costHook.py` | 复用现有 `cost/ledger.ts`，增加 per-node 追踪 | N1 |
| 11 | CommandGraph — 命令按来源分类 | `command_graph.py` | `ExecutionRegistry.getGraph()` | N5 |
| 12 | QueryEngineConfig — max_turns / max_budget / compact_after | `query_engine.py` | `PlanNode.timeoutMs` + `maxRetries` + `TranscriptCompactConfig` | N1/N6 |
| 13 | PortRuntime.route_prompt — 路由匹配 | `runtime.py` | 现有 `tools/catalog.ts` 已覆盖，但增加 score 排序 | N5 |
| 14 | SetupReport — 启动诊断报告 | `setup.py` | `BootstrapGraph.toMarkdown()` | N6 |
| 15 | DeferredInit — 信任门控延迟初始化 | `deferred_init.py` | `BootstrapGraph` 中 skill/plugin 阶段条件加载 | N6 |
| 16 | StoredSession — session JSON 持久化 | `session_store.py` | 现有 `session/persist.ts` 已覆盖，增加 `SessionSnapshot` | N6 |
| 17 | $team 模式 — 并行审查 | README.md | `spawnParallel()` + Reviewer role | N2 |
| 18 | $ralph 模式 — 持久执行循环 | README.md | `PlanExecutor` 调度循环 + auto-continue | N1 |
| 19 | ProjectOnboardingState — 项目入门检测 | `projectOnboardingState.py` | `FileScanner.getManifest()` 含 has_readme/has_tests | N3 |
| 20 | stream_submit_message — 流式事件 | `query_engine.py` | 已有 SSE 流式，增加 `task:progress` WebSocket 事件 | N4 |

---

## 十、测试策略

每个子阶段的测试文件与预期断言数：

| 文件 | 覆盖内容 | 预期断言 |
|------|---------|---------|
| `__tests__/orchestration-plan-dag.ts` | DAG 构建/拓扑排序/环检测/就绪节点/关键路径/验证 | ~40 |
| `__tests__/orchestration-plan-executor.ts` | 串行/并行执行/失败重试/暂停恢复/取消/超时/skipNode | ~50 |
| `__tests__/orchestration-plan-serializer.ts` | Markdown ↔ PlanGraph 双向转换 | ~20 |
| `__tests__/orchestration-parity-audit.ts` | Spec 覆盖率检测 + 报告生成 | ~15 |
| `__tests__/subagent-parallel.ts` | spawnParallel/depth=2/级联终止/并发限制 | ~35 |
| `__tests__/indexer-scanner.ts` | 文件扫描/增量/过滤/ProjectManifest | ~25 |
| `__tests__/indexer-search.ts` | 混合搜索/符号搜索/结果排序 | ~25 |
| `__tests__/role-config.ts` | 角色配置加载/ToolPermissionContext/deny_prefix | ~20 |
| `__tests__/execution-registry.ts` | 统一注册/按种类查询/可用性检查 | ~15 |
| `__tests__/bootstrap-graph.ts` | 阶段流转/降级/报告生成 | ~15 |
| `__tests__/transcript-compact.ts` | compact keep_last/阈值触发/system prompt 保留 | ~15 |
| `__tests__/session-snapshot.ts` | 快照捕获/恢复/序列化 | ~15 |
| `__tests__/history-log.ts` | 事件记录/Markdown 导出/JSON 序列化 | ~10 |
| **总计** | | **~300** |

---

*所有技术决策可追溯到 `proposal.md` 中的需求分析和 claw-code-main 源码分析。*
