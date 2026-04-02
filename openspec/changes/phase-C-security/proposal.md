# Proposal: Phase C — 安全性基础（GAP-5, GAP-10, GAP-13）

> 作为 Equality 编程助手，保护用户系统免受 Agent 不当操作，同时提供精细化的权限控制。

---

## 一、为什么做

**现状问题：**
- bash 工具可访问工作区之外的任意目录（`cd /etc` → 修改系统文件）
- 写操作检测仅为硬编码集合：`runner.ts` 中的 `MUTATING_TOOL_NAMES`（6 个工具名），无法检测 bash 内的 `rm`/`mv` 等实际修改操作
- 权限管理仅全局白名单/黑名单：`policy.ts` 的 `applyToolPolicy()` 约 45 行，无 Agent/Provider 级别差异化
- `ToolPolicy` 接口已预留 `scope` 字段但未使用

**目标收益：**
- ✅ 路径隔离：Agent 被限制在工作区内，符号链接不越权
- ✅ 操作分类：精确识别读 vs 写，支持不同的审批策略
- ✅ 权限管理：Agent/Provider/Profile 级别的工具策略，高危工具可分级授权

---

## 二、做什么

**三个互依赖的功能模块：**

### C1. 写操作精确识别（GAP-13, P2）

**目标：** 精确判断工具调用是否修改系统状态

```
tool: bash, action: "npm install"
  ↓ 识别
mutating = true  ← 修改 node_modules

tool: bash, action: "ls -la"
  ↓ 识别
mutating = false ← 只读操作

tool: process, action: "kill"
  ↓ 识别
mutating = true  ← 修改进程状态
```

**实施范围：**
- 工具分类：write/edit/exec 总是 mutating；process/message/bash 按 action 判断
- 操作指纹：提取 path/processId/messageId 等稳定标识，用于重复检测
- 代码位置：`packages/core/src/tools/mutation.ts` (~150 行)
- **迁移**：替代 `runner.ts` 中硬编码的 `MUTATING_TOOL_NAMES` 集合（6 个静态工具名 → 动态分类）
- **Windows 适配**：bash 工具在 Windows 下实际执行 PowerShell，需同时识别 PowerShell cmdlet（`Remove-Item`, `Set-Content`）和 Unix 命令词（`rm`, `cat`）

### C2. Bash 沙箱路径隔离（GAP-5, P1）

**目标：** 限制 bash 执行只能访问 workspaceDir 内的文件

```
workspaceDir: /home/user/myproject
  ↓ bash: "cd /etc && cat passwd"
❌ 拦截：路径 /etc/passwd 超出边界

  ↓ bash: "rm -rf ./src"
✅ 允许：./src 相对工作区解析后在边界内
```

**实施范围：**
- 路径检查：执行前解析所有 cd/cat/rm 等命令中的路径
- 符号链接防御：realpath 检查是否跳出边界
- Unicode 空格检测：防止 `\u00A0 cd /etc` 等注入
- 白名单临时目录：`/tmp` 等系统临时目录允许访问
- **Windows 适配**：`bash.ts` 在 Windows 下 spawn PowerShell（`-NoProfile -NonInteractive -Command`），路径格式为反斜杠 + 盘符（`C:\Users\...`），需同时处理 `/` 和 `\` 两种分隔符
- **限制说明**：沙箱仅检测命令字符串中的显式路径；通过 `node -e "fs.readFileSync('/etc/passwd')"` 等间接访问暂不检测（见后续改进）
- 代码位置：`packages/core/src/tools/bash-sandbox.ts` (~250 行)

### C3. 七层工具策略管道（GAP-10, P2）

**目标：** 多级权限过滤，支持 Agent/Provider/Profile 级别的工具授权

```
Profile (全局基础)
  ├─ allowedTools: ['bash', 'read_file', ...]
  └─ deniedTools: ['write_file']
     ↓
ProviderProfile (Provider 级覆盖)
  ├─ (only for this provider)
  └─ extraAllowed: ['web_fetch']
     ↓
Agent (Agent 级细粒度)
  ├─ name: "code-review-bot"
  ├─ allowedTools: ['lsp_hover', 'grep', 'read_image']
  └─ deniedTools: ['bash']
     ↓
Tool (最终)
  ├─ isAllowed = true/false
  ├─ requiresApproval = true/false (高危工具)
  └─ metadata { risk: 'high', category: 'write' }
```

**实施范围：**
- 策略引擎：`packages/core/src/tools/policy-pipeline.ts` (~300 行)
- **升级路径**：从现有 `policy.ts` 的 `applyToolPolicy()` 升级为多层管道
  - 保留现有 `ToolPolicy` 接口（`allow/deny/scope`），扩展 `scope` 字段生效
  - `policy.ts` 保留为兼容层，内部委托 `policy-pipeline.ts`
- 与 C1 整合：写操作工具可标记为 `requiresApproval`
- 与 C2 整合：bash 调用前检查路径沙箱策略
- 代码位置：同上

---

## 三、怎么实施

### 分阶段实施（建议）

| 阶段 | 内容 | 依赖 | 时间 |
|------|------|------|------|
| **C1** | 写操作识别 + 单元测试 | 无 | 1 天 |
| **C2** | bash 路径沙箱 + 集成 C1 | C1 | 1.5 天 |
| **C3** | 策略管道 + 集成 C1/C2 | C1, C2 | 2 天 |

### 技术选型

**C1 — 操作指纹生成**
- 使用正则快速判断：write_file/apply_patch/bash 等
- 对 bash/process 等按 action 字符串分类
- MD5 哈希操作参数作指纹（去时间戳）

**C2 — 路径验证**
- `path.resolve(workspaceDir, userInput)` → 绝对路径
- `fs.realpathSync(resolved)` → 检测符号链接真实指向
- 检查 `realpath.startsWith(workspaceDir)` → 越权判断
- 黑名单：`/etc`, `/root`, `/sys` 等系统关键目录

**C3 — 策略层级**
- 配置对象嵌套结构，从上向下合并
- 黑名单优先原则：denied > allowed
- 缓存策略决策，避免重复计算

---

## 四、验收标准

### C1 单元测试
- [ ] 检测 write_file → mutating=true
- [ ] 检测 bash "ls" → mutating=false
- [ ] 检测 bash "rm" → mutating=true
- [ ] 检测 process "list" → mutating=false
- [ ] 检测 process "kill" → mutating=true

### C2 集成测试
- [ ] bash "cat ./src/index.ts" → 允许
- [ ] bash "cat /etc/passwd" → 拦截
- [ ] bash "ln -s /etc/passwd ./link && cat ./link" → 拦截（符号链接）
- [ ] bash "cat ./test\\u00A0/file" → 拦截（Unicode 空格）

### C3 功能测试
- [ ] 全局允许列表生效
- [ ] Agent 级策略覆盖全局
- [ ] 高危工具标记为 requiresApproval
- [ ] 工具不在任何允许列表中时隐藏

---

## 五、后续阶段

- **Phase D**：MCP 客户端、Compaction 分段、可插拔引擎
- **Phase E**：子 Agent 系统、后台任务管理
- **Phase F**：交互式 UI、Prompt 测试

---

## 六、风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| 路径沙箱过严 | Agent 无法访问必要资源 | 提供白名单配置（如允许 /tmp） |
| 符号链接检测误杀 | 正常的链接使用被拦截 | 支持配置允许的链接前缀 |
| 策略配置复杂 | 管理负担重 | 提供预设模板（default/strict/permissive） |
