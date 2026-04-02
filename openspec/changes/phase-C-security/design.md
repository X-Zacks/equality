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

**核心数据结构：**

```typescript
enum MutationType {
  READ = 'read',
  WRITE = 'write',
  EXEC = 'exec',
}

interface OperationFingerprint {
  toolName: string
  action: string
  targets: string[]  // 受影响的路径/ID
  hash: string       // MD5(targets)，用于循环检测
}

// 工具分类表
const TOOL_MUTATION_POLICY = {
  write_file: MutationType.WRITE,
  edit_file: MutationType.WRITE,
  read_file: MutationType.READ,
  bash: 'dynamic',        // 按 action 判断
  process: 'dynamic',     // kill → WRITE, list → READ
  message: 'dynamic',     // send → WRITE, read → READ
  lsp_hover: MutationType.READ,
  lsp_diagnostics: MutationType.READ,
  // ... 其他工具
}

const READ_ONLY_ACTIONS = [
  'list', 'get', 'read', 'show', 'info', 'status',
  'ls', 'cat', 'grep', 'find', // bash 只读
]
```

**接口：**

```typescript
export function classifyOperation(tool: ToolDefinition, action: string): MutationType
export function extractOperationFingerprint(tool: ToolDefinition, params: Record<string, unknown>): OperationFingerprint
```

---

## C2. Bash 沙箱路径隔离

### 文件：`tools/bash-sandbox.ts`

**核心验证流程：**

```typescript
interface SandboxConfig {
  workspaceDir: string
  allowSystemTemp?: boolean  // 允许 /tmp, %TEMP% 等
  allowedExternalPaths?: string[]  // 白名单路径
  denyPatterns?: RegExp[]    // 黑名单正则（如 /etc, /root）
}

export function validateBashCommand(
  command: string,
  config: SandboxConfig,
): { allowed: boolean; reason?: string }
```

**检查项：**
1. 解析 cd/cat/rm 等命令中的路径参数
2. 使用 `path.resolve()` 得到绝对路径
3. 使用 `fs.realpathSync()` 追踪符号链接
4. 检查 `realpath.startsWith(config.workspaceDir)`
5. 检查 Unicode 空格、`%00` 等注入

**与 C1 的关系：**
- bash 工具的 mutation type 在调用前由 C2 确定
- 若路径越权，`validateBashCommand()` 返回 false，拦截执行

---

## C3. 七层工具策略管道

### 文件：`tools/policy-pipeline.ts`

**层级结构：**

```typescript
interface PolicyLevel {
  allowedTools?: string[]
  deniedTools?: string[]
  toolMeta?: Record<string, { requiresApproval?: boolean; risk?: string }>
}

interface PolicyContext {
  profile: PolicyLevel       // 全局 Profile
  providerProfile: PolicyLevel  // Provider 特定
  agentProfile: PolicyLevel   // Agent 特定
}

export function resolvePolicyForTool(
  toolName: string,
  ctx: PolicyContext,
): { allowed: boolean; requiresApproval: boolean; risk: string }
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
// packages/core/src/agent/runner.ts 中

async function executeTool(tool: ToolDefinition, params: Record<string, unknown>) {
  // Step 1: 检查策略（C3）
  const policy = await policyPipeline.resolveForTool(tool.name, context)
  if (!policy.allowed) {
    return { content: '❌ 工具被策略禁用', isError: true }
  }

  // Step 2: bash 特殊处理（C2）
  if (tool.name === 'bash') {
    const { allowed, reason } = validateBashCommand(params.command, sandboxConfig)
    if (!allowed) {
      return { content: `❌ 命令超出沙箱范围: ${reason}`, isError: true }
    }
  }

  // Step 3: 识别写操作（C1）
  const mutation = classifyOperation(tool, params.action)
  if (mutation === 'write' && policy.requiresApproval) {
    // 审计日志
    console.log(`[WRITE-OP-AUDIT] tool=${tool.name}, action=${params.action}`)
  }

  // Step 4: 执行
  return await tool.execute(params, ctx)
}
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
