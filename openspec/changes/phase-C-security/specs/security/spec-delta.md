# Delta Spec: Phase C — 安全性基础

> 目标规格文件: `openspec/specs/security/spec.md`
> 变更类型: ADDED

---

## ADDED Requirements

### Requirement: 写操作精确识别

系统 SHALL 精确分类工具调用是否修改系统状态，并为修改操作生成稳定的操作指纹。

#### Scenario: 识别只读工具

- GIVEN Agent 调用 `read_file(file='src/index.ts')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 返回 mutationType = READ
- AND 不生成审计日志

#### Scenario: 识别修改工具

- GIVEN Agent 调用 `write_file(file='test.txt', content='...')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 返回 mutationType = WRITE
- AND 生成操作指纹（hash）用于循环检测

#### Scenario: Bash 动态分类 — Unix 命令词

- GIVEN Agent 调用 `bash(command='ls -la')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 提取命令词 'ls'，匹配只读命令集
- AND 返回 mutationType = READ，confidence = heuristic

#### Scenario: Bash 动态分类 — 写命令词

- GIVEN Agent 调用 `bash(command='rm -rf ./build')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 提取命令词 'rm'，匹配写操作命令集
- AND 返回 mutationType = WRITE，confidence = heuristic

#### Scenario: Bash 动态分类 — PowerShell cmdlet

- GIVEN Windows 环境下 Agent 调用 `bash(command='Remove-Item ./temp -Recurse')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 识别 PowerShell cmdlet 'remove-item'（不区分大小写）
- AND 返回 mutationType = WRITE，confidence = heuristic

#### Scenario: Bash 动态分类 — 管道/复合命令

- GIVEN Agent 调用 `bash(command='cat file.txt | grep foo && rm temp.log')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 按 `&&`、`;`、`|` 分割子命令
- AND 提取所有命令词 ['cat', 'grep', 'rm']
- AND 取最危险的分类（rm → WRITE），返回 mutationType = WRITE

#### Scenario: Bash 动态分类 — 包管理器

- GIVEN Agent 调用 `bash(command='npm install lodash')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 识别 'npm' 为包管理器（修改 node_modules）
- AND 返回 mutationType = WRITE，confidence = heuristic

#### Scenario: Bash 动态分类 — 不确定命令

- GIVEN Agent 调用 `bash(command='python3 my_script.py')`
- WHEN 系统执行操作分类，无法确定脚本内容
- THEN 系统 SHALL 保守分类为 mutationType = EXEC（可能有副作用）
- AND confidence = heuristic

#### Scenario: Process 动态分类

- GIVEN Agent 调用 `process(action='list')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 识别 action='list' 在只读动作白名单中
- AND 返回 mutationType = READ

- GIVEN Agent 调用 `process(action='kill', id='abc')`
- WHEN 系统执行操作分类
- THEN 系统 SHALL 识别 action='kill' 不在只读白名单
- AND 返回 mutationType = WRITE

#### Scenario: 操作指纹一致性

- GIVEN 两个相同的 write_file 调用（相同 file/content）
- WHEN 分别生成操作指纹
- THEN 两个指纹的 hash 值应相同（去重、排序）
- AND 用于循环检测时，可正确识别重复操作

---

### Requirement: Bash 沙箱路径隔离

系统 SHALL 限制 bash 工具的文件访问范围不超出 workspaceDir，并防止符号链接等手段的越权访问。

#### Scenario: 允许工作区内路径

- GIVEN workspaceDir = `/home/user/myproject`
- WHEN Agent 调用 `bash(command='cat ./src/index.ts')`
- THEN 系统 SHALL 解析路径为 `/home/user/myproject/src/index.ts`
- AND 检查路径在 workspaceDir 内，返回 allowed = true

#### Scenario: 拦截工作区外路径

- GIVEN workspaceDir = `/home/user/myproject`
- WHEN Agent 调用 `bash(command='cat /etc/passwd')`
- THEN 系统 SHALL 检查路径 `/etc/passwd` 超出 workspaceDir
- AND 返回 allowed = false，reason = "路径 /etc/passwd 超出沙箱范围"
- AND 不执行命令

#### Scenario: 多层路径遍历

- GIVEN workspaceDir = `/home/user/myproject`
- WHEN Agent 调用 `bash(command='cat ../../etc/passwd')`
- THEN 系统 SHALL 使用 `path.resolve()` 将 `../../etc/passwd` 解析为 `/home/etc/passwd`
- AND 检查解析后的路径超出 workspaceDir
- AND 返回 allowed = false

#### Scenario: 符号链接逃逸防御

- GIVEN workspaceDir = `/home/user/myproject`
- AND 存在符号链接 `./link → /etc/passwd`
- WHEN Agent 调用 `bash(command='cat ./link')`
- THEN 系统 SHALL 执行 realpath 追踪链接真实指向
- AND 检查实际指向 `/etc/passwd` 超出范围
- AND 返回 allowed = false，reason = "符号链接指向范围外"

#### Scenario: Unicode 空格注入检测

- GIVEN Agent 调用 `bash(command="cat ./test\u00A0cd /etc/file")`
- WHEN 系统执行注入检测
- THEN 系统 SHALL 检测到 Unicode 不可见空格 U+00A0
- AND 立即返回 allowed = false，reason = "检测到 Unicode 不可见字符注入"
- AND 不进行后续路径解析

#### Scenario: 允许系统临时目录

- GIVEN sandboxConfig.allowSystemTemp = true
- WHEN Agent 调用 `bash(command='mkdir /tmp/test')`
- THEN 系统 SHALL 检查路径 `/tmp/test` 在系统临时目录白名单中
- AND 返回 allowed = true

#### Scenario: Windows 路径处理

- GIVEN Windows 环境 workspaceDir = `C:\Users\zz\projects\equality`
- WHEN Agent 调用 `bash(command='Get-Content C:\Users\zz\Documents\secret.txt')`
- THEN 系统 SHALL 标准化路径分隔符为 `/`，不区分大小写
- AND 检查 `c:/users/zz/documents/secret.txt` 不以 `c:/users/zz/projects/equality` 开头
- AND 返回 allowed = false

#### Scenario: 管道命令路径检查

- GIVEN workspaceDir = `/home/user/myproject`
- WHEN Agent 调用 `bash(command='cat ./src/index.ts | grep import && rm /etc/hosts')`
- THEN 系统 SHALL 按 `&&` 分割子命令
- AND 检测 `rm /etc/hosts` 中路径 `/etc/hosts` 超出范围
- AND 返回 allowed = false

---

### Requirement: 七层工具策略管道

系统 SHALL 支持多级权限策略，从 Profile 到 Agent 的细粒度工具授权管理。

#### Scenario: 全局策略生效

- GIVEN Profile.allowedTools = ['bash', 'read_file', 'lsp_hover']
- WHEN Agent 尝试调用 'grep' 工具
- THEN 系统 SHALL 检查 'grep' 不在 allowedTools 中
- AND 返回 allowed = false，隐藏该工具

#### Scenario: 黑名单优先

- GIVEN Profile.allowedTools = ['*']（全允许）
- AND Profile.deniedTools = ['write_file', 'apply_patch']
- WHEN Agent 尝试调用 'write_file'
- THEN 系统 SHALL 检查 deniedTools，返回 allowed = false
- AND 黑名单优先级高于白名单

#### Scenario: Agent 级覆盖

- GIVEN Profile.allowedTools = ['bash', 'read_file', ...]
- AND Agent.allowedTools = ['lsp_hover', 'grep']  （Agent 级限制更严格）
- WHEN Agent 尝试调用 'bash'
- THEN 系统 SHALL 使用 Agent 级策略，返回 allowed = false
- AND 最深层级覆盖浅层

#### Scenario: 高危工具标记

- GIVEN 工具 'write_file' 的 mutationType = WRITE
- AND Policy 配置 writeOperations.requiresApproval = true
- WHEN Agent 调用 'write_file'
- THEN 系统 SHALL 返回 { allowed: true, requiresApproval: true }
- AND 生成审计日志 "[AUDIT] write operation: write_file"

#### Scenario: Provider 级策略

- GIVEN Profile.allowedTools 中包含 'web_fetch'
- AND ProviderProfile (OpenAI).deniedTools = ['web_fetch']  （OpenAI provider 禁用）
- WHEN 使用 OpenAI Provider 的 Agent 尝试调用 'web_fetch'
- THEN 系统 SHALL 检查 Provider 级策略，返回 allowed = false
- AND 其他 Provider 仍允许 'web_fetch'

#### Scenario: 策略缓存一致性

- GIVEN 第一次查询 'write_file' 的策略返回 { allowed: true, requiresApproval: true }
- WHEN 第二次查询相同工具（未改变配置）
- THEN 系统 SHALL 返回相同结果
- AND 避免重复计算，使用缓存

---

### Requirement: 安全审计日志

系统 SHALL 记录所有写操作和权限决策，用于安全审计和事故追踪。

#### Scenario: 写操作审计

- GIVEN Agent 调用 `write_file(file='config.json', ...)`
- WHEN 系统执行操作
- THEN 系统 SHALL 记录日志：`[AUDIT] write operation: write_file | fingerprint: <hash> | target: config.json`
- AND 日志包含时间戳、Agent ID、操作内容摘要

#### Scenario: 权限拒绝审计

- GIVEN Agent 尝试调用被策略禁用的工具 'apply_patch'
- WHEN 系统检查策略
- THEN 系统 SHALL 记录日志：`[AUDIT] denied: apply_patch | reason: not in allowedTools | agent: <agentId>`
- AND 拒绝不导致服务中断（正常返回错误信息）

#### Scenario: 沙箱违规审计

- GIVEN Agent 尝试执行 `bash: cat /etc/passwd`
- WHEN 系统检查路径沙箱
- THEN 系统 SHALL 记录日志：`[AUDIT] sandbox violation: /etc/passwd | workspaceDir: /home/user/myproject | attempted command: cat /etc/passwd`
- AND 拒绝执行
