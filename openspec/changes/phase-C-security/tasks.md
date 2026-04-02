# Tasks: Phase C — 安全性基础

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)

---

## 1. C1 写操作精确识别

### 1.1 核心实现（`packages/core/src/tools/mutation.ts`）

- [ ] 1.1.1 定义 `MutationType` 枚举 (READ/WRITE/EXEC)
- [ ] 1.1.2 定义 `OperationFingerprint` 接口（toolName/action/targets/hash）
- [ ] 1.1.3 构建 `TOOL_MUTATION_POLICY` 分类表（工具 → 类型映射）
- [ ] 1.1.4 维护 `READ_ONLY_ACTIONS` 白名单（ls/cat/grep/list/get/read/show 等）
- [ ] 1.1.5 实现 `classifyOperation(tool, action)` 函数
  - 写工具 → WRITE
  - 读工具 → READ
  - 动态工具（bash/process/message）按 action 判断
  - 不确定时保守估计为 WRITE

- [ ] 1.1.6 实现 `extractOperationFingerprint(tool, params)` 函数
  - 从 params 中提取目标（file path / processId / messageId）
  - MD5 hash 目标列表（去重 + 排序，确保一致性）
  - 返回 { toolName, action, targets, hash }

### 1.2 单元测试（`packages/core/src/__tests__/mutation.test.ts`）

- [ ] 1.2.1 T1 — write_file → MutationType.WRITE
- [ ] 1.2.2 T2 — read_file → MutationType.READ
- [ ] 1.2.3 T3 — bash "ls" → MutationType.READ
- [ ] 1.2.4 T4 — bash "rm" → MutationType.WRITE
- [ ] 1.2.5 T5 — process "list" → MutationType.READ
- [ ] 1.2.6 T6 — process "kill" → MutationType.WRITE
- [ ] 1.2.7 T7 — 指纹生成一致性（同参数 → 同 hash）
- [ ] 1.2.8 T8 — 指纹生成稳定性（去重后 hash 相同）

### 1.3 编译验证

- [ ] 1.3.1 `npx tsc --noEmit` 通过，0 错误
- [ ] 1.3.2 `pnpm --filter @equality/core test mutation.test.ts` 8 个测试通过

---

## 2. C2 Bash 沙箱路径隔离

### 2.1 核心实现（`packages/core/src/tools/bash-sandbox.ts`）

- [ ] 2.1.1 定义 `SandboxConfig` 接口
  - workspaceDir: string
  - allowSystemTemp?: boolean
  - allowedExternalPaths?: string[]
  - denyPatterns?: RegExp[]

- [ ] 2.1.2 实现 `validateBashCommand(command, config)` 函数
  - 解析命令行，提取路径参数（cd/cat/rm/touch 等）
  - 对每个路径调用检查逻辑

- [ ] 2.1.3 实现 `validatePath(path, config)` 辅助函数
  - 使用 `path.resolve(config.workspaceDir, input)` 得绝对路径
  - 使用 `fs.realpathSync()` 追踪符号链接
  - 检查 `realpath.startsWith(config.workspaceDir)` 或在允许列表中
  - 检查 denyPatterns（拒绝模式）
  - 返回 { allowed: bool, reason?: string }

- [ ] 2.1.4 实现 `detectShellInjection(path)` 函数
  - 检测 Unicode 空格（`\u00A0`, `\u2000` 等）
  - 检测 NULL 字节（`%00`）
  - 检测命令分隔符逃逸（`; cd /etc` 等）
  - 返回 injection?: string

- [ ] 2.1.5 白名单临时目录
  - Windows: `%TEMP%`, `%TMP%`
  - Unix: `/tmp`, `/var/tmp`
  - 若 allowSystemTemp=true，允许访问这些目录

### 2.2 集成到 bash 工具（修改 `packages/core/src/tools/builtins/bash.ts`）

- [ ] 2.2.1 导入 `validateBashCommand` 和 `SandboxConfig`
- [ ] 2.2.2 在 bash 工具 execute 函数顶部添加沙箱检查
  ```typescript
  const { allowed, reason } = validateBashCommand(input.command, {
    workspaceDir: ctx.workspaceDir,
    allowSystemTemp: true,
  })
  if (!allowed) {
    return { content: `❌ 命令超出沙箱范围: ${reason}`, isError: true }
  }
  ```

### 2.3 单元测试（`packages/core/src/__tests__/bash-sandbox.test.ts`）

- [ ] 2.3.1 T9 — 相对路径在范围内（./src → 允许）
- [ ] 2.3.2 T10 — 绝对路径超出范围（/etc/passwd → 拦截）
- [ ] 2.3.3 T11 — 符号链接跳出（ln -s /etc/passwd ./link && cat ./link → 拦截）
- [ ] 2.3.4 T12 — Unicode 空格注入（`cat ./test\u00A0/file` → 拦截）
- [ ] 2.3.5 T13 — 允许系统临时目录（/tmp/* → 允许）
- [ ] 2.3.6 T14 — 命令分隔符逃逸（`ls; cd /etc` → 拦截）
- [ ] 2.3.7 T15 — 多层路径导航（../../etc → 解析后拦截）

### 2.4 编译验证

- [ ] 2.4.1 `npx tsc --noEmit` 通过，0 错误
- [ ] 2.4.2 `pnpm --filter @equality/core test bash-sandbox.test.ts` 7 个测试通过

---

## 3. C3 七层工具策略管道

### 3.1 核心实现（`packages/core/src/tools/policy-pipeline.ts`）

- [ ] 3.1.1 定义 `PolicyLevel` 接口（allowedTools/deniedTools/toolMeta）
- [ ] 3.1.2 定义 `PolicyContext` 接口（profile/providerProfile/agentProfile）
- [ ] 3.1.3 创建 `PolicyPipeline` 类

- [ ] 3.1.4 实现 `resolvePolicyForTool(toolName, ctx)` 方法
  - 遍历 profile → providerProfile → agentProfile
  - 黑名单优先：若任一层有 deniedTools 包含该工具 → denied
  - 最深层覆盖：agentProfile.allowed > providerProfile > profile.allowed
  - 返回 { allowed: bool, requiresApproval: bool, risk?: string }

- [ ] 3.1.5 实现 `setPolicy(level: string, policy: PolicyLevel)` 方法
  - 支持设置 'profile' / 'provider' / 'agent' 级策略
  - 验证工具名存在

- [ ] 3.1.6 与 C1 整合：自动标记高危操作
  - mutationType='write' 的工具 → requiresApproval=true（可配置）
  - 将 C1 的 mutation type 映射到 policy.risk 字段

### 3.2 单元测试（`packages/core/src/__tests__/policy-pipeline.test.ts`）

- [ ] 3.2.1 T16 — 全局策略生效（profile.allowedTools 中的工具返回 allowed=true）
- [ ] 3.2.2 T17 — 黑名单优先（profile.deniedTools 覆盖 allowedTools）
- [ ] 3.2.3 T18 — Agent 级覆盖（agentProfile.denied > providerProfile.allowed）
- [ ] 3.2.4 T19 — 高危工具标记（mutationType='write' → requiresApproval=true）
- [ ] 3.2.5 T20 — 多层合并（profile + provider + agent 按正确顺序合并）
- [ ] 3.2.6 T21 — 缓存一致性（多次查询相同工具返回相同结果）
- [ ] 3.2.7 T22 — 不在任何允许列表中的工具隐藏（allowed=false）

### 3.3 集成到 Runner（修改 `packages/core/src/agent/runner.ts`）

- [ ] 3.3.1 导入 `PolicyPipeline` 和 `classifyOperation`
- [ ] 3.3.2 在 toolLoop 中添加策略检查（在工具执行前）
  ```typescript
  const policy = policyPipeline.resolvePolicyForTool(toolName, context)
  if (!policy.allowed) {
    return { content: '❌ 工具被策略禁用', isError: true }
  }
  ```

- [ ] 3.3.3 添加审计日志（高危工具执行时记录）
  ```typescript
  if (policy.requiresApproval) {
    logger.info(`[AUDIT] write operation: ${toolName}`)
  }
  ```

### 3.4 编译验证

- [ ] 3.4.1 `npx tsc --noEmit` 通过，0 错误
- [ ] 3.4.2 `pnpm --filter @equality/core test policy-pipeline.test.ts` 7 个测试通过

---

## 4. 完整集成测试

- [ ] 4.1 E2E 场景：bash 命令同时触发沙箱 + 策略 + mutation 检查
  - 场景：Agent 尝试执行 `bash: rm /etc/important`
  - 验证：C3 策略检查 → C2 沙箱拦截 → C1 标记 write → 审计日志

- [ ] 4.2 编译完整性检查
  - `npx tsc --noEmit` 整个 @equality/core

- [ ] 4.3 所有新增测试合计通过数
  - C1: 8 tests
  - C2: 7 tests
  - C3: 7 tests
  - **合计: 22 tests** ✓

---

## 5. 后续任务（待 Phase C 完成后）

- [ ] 5.1 添加配置 UI（在 equality-config.json 中定义策略）
- [ ] 5.2 支持导入 YAML 策略文件
- [ ] 5.3 添加审批工作流（requiresApproval=true 的工具可触发人工审核）
- [ ] 5.4 操作回溯（使用 C1 指纹进行循环检测增强）
