# Tasks: Phase C — 安全性基础

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)
>
> 现有代码基线:
> - `runner.ts`: `MUTATING_TOOL_NAMES` (6 个静态工具名) → C1 替代
> - `policy.ts`: `applyToolPolicy()` (~45 行, 全局级别) → C3 升级
> - `types.ts`: `ToolPolicy` 接口 (含 `scope` 预留字段) → C3 激活
> - `bash.ts`: 无沙箱检查 → C2 注入

---

## 1. C1 写操作精确识别

### 1.1 核心实现（`packages/core/src/tools/mutation.ts`）

- [ ] 1.1.1 定义 `MutationType` 枚举 (READ/WRITE/EXEC)
- [ ] 1.1.2 定义 `MutationClassification` 接口（type/confidence/reason）
- [ ] 1.1.3 定义 `OperationFingerprint` 接口（toolName/action/targets/hash）
- [ ] 1.1.4 构建 `TOOL_MUTATION_MAP` 完整分类表（覆盖全部 19+ 个注册工具）
  - 静态工具：read_file → READ, write_file → WRITE, edit_file → WRITE, ...
  - 动态工具：bash/process/cron → 'dynamic'

- [ ] 1.1.5 实现 bash 命令词提取逻辑
  - 按 `&&`, `;`, `|`, `\n` 分割子命令
  - 对每个子命令取第一个非 flag 的 token 作为命令词
  - 查命令词分类表（Unix + PowerShell 双模式）
  - 取所有子命令中最危险的分类

- [ ] 1.1.6 维护命令词分类集合
  - `WRITE_COMMANDS_UNIX`: rm/mv/cp/touch/mkdir/chmod/sed/npm/pnpm/yarn/pip/cargo/git...
  - `WRITE_COMMANDS_POWERSHELL`: remove-item/move-item/copy-item/set-content/new-item...
  - `READ_COMMANDS_UNIX`: ls/cat/head/tail/wc/grep/find/which/env/echo/pwd...
  - `READ_COMMANDS_POWERSHELL`: get-childitem/get-content/get-item/test-path...

- [ ] 1.1.7 实现 `classifyMutation(toolName, params)` 函数
  - 静态工具 → 直接查表
  - 动态工具 → 解析 action/command 参数
  - 不确定时保守估计为 EXEC
  - 返回 { type, confidence, reason }

- [ ] 1.1.8 实现 `extractFingerprint(toolName, params)` 函数
  - 从 params 中提取目标（file path / processId / command）
  - SHA-256 hash 目标列表（去重 + 排序，与 loop-detector 一致）
  - 返回 { toolName, action, targets, hash }

### 1.2 迁移现有代码

- [ ] 1.2.1 修改 `runner.ts`：删除 `MUTATING_TOOL_NAMES` 集合
- [ ] 1.2.2 修改 `runner.ts`：`guardUnsupportedSuccessClaims()` 中使用 `classifyMutation()` 替代 `MUTATING_TOOL_NAMES.has()`
- [ ] 1.2.3 修改 `tools/index.ts`：导出 `classifyMutation`, `extractFingerprint`, `MutationType`

### 1.3 单元测试（`packages/core/src/__tests__/mutation.test.ts`）

- [ ] 1.3.1 T1 — write_file → MutationType.WRITE, confidence=static
- [ ] 1.3.2 T2 — read_file → MutationType.READ, confidence=static
- [ ] 1.3.3 T3 — bash "ls -la" → MutationType.READ, confidence=heuristic
- [ ] 1.3.4 T4 — bash "rm -rf ./build" → MutationType.WRITE
- [ ] 1.3.5 T5 — bash "cat file | grep foo && rm temp" → MutationType.WRITE（复合命令取最危险）
- [ ] 1.3.6 T6 — bash "npm install lodash" → MutationType.WRITE（包管理器）
- [ ] 1.3.7 T7 — bash "python3 script.py" → MutationType.EXEC（不确定，保守）
- [ ] 1.3.8 T8 — bash "Remove-Item ./temp" → MutationType.WRITE（PowerShell cmdlet）
- [ ] 1.3.9 T9 — process "list" → MutationType.READ
- [ ] 1.3.10 T10 — process "kill" → MutationType.WRITE
- [ ] 1.3.11 T11 — 指纹一致性（同参数 → 同 hash）
- [ ] 1.3.12 T12 — 指纹稳定性（参数顺序不影响 hash）
- [ ] 1.3.13 T13 — 未知工具名 → MutationType.EXEC（保守）

### 1.4 编译验证

- [ ] 1.4.1 `pnpm --filter @equality/core typecheck` 通过
- [ ] 1.4.2 所有 C1 测试通过

---

## 2. C2 Bash 沙箱路径隔离

> workspaceDir 来源：ToolContext.workspaceDir ← index.ts getWorkspaceDir() ← WORKSPACE_DIR 配置
> 注入点：bash.ts execute() 中，spawn() 之前
> 范围：仅 bash 工具，其他写工具（edit_file/write_file）后续改进

### 2.1 核心实现（`packages/core/src/tools/bash-sandbox.ts`）

- [ ] 2.1.1 定义 `SandboxConfig` 接口（workspaceDir + allowSystemTemp + allowedExternalPaths）
- [ ] 2.1.2 定义 `SandboxResult` 接口（allowed/reason/paths）
- [ ] 2.1.3 实现 `normalizePath(p)` 函数
  - `\` → `/` 统一
  - Windows 下 `.toLowerCase()`
  - 用于所有路径比较的基础

- [ ] 2.1.4 实现 `detectInjection(command)` 函数
  - Unicode 不可见空格检测（U+00A0, U+2000-U+200B, U+3000, U+FEFF）
  - NULL 字节检测（\x00）
  - 原始回车注入（\r 不跟 \n）

- [ ] 2.1.5 实现 `extractPathArgs(command)` 路径提取
  - 按 `&&`, `||`, `;`, `|`, `\n` 分割子命令
  - 对每个子命令取命令词，查 PATH_COMMANDS 表确定哪些位置是路径参数
  - 提取 cat/rm/mkdir/touch/cd/cp/mv 等的路径参数
  - 未知命令 → 不提取（不拦截，交给 C1 分类）

- [ ] 2.1.6 实现 `validatePath(inputPath, config)` 函数
  - `path.resolve(config.workspaceDir, inputPath)` → 绝对路径
  - 尝试 `fs.realpathSync()` → 追踪符号链接（不存在时用 resolve 结果）
  - `normalizePath()` 后检查 `startsWith(normalizedWorkspace + '/')`
  - 检查 `allowSystemTemp`（对照 `os.tmpdir()`）
  - 检查 `allowedExternalPaths` 白名单

- [ ] 2.1.7 实现 `validateBashCommand(command, config)` 主函数
  - Step 1: `detectInjection()` → 有注入直接返回 false
  - Step 2: `extractPathArgs()` → 提取路径列表
  - Step 3: 对每个路径 `validatePath()` → 任一违规返回 false + reason
  - 无路径参数 → 返回 allowed=true

### 2.2 集成到 bash 工具

- [ ] 2.2.1 修改 `builtins/bash.ts`：在 execute() 的 `spawn()` 前注入沙箱检查
  - 前台模式 + 后台模式都要检查
  - config: `{ workspaceDir: ctx.workspaceDir, allowSystemTemp: true }`
- [ ] 2.2.2 修改 `tools/index.ts`：导出 `validateBashCommand`, `SandboxConfig`, `SandboxResult`

### 2.3 单元测试（`packages/core/src/__tests__/bash-sandbox.test.ts`）

- [ ] 2.3.1 T14 — 相对路径在范围内（`cat .\src\index.ts` → 允许）
- [ ] 2.3.2 T15 — 绝对路径超出范围（`cat C:\Users\secret.txt`，workspaceDir=`C:\proj` → 拦截）
- [ ] 2.3.3 T16 — 多层路径遍历（`cat ..\..\Windows\system32\hosts` → 解析后拦截）
- [ ] 2.3.4 T17 — 符号链接跳出（mock realpathSync 返回范围外路径 → 拦截）
- [ ] 2.3.5 T18 — Unicode 空格注入（`\u00A0` → 拦截，Step 1 直接返回）
- [ ] 2.3.6 T19 — 允许系统临时目录（os.tmpdir() 下路径 → 允许）
- [ ] 2.3.7 T20 — 管道命令路径检查（`cat ./ok && rm C:\Windows\hosts` → 拦截）
- [ ] 2.3.8 T21 — Windows 大小写不敏感（`c:\proj` vs `C:\Proj` → 允许）
- [ ] 2.3.9 T22 — 无路径参数的命令（`echo hello` → 允许）
- [ ] 2.3.10 T23 — 跨驱动器拦截（workspaceDir=`C:\proj`，路径=`D:\secret` → 拦截）
- [ ] 2.3.11 T24 — NULL 字节注入（`\x00` → 拦截）

### 2.4 编译验证

- [ ] 2.4.1 `pnpm --filter @equality/core typecheck` 通过
- [ ] 2.4.2 所有 C2 测试通过

---

## 3. C3 多层工具策略管道

> 影响范围：
> - `policy-pipeline.ts` — 新增纯函数模块
> - `policy.ts` — 内部委托升级（签名不变）
> - `tools/index.ts` — 新增导出
> - **不改动 runner.ts** — 零运行时风险
> - **不改动 index.ts** — 零集成风险
> - **不改动 types.ts** — ToolPolicy 接口保留
>
> 关键发现：`applyToolPolicy()` 已导出但目前未被调用（Phase 2 预留），C3 是纯新增功能

### 3.1 核心实现（`packages/core/src/tools/policy-pipeline.ts`）

- [ ] 3.1.1 定义 `PolicyLevel` 接口（allowedTools/deniedTools/toolOptions）
- [ ] 3.1.2 定义 `PolicyContext` 接口（profile/providerProfile/agentProfile）
- [ ] 3.1.3 定义 `PolicyDecision` 接口（allowed/requiresApproval/risk/decidedBy）

- [ ] 3.1.4 实现 `resolvePolicyForTool(toolName, ctx)` 函数
  - 遍历 profile → providerProfile → agentProfile
  - 黑名单优先：任一层 deniedTools 包含 → denied（不可被更深层覆盖）
  - 白名单：allowedTools 非空且不包含 → denied
  - toolOptions 合并：更深层覆盖浅层的 requiresApproval/risk
  - 返回 PolicyDecision

- [ ] 3.1.5 与 C1 整合：写操作自动标记高危
  - 调用 classifyMutation(toolName) 
  - mutationType = WRITE → risk 自动提升为 'high'
  - 可通过 toolOptions 覆盖

### 3.2 升级现有代码

- [ ] 3.2.1 修改 `policy.ts`：`applyToolPolicy()` 内部委托 `resolvePolicyForTool()`
  - 将旧 ToolPolicy.allow → ctx.profile.allowedTools
  - 将旧 ToolPolicy.deny → ctx.profile.deniedTools
  - 签名和返回类型不变（向后兼容）
- [ ] 3.2.2 保持 `ToolPolicy` 接口不变（types.ts 不改动）
- [ ] 3.2.3 修改 `tools/index.ts`：导出 `resolvePolicyForTool`, `PolicyContext`, `PolicyDecision`, `PolicyLevel`

### 3.3 单元测试（`packages/core/src/__tests__/policy-pipeline.test.ts`）

- [ ] 3.3.1 T25 — 全局策略生效（profile.allowedTools 限制 → allowed=false）
- [ ] 3.3.2 T26 — 黑名单优先（deniedTools 优先于 allowedTools）
- [ ] 3.3.3 T27 — Agent 级覆盖（agentProfile.denied > providerProfile.allowed）
- [ ] 3.3.4 T28 — Provider 级策略隔离（OpenAI deny, 其他不受影响）
- [ ] 3.3.5 T29 — 高危工具标记（write 工具 + toolOptions → requiresApproval）
- [ ] 3.3.6 T30 — 无策略 → 全部放行（空 ctx → allowed=true，向后兼容）
- [ ] 3.3.7 T31 — 旧 ToolPolicy 向后兼容（applyToolPolicy 保持原有行为）

### 3.4 编译验证

- [ ] 3.4.1 `pnpm --filter @equality/core typecheck` 通过
- [ ] 3.4.2 所有 C3 测试通过

---

## 4. 完整集成验证

- [ ] 4.1 所有新增测试合计通过数
  - C1: 13 tests (T1-T13)
  - C2: 11 tests (T14-T24)
  - C3: 7 tests (T25-T31)
  - **合计: 31 tests** ✓

- [ ] 4.2 Phase A 回归：原有 18 个测试仍通过
- [ ] 4.3 Phase B 回归：原有 26 个 LSP 测试仍通过
- [ ] 4.4 全量编译 `pnpm --filter @equality/core typecheck` 通过
