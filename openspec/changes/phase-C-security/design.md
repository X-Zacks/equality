# Design: Phase C — 安全性基础

> 依赖: [proposal.md](./proposal.md)

---

## 总体架构

```
Agent toolLoop
    │
    │ 调用工具
    ▼
Tool { name, action, params }
    │
    ├─ C1: 识别操作类型 ─────────────────► mutating? 指纹?
    │
    │ if tool == 'bash'
    ├─ C2: 检查路径沙箱 ─────────────────► 越权? 链接逃逸?
    │
    │ C3: 获取工具策略 ─────────────────► 允许? 需审批?
    │
    ▼
Tool { allow: bool, requiresApproval: bool }
    │
    ├─ if allow=false → 拦截（log + 返回权限错误）
    ├─ if requiresApproval=true → 记录审计日志
    └─ allow=true → 执行
```

---

## C1. 写操作精确识别

### 文件：`tools/mutation.ts`

### 与现有代码的关系

**替代目标**：`runner.ts` 中硬编码的 `MUTATING_TOOL_NAMES`（6 个静态工具名）。

```typescript
// ❌ 现有实现（runner.ts 约 149 行）
const MUTATING_TOOL_NAMES = new Set([
  'write_file', 'bash', 'apply_patch', 'delete_file', 'move_file', 'rename_file',
])

// ✅ Phase C 替代：动态分类 + 精准 bash 命令词分析
classifyOperation('bash', { command: 'ls -la' })   // → READ（原来判为 WRITE）
classifyOperation('bash', { command: 'rm foo.ts' }) // → WRITE
```

### 核心数据结构

```typescript
export enum MutationType {
  READ = 'read',
  WRITE = 'write',
  EXEC = 'exec',    // 进程启动、cron 调度等（非文件修改但有副作用）
}

export interface MutationClassification {
  type: MutationType
  confidence: 'static' | 'heuristic'  // static = 工具名直接映射；heuristic = bash 命令词推断
  reason: string                       // 用于审计日志
}

export interface OperationFingerprint {
  toolName: string
  action: string
  targets: string[]  // 受影响的路径/ID
  hash: string       // SHA-256(sorted targets)，与 loop-detector 复用
}
```

### 完整工具分类表（全部 19 个注册工具）

```typescript
const TOOL_MUTATION_MAP: Record<string, MutationType | 'dynamic'> = {
  // ── 文件系统 ──
  read_file:       MutationType.READ,
  write_file:      MutationType.WRITE,
  edit_file:       MutationType.WRITE,
  glob:            MutationType.READ,
  grep:            MutationType.READ,
  list_dir:        MutationType.READ,
  apply_patch:     MutationType.WRITE,

  // ── 运行时 ──
  bash:            'dynamic',    // 按命令词判断
  process:         'dynamic',    // kill/send → WRITE; list/poll/log → READ

  // ── 网络 ──
  web_fetch:       MutationType.READ,
  web_search:      MutationType.READ,
  browser:         MutationType.READ,   // 浏览器截图/读取

  // ── 媒体 ──
  read_image:      MutationType.READ,
  read_pdf:        MutationType.READ,

  // ── 定时 ──
  cron:            'dynamic',    // create/delete → EXEC; list → READ

  // ── 记忆 ──
  memory_save:     MutationType.WRITE,
  memory_search:   MutationType.READ,

  // ── LSP ──
  lsp_hover:       MutationType.READ,
  lsp_definition:  MutationType.READ,
  lsp_references:  MutationType.READ,
  lsp_diagnostics: MutationType.READ,
}
```

### Bash 命令词分类（Windows + Unix 双模式）

Equality 的 bash 工具在 Windows 下实际执行 PowerShell（`powershell.exe -Command ...`），需同时识别两种命令词。

```typescript
// 写/修改操作命令词
const WRITE_COMMANDS_UNIX = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'touch', 'mkdir', 'chmod', 'chown',
  'sed', 'dd', 'tee', 'truncate', 'install',
  'npm', 'pnpm', 'yarn', 'pip', 'cargo',  // 包管理器修改 node_modules 等
  'git',  // git commit/push/checkout 等修改仓库
])

const WRITE_COMMANDS_POWERSHELL = new Set([
  'remove-item', 'move-item', 'copy-item', 'new-item', 'set-content',
  'out-file', 'add-content', 'rename-item', 'clear-content',
])

// 只读操作命令词
const READ_COMMANDS_UNIX = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'awk',
  'which', 'env', 'echo', 'pwd', 'whoami', 'date', 'uname',
  'file', 'stat', 'du', 'df', 'free', 'ps', 'top',
  'node', 'python', 'python3',  // 脚本执行 → 保守 EXEC
])

const READ_COMMANDS_POWERSHELL = new Set([
  'get-childitem', 'get-content', 'get-item', 'get-process',
  'get-location', 'test-path', 'select-string', 'measure-object',
])
```

**命令词提取逻辑**：

```
"cd /tmp && rm -rf build"
  ↓ 按 && ; | 分割
["cd /tmp", "rm -rf build"]
  ↓ 取第一个非空词
["cd", "rm"]
  ↓ 取最危险的分类
MutationType.WRITE（因为 rm）
```

### 接口

```typescript
/** 分类工具操作的修改类型 */
export function classifyMutation(toolName: string, params: Record<string, unknown>): MutationClassification

/** 提取操作指纹（用于循环检测增强） */
export function extractFingerprint(toolName: string, params: Record<string, unknown>): OperationFingerprint
```

---

## C2. Bash 沙箱路径隔离

### 文件：`tools/bash-sandbox.ts`

### 与现有代码的关系

**注入位置**：`builtins/bash.ts` 的 `execute()` 函数顶部，在 `spawn()` 之前。

```typescript
// bash.ts execute() 中：
const command = String(input.command ?? '')
// ▶ 新增：沙箱检查
const sandbox = validateBashCommand(command, { workspaceDir: ctx.workspaceDir, allowSystemTemp: true })
if (!sandbox.allowed) {
  return { content: `❌ 沙箱拦截: ${sandbox.reason}`, isError: true }
}
// ... 原有 spawn 逻辑
```

### 核心验证流程

```typescript
export interface SandboxConfig {
  workspaceDir: string
  allowSystemTemp?: boolean  // 允许 /tmp, %TEMP% 等
  allowedExternalPaths?: string[]  // 额外白名单路径
  denyPatterns?: RegExp[]    // 黑名单正则（如 /etc, /root）
}

export interface SandboxResult {
  allowed: boolean
  reason?: string
  paths?: string[]     // 检测到的路径列表（用于审计）
}

export function validateBashCommand(command: string, config: SandboxConfig): SandboxResult
```

### 路径提取策略

**第一步**：注入检测（在解析路径之前拦截攻击）

```typescript
function detectInjection(command: string): string | null
```

- Unicode 不可见空格：`\u00A0`, `\u2000`-`\u200B`, `\u3000`, `\uFEFF`
- NULL 字节：`\x00`
- 原始回车注入：`\r` 不跟 `\n`

**第二步**：提取路径参数

```
"cd /tmp && rm -rf ./build" 
  ↓ 按 && ; | \n 分割
["cd /tmp", "rm -rf ./build"]
  ↓ 对每个子命令提取路径参数
["/tmp", "./build"]
```

注意：只提取明确的路径参数（文件/目录参数位置），不对所有 token 做路径检查。对于无法识别参数位置的命令，保守跳过（不拦截也不放行，交给后续审计）。

**第三步**：路径验证

```typescript
function validatePath(inputPath: string, config: SandboxConfig): SandboxResult
```

1. `path.resolve(config.workspaceDir, inputPath)` → 绝对路径
2. 尝试 `fs.realpathSync(resolved)` → 追踪符号链接
3. 检查 `normalizedPath.startsWith(normalizedWorkspace)` 或在白名单中
4. Windows 路径标准化：`\` → `/`，不区分大小写

### Windows 特殊处理

```
Windows: workspaceDir = "C:\\Users\\zz\\projects\\equality"
  bash 实际执行: powershell.exe -Command "..."
  路径分隔符: \ 和 / 混用
  大小写: 不敏感（c:\ == C:\）
  临时目录: %TEMP% → C:\Users\zz\AppData\Local\Temp

Unix: workspaceDir = "/home/user/myproject"
  bash 实际执行: /bin/sh -c "..."
  路径分隔符: 仅 /
  大小写: 敏感
  临时目录: /tmp, /var/tmp
```

---

## C3. 多层工具策略管道

### 文件：`tools/policy-pipeline.ts`

### 与现有代码的关系

**升级目标**：`policy.ts` 的 `applyToolPolicy()`（~45 行，仅全局级别）。

```
现有: policy.ts → applyToolPolicy(tools, singlePolicy) → filtered tools
升级: policy-pipeline.ts → resolvePolicyForTool(name, multiLayerCtx) → { allowed, requiresApproval, risk }
```

**兼容策略**：
- `policy.ts` 保留，`applyToolPolicy()` 内部改为委托 `policy-pipeline.ts`
- `ToolPolicy` 接口不变，`scope` 字段生效
- 对外 API 不变，runner.ts 中只需新增 per-tool 策略检查

### 层级结构

```typescript
/** 单层策略 */
export interface PolicyLevel {
  allowedTools?: string[]   // 白名单（空 = 全部允许）
  deniedTools?: string[]    // 黑名单（优先于白名单）
  toolOptions?: Record<string, {
    requiresApproval?: boolean  // 高危工具需审批
    risk?: 'low' | 'medium' | 'high'
  }>
}

/** 多层策略上下文 */
export interface PolicyContext {
  profile?: PolicyLevel       // 全局基础策略
  providerProfile?: PolicyLevel  // Provider 特定策略
  agentProfile?: PolicyLevel    // Agent 特定策略
}

/** 策略决策结果 */
export interface PolicyDecision {
  allowed: boolean
  requiresApproval: boolean
  risk: 'low' | 'medium' | 'high'
  decidedBy: string    // 哪个层级做出的决策（audit 用）
}

export function resolvePolicyForTool(toolName: string, ctx: PolicyContext): PolicyDecision
```

**合并规则：**
1. 遍历 profile → providerProfile → agentProfile
2. denied 白名单优先：任一层有 deniedTools 包含，结果为 denied
3. 最深层覆盖浅层：agentProfile.allowedTools > providerProfile > profile
4. 返回最终结果 + 审批标记

**与 C1/C2 的关系：**
- C1 确定 `toolMeta.risk = 'write' | 'read' | 'exec'`
- C3 查询 `toolMeta.requiresApproval`（高危工具需审批）
- C2 路径沙箱检查之前被 C3 的策略检查拦截（双保险）

---

## 集成点

### Runner 调用序列

```typescript
// packages/core/src/agent/runner.ts — toolLoop 中调用工具前

async function executeToolWithGuards(tool, params, ctx) {
  // Step 1: C3 策略检查
  const decision = resolvePolicyForTool(tool.name, policyCtx)
  if (!decision.allowed) {
    audit.denied(tool.name, decision.decidedBy)
    return { content: `❌ 工具 ${tool.name} 被策略禁用 (${decision.decidedBy})`, isError: true }
  }

  // Step 2: C1 操作分类
  const mutation = classifyMutation(tool.name, params)

  // Step 3: C2 bash 沙箱（仅 bash 工具）
  if (tool.name === 'bash') {
    const sandbox = validateBashCommand(params.command, {
      workspaceDir: ctx.workspaceDir,
      allowSystemTemp: true,
    })
    if (!sandbox.allowed) {
      audit.sandboxViolation(tool.name, sandbox)
      return { content: `❌ 沙箱拦截: ${sandbox.reason}`, isError: true }
    }
  }

  // Step 4: 审计（写操作 + 需审批）
  if (mutation.type === MutationType.WRITE) {
    const fingerprint = extractFingerprint(tool.name, params)
    audit.writeOperation(tool.name, mutation, fingerprint)
  }

  // Step 5: 执行
  return await tool.execute(params, ctx)
}
```

### 迁移步骤

```
1. 新增 mutation.ts        → C1 纯函数，无副作用，可独立测试
2. 新增 bash-sandbox.ts    → C2 纯函数，仅 path 验证
3. 新增 policy-pipeline.ts → C3 策略引擎

4. 修改 bash.ts            → execute() 顶部注入 C2 沙箱检查
5. 修改 runner.ts          → 删除 MUTATING_TOOL_NAMES，改用 C1 classifyMutation()
6. 修改 policy.ts          → applyToolPolicy() 内部委托 C3 resolvePolicyForTool()
7. 修改 index.ts           → 导出新模块
```

---

## 单元测试策略

**C1 测试（`src/__tests__/mutation.test.ts`）**
- 写工具分类
- bash 命令识别
- 指纹生成一致性

**C2 测试（`src/__tests__/bash-sandbox.test.ts`）**
- 边界检查
- 符号链接检测
- Unicode 注入防御

**C3 测试（`src/__tests__/policy-pipeline.test.ts`）**
- 多层合并逻辑
- 黑名单优先
- 缓存正确性

---

## 后续改进空间

- **高级路径验证**：支持 .gitignore 风格的路径表达式
- **代理写操作**：bash 通过 Python/Node 执行修改时的检测
- **审批工作流**：requiresApproval 的工具可触发人工审核
- **操作回溯**：操作指纹用于重复检测和回滚
