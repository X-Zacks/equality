# Delta Spec: Skills — 角色 Agent Skill 定义

> 修改 `openspec/specs/skills/spec.md`。新增多角色协作所需的 Skill 定义。

---

## ADDED Requirements

### Requirement: supervisor-workflow Skill

系统 SHALL 提供 `supervisor-workflow` Skill，指导 Supervisor Agent 的多角色协作编排。

Skill 文件位置：`packages/core/skills/supervisor-workflow/SKILL.md`

```yaml
---
name: supervisor-workflow
description: '多角色协作编排：需求澄清→Plan DAG生成→角色Agent分派→进度监控→汇总报告'
tools_required: ['subagent_spawn', 'subagent_list', 'subagent_steer', 'subagent_kill', 'read_file', 'write_file', 'memory_save', 'codebase_search']
---
```

Supervisor 工作流 MUST 包含以下阶段：

| 阶段 | 行为 | 输出 |
|------|------|------|
| 0. 需求澄清 | 与用户 2-3 轮对话确认需求 | 需求摘要 |
| 1. Plan 生成 | 生成 tasks.md（DAG 格式） | openspec/changes/xx/tasks.md |
| 2. 架构设计派发 | spawn Architect Agent | design.md |
| 3. 并行详细设计 | spawnParallel Developer + Tester | specs/*.md |
| 4. 分 Phase 编码 | spawn Developer → onComplete → spawn Tester | 代码 + 测试 |
| 5. 代码审查 | spawn Reviewer | reviews/*.md |
| 6. Parity Audit | 运行覆盖率检查 | audit-report.md |
| 7. 汇总报告 | 生成最终报告给用户 | summary.md |

#### Scenario: 完整工作流
- GIVEN 用户说 "帮我开发一个 XX 系统"
- WHEN Supervisor Agent 使用此 Skill
- THEN 按 8 个阶段顺序执行
- AND 每个阶段通过 subagent_spawn 委派给对应角色

#### Scenario: 需求澄清
- GIVEN 用户需求不明确
- WHEN Supervisor 进入阶段 0
- THEN Supervisor 向用户提出澄清问题
- AND 等待用户回复后再进入阶段 1

#### Scenario: 测试失败回退
- GIVEN Tester Agent 发现 bug
- WHEN Supervisor 收到测试失败通知
- THEN Supervisor steer Developer Agent 修复
- OR spawn 新的 Developer 子任务专门修复该 bug

---

### Requirement: testing-workflow Skill

系统 SHALL 提供 `testing-workflow` Skill，指导 Tester Agent。

Skill 文件位置：`packages/core/skills/testing-workflow/SKILL.md`

```yaml
---
name: testing-workflow
description: '测试工作流：分析Spec→编写测试→执行测试→报告结果'
tools_required: ['read_file', 'write_file', 'bash', 'codebase_search']
---
```

测试工作流 MUST 包含：
1. 读取 specs/*.md 理解需求
2. 为每个 Requirement 编写测试用例
3. 使用 bash 执行测试
4. 分析失败原因
5. 输出测试报告到 tasks.md（标记通过/失败）

#### Scenario: 正常测试流程
- GIVEN Spec 中有 5 个 Requirement
- WHEN Tester Agent 使用此 Skill
- THEN 为每个 Requirement 编写至少 1 个测试
- AND 执行所有测试
- AND 输出通过率报告

---

### Requirement: review-workflow Skill

系统 SHALL 提供 `review-workflow` Skill，指导 Reviewer Agent。

Skill 文件位置：`packages/core/skills/review-workflow/SKILL.md`

```yaml
---
name: review-workflow
description: '代码审查工作流：阅读Spec→对比代码→检查质量→输出审查报告'
tools_required: ['read_file', 'codebase_search', 'glob', 'list_dir']
---
```

审查工作流 MUST 检查：
- Spec 一致性：代码是否实现了所有 Requirement
- 代码质量：命名规范、重复代码、过长函数
- 安全性：输入验证、权限检查
- 测试覆盖：是否有对应测试

输出：`reviews/review-{timestamp}.md`

#### Scenario: 正常审查
- GIVEN 一个已实现的模块
- WHEN Reviewer Agent 使用此 Skill
- THEN 输出审查报告到 reviews/ 目录
- AND 报告包含：通过项、问题项、建议项

---

### Requirement: 角色 Agent 配置 [借鉴 claw-code ToolPool + ToolPermissionContext]

系统 SHALL 提供 `AgentRoleConfig` 类型和预置角色配置。

```typescript
interface AgentRoleConfig {
  role: AgentRole
  displayName: string
  identity: string                    // system prompt 核心身份
  model?: string                      // 覆盖默认模型
  toolProfile: 'coding' | 'minimal' | 'readonly'
  toolAllow?: string[]                // 白名单
  toolDeny?: string[]                 // 精确黑名单
  toolDenyPrefixes?: string[]         // [claw-code] 前缀黑名单
  skills?: string[]                   // 加载的 Skill
  maxToolLoops?: number               // 工具循环上限
  contextBudget?: number              // context token 预算
}
```

5 个预置角色 MUST 包含：

| 角色 | toolProfile | 特殊限制 | Skill |
|------|-------------|---------|-------|
| supervisor | minimal | 可用 subagent_*，禁用 bash/edit | supervisor-workflow |
| architect | coding | 禁用 bash，禁用 subagent_ 前缀 | openspec-skill |
| developer | coding | 禁用 subagent_ 前缀 | project-dev-workflow |
| tester | coding | 禁用 subagent_ 前缀 | testing-workflow |
| reviewer | coding | 禁用 write/edit/bash/apply，禁用 subagent_ 前缀 | review-workflow |

#### Scenario: 加载角色配置
- GIVEN role = 'developer'
- WHEN 加载角色配置
- THEN identity 包含 "开发 Agent"
- AND toolDenyPrefixes 包含 'subagent_'
- AND skills 包含 'project-dev-workflow'

#### Scenario: 自定义角色
- GIVEN 用户在 equality.config 中定义了自定义角色
- WHEN 加载角色配置
- THEN 自定义配置覆盖默认值

---

### Requirement: Execution Registry [借鉴 claw-code execution_registry.py + command_graph.py]

系统 SHALL 提供 `ExecutionRegistry` 类，统一注册工具、命令和 Skill。

借鉴 claw-code 的 `ExecutionRegistry`（统一命令+工具）和 `CommandGraph`（按来源分类）。

```typescript
interface ExecutionEntry {
  name: string
  kind: 'tool' | 'command' | 'skill'
  sourceHint: string               // 来源模块路径
  available: boolean               // 当前是否可用
}

class ExecutionRegistry {
  register(entry: ExecutionEntry): void
  get(name: string): ExecutionEntry | undefined
  getByKind(kind: ExecutionEntry['kind']): ExecutionEntry[]
  isAvailable(name: string): boolean
  getGraph(): {                    // [claw-code: CommandGraph]
    builtins: ExecutionEntry[]
    plugins: ExecutionEntry[]
    skills: ExecutionEntry[]
  }
  toMarkdown(): string
}
```

#### Scenario: 注册工具
- GIVEN 一个工具 { name: 'read_file', kind: 'tool', sourceHint: 'builtins' }
- WHEN `register()` 被调用
- THEN `get('read_file')` 返回该条目

#### Scenario: 按种类查询
- GIVEN 注册了 5 个 tool + 3 个 skill
- WHEN `getByKind('tool')` 被调用
- THEN 返回 5 个条目

#### Scenario: CommandGraph 分类 [claw-code]
- GIVEN 注册了内建工具、插件工具和 Skill
- WHEN `getGraph()` 被调用
- THEN builtins 包含内建工具
- AND plugins 包含插件工具
- AND skills 包含 Skill 条目

#### Scenario: 可用性检查
- GIVEN 一个条目 available=false
- WHEN `isAvailable(name)` 被调用
- THEN 返回 false

#### Scenario: Markdown 输出
- GIVEN 注册了若干条目
- WHEN `toMarkdown()` 被调用
- THEN 返回包含 `# Execution Registry` 标题
- AND 按种类分组列出所有条目
