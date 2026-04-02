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

### 2.1 核心实现（`packages/core/src/tools/bash-sandbox.ts`）

- [ ] 2.1.1 定义 `SandboxConfig` 接口
- [ ] 2.1.2 定义 `SandboxResult` 接口（allowed/reason/paths）

- [ ] 2.1.3 实现 `detectInjection(command)` 函数
  - Unicode 不可见空格检测（U+00A0, U+2000-U+200B, U+3000, U+FEFF）
  - NULL 字节检测（\x00）
  - 原始回车注入（\r 不跟 \n）

- [ ] 2.1.4 实现路径提取逻辑
  - 按 `&&`, `;`, `|`, `\n` 分割子命令
  - 对每个子命令识别命令类型和路径参数位置
  - 提取 cd/cat/rm/mkdir/touch 等的路径参数

- [ ] 2.1.5 实现 `validatePath(inputPath, config)` 函数
  - `path.resolve(workspaceDir, inputPath)` → 绝对路径
  - 尝试 `fs.realpathSync()` → 追踪符号链接（路径不存在时用 resolve 结果）
  - 标准化路径分隔符（Windows: `\` → `/`）
  - 不区分大小写比较（Windows only）
  - 检查 `startsWith(normalizedWorkspace)`
  - 检查 allowedExternalPaths 白名单
  - 检查系统临时目录（如 allowSystemTemp=true）

- [ ] 2.1.6 实现 `validateBashCommand(command, config)` 主函数
  - 先调用 `detectInjection()` → 有注入直接返回 false
  - 提取所有路径参数
  - 对每个路径调用 `validatePath()`
  - 任一路径违规 → 返回 false + 原因

### 2.2 集成到 bash 工具

- [ ] 2.2.1 修改 `builtins/bash.ts`：在 execute() 函数 spawn 前注入沙箱检查
- [ ] 2.2.2 修改 `tools/index.ts`：导出 `validateBashCommand`, `SandboxConfig`

### 2.3 单元测试（`packages/core/src/__tests__/bash-sandbox.test.ts`）

- [ ] 2.3.1 T14 — 相对路径在范围内（./src → 允许）
- [ ] 2.3.2 T15 — 绝对路径超出范围（/etc/passwd → 拦截）
- [ ] 2.3.3 T16 — 多层路径遍历（../../etc → 解析后拦截）
- [ ] 2.3.4 T17 — 符号链接跳出（symlink → /etc/passwd → 拦截）
- [ ] 2.3.5 T18 — Unicode 空格注入（\u00A0 → 拦截）
- [ ] 2.3.6 T19 — 允许系统临时目录（/tmp/* → 允许，需 allowSystemTemp=true）
- [ ] 2.3.7 T20 — 管道命令路径检查（cat ./ok && rm /etc/hosts → 拦截）
- [ ] 2.3.8 T21 — Windows 路径格式（C:\Users\...\secret.txt → 拦截）
- [ ] 2.3.9 T22 — 无路径参数的命令（echo "hello" → 允许，不检查）

### 2.4 编译验证

- [ ] 2.4.1 `pnpm --filter @equality/core typecheck` 通过
- [ ] 2.4.2 所有 C2 测试通过

---

## 3. C3 多层工具策略管道

### 3.1 核心实现（`packages/core/src/tools/policy-pipeline.ts`）

- [ ] 3.1.1 定义 `PolicyLevel` 接口（allowedTools/deniedTools/toolOptions）
- [ ] 3.1.2 定义 `PolicyContext` 接口（profile/providerProfile/agentProfile）
- [ ] 3.1.3 定义 `PolicyDecision` 接口（allowed/requiresApproval/risk/decidedBy）

- [ ] 3.1.4 实现 `resolvePolicyForTool(toolName, ctx)` 函数
  - 遍历 profile → providerProfile → agentProfile
  - 黑名单优先：任一层 deniedTools 包含 → denied
  - 白名单最深层覆盖
  - 返回 PolicyDecision

- [ ] 3.1.5 与 C1 整合：自动标记高危操作
  - mutationType='write' 的工具 → risk='high'
  - 可配置 writeRequiresApproval（默认 false，用户可开启）

### 3.2 升级现有代码

- [ ] 3.2.1 修改 `policy.ts`：`applyToolPolicy()` 内部委托 `resolvePolicyForTool()`
- [ ] 3.2.2 保持 `ToolPolicy` 接口向后兼容（allow/deny/scope）
- [ ] 3.2.3 修改 `tools/index.ts`：导出 `PolicyPipeline`, `PolicyContext`, `PolicyDecision`

### 3.3 单元测试（`packages/core/src/__tests__/policy-pipeline.test.ts`）

- [ ] 3.3.1 T23 — 全局策略生效（profile.allowedTools 限制）
- [ ] 3.3.2 T24 — 黑名单优先（deniedTools > allowedTools）
- [ ] 3.3.3 T25 — Agent 级覆盖（agentProfile.denied > providerProfile.allowed）
- [ ] 3.3.4 T26 — Provider 级策略隔离（OpenAI 禁用，其他不受影响）
- [ ] 3.3.5 T27 — 高危工具标记（write 工具 → requiresApproval）
- [ ] 3.3.6 T28 — 无策略 → 全部放行（兼容性）
- [ ] 3.3.7 T29 — 缓存一致性（多次查询相同结果）

### 3.4 编译验证

- [ ] 3.4.1 `pnpm --filter @equality/core typecheck` 通过
- [ ] 3.4.2 所有 C3 测试通过

---

## 4. 完整集成验证

- [ ] 4.1 所有新增测试合计通过数
  - C1: 13 tests (T1-T13)
  - C2: 9 tests (T14-T22)
  - C3: 7 tests (T23-T29)
  - **合计: 29 tests** ✓

- [ ] 4.2 Phase A 回归：原有 18 个测试仍通过
- [ ] 4.3 Phase B 回归：原有 26 个 LSP 测试仍通过
- [ ] 4.4 全量编译 `pnpm --filter @equality/core typecheck` 通过
