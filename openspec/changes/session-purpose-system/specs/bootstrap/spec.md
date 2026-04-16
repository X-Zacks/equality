# Delta for Bootstrap

## REMOVED Requirements

### Requirement: SOUL.md Template
Agent 身份行为准则文件 `SOUL.md` 已废弃。其职责由会话级 Purpose 和 system prompt 内置行为准则替代。

### Requirement: IDENTITY.md Template
Agent 身份信息文件 `IDENTITY.md`（名字/性格/emoji）已废弃。Agent 固定身份为 Equality，个性化由 Purpose 承载。

### Requirement: USER.md Template
用户档案文件 `USER.md` 已废弃。用户偏好通过 memory 工具持久化，会话级需求通过 Purpose 承载。

### Requirement: BOOTSTRAP.md 引导三文件
BOOTSTRAP.md 引导脚本中要求 Agent 填写 IDENTITY.md / USER.md / SOUL.md 的指令已移除。

## MODIFIED Requirements

### Requirement: Bootstrap File List
系统 SHALL 支持以下工作区引导文件：
- `BOOTSTRAP.md` — 首次运行引导脚本（完成后自动删除）
- `AGENTS.md` — 项目级 Agent 行为指令
- `TOOLS.md` — 项目环境备注

（Previously: 6 files including IDENTITY.md, USER.md, SOUL.md）

#### Scenario: New workspace seeding
- GIVEN 一个全新工作区（无任何引导文件）
- WHEN ensureWorkspaceBootstrap() 被调用
- THEN 系统种下 BOOTSTRAP.md, AGENTS.md, TOOLS.md 三个模板
- AND 不再种下 IDENTITY.md, USER.md, SOUL.md

#### Scenario: Existing workspace seeding
- GIVEN 一个已有引导文件的工作区
- WHEN ensureWorkspaceBootstrap() 被调用
- THEN 跳过 BOOTSTRAP.md，只补种缺失的 AGENTS.md / TOOLS.md

### Requirement: BOOTSTRAP.md Template Content
BOOTSTRAP.md 引导脚本 SHALL 简化为：
1. 了解用户姓名和称呼
2. 用 memory_save 工具保存用户偏好
3. 简要介绍功能
4. 删除 BOOTSTRAP.md

（Previously: 要求填写 IDENTITY.md / USER.md / SOUL.md）

### Requirement: System Prompt Bootstrap Injection
formatBootstrapBlock() SHALL 只处理 BOOTSTRAP.md / AGENTS.md / TOOLS.md。

（Previously: 处理全部 6 个文件）

## ADDED Requirements

### Requirement: Session Purpose Field
Session 类型 SHALL 包含可选的 `purpose` 字段。

```typescript
interface SessionPurpose {
  /** 本次会话的主要目标（一句话） */
  goal: string
  /** 约束或偏好（如"简洁回复"、"用英文"） */
  constraints?: string[]
  /** 推断来源：'inferred' | 'manual' | 'bootstrap' */
  source: 'inferred' | 'manual' | 'bootstrap'
}
```

#### Scenario: Session created without purpose
- GIVEN 用户创建新会话
- WHEN 会话初始化
- THEN purpose 字段为 undefined

#### Scenario: Purpose inferred from first message
- GIVEN 用户发送首条消息 "帮我重构 auth 模块"
- WHEN Agent 处理消息时检测到 purpose 为空
- THEN 系统从消息内容推断 purpose.goal = "重构 auth 模块"
- AND purpose.source = 'inferred'

### Requirement: Purpose Injection into System Prompt
当会话有 purpose 时，system prompt SHALL 包含一个 `<session-purpose>` 块：

```
<session-purpose>
目标：重构 auth 模块
约束：简洁回复
</session-purpose>
```

#### Scenario: No purpose set
- GIVEN 会话 purpose 为 undefined
- WHEN 构建 system prompt
- THEN 不注入 session-purpose 块

#### Scenario: Purpose with constraints
- GIVEN purpose = { goal: "写单元测试", constraints: ["用 vitest", "中文注释"] }
- WHEN 构建 system prompt
- THEN 注入包含 goal 和所有 constraints 的 session-purpose 块

### Requirement: Purpose Inference Logic
系统 SHALL 提供 `inferPurpose(message: string)` 函数：
- 从用户消息中提取一句话目标
- 纯粹基于文本模式匹配（不调用 LLM）
- 覆盖常见模式：代码任务、问答、文件操作、闲聊等
- 无法推断时返回 undefined

#### Scenario: Code task message
- GIVEN message = "帮我修复 login 页面的 bug"
- WHEN inferPurpose(message) 被调用
- THEN 返回 { goal: "修复 login 页面的 bug", source: 'inferred' }

#### Scenario: Casual chat message
- GIVEN message = "你好"
- WHEN inferPurpose(message) 被调用
- THEN 返回 undefined（闲聊不设 purpose）

### Requirement: Built-in Behavior Principles
system prompt SHALL 内置基本行为准则（原 SOUL.md 核心内容），不再依赖外部文件：
- 直接有用，不做表演
- 有自己的观点
- 先自己想办法再提问
- 隐私保密
- 不确定时先问

#### Scenario: System prompt always contains principles
- GIVEN 任何会话（无论有无 bootstrap 文件）
- WHEN buildSystemPrompt() 被调用
- THEN 输出包含行为准则段落
