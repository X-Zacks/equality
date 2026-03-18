# OpenSpec 研究笔记

> 来源：https://github.com/Fission-AI/OpenSpec  
> 整理日期：2026-03-11

---

## 一、OpenSpec 是什么？

**OpenSpec** 是一个面向 AI 编程助手的**规格驱动开发（Spec-Driven Development, SDD）框架**。

核心思想：**在写任何代码之前，先让人类和 AI 就"要做什么"达成一致**。

它解决的问题：AI 编程助手非常强大，但当需求只活在聊天历史里时，结果往往不可预测。OpenSpec 在你和 AI 之间加了一层轻量规格层，让每次改动都有据可查、有章可循。

---

## 二、核心设计哲学

```
→ fluid not rigid        流动，而非刚性（无强制阶段门）
→ iterative not waterfall 迭代，而非瀑布式
→ easy not complex       简单，而非繁琐
→ built for brownfield   为存量系统而生，不只是全新项目
→ scalable               从个人项目到企业级都适用
```

---

## 三、整体架构

OpenSpec 将工程文档组织为两个主要区域：

```
openspec/
├── specs/          ← 当前系统行为的"事实来源"
│   ├── auth/
│   │   └── spec.md
│   └── payments/
│       └── spec.md
└── changes/        ← 进行中的变更提案（每个变更一个文件夹）
    ├── add-dark-mode/
    │   ├── proposal.md
    │   ├── design.md
    │   ├── tasks.md
    │   └── specs/       ← Delta Specs（差量规格）
    └── archive/         ← 已完成变更的归档
```

**关键分离原则**：
- `specs/` = 系统当前行为的权威文档
- `changes/` = 提议中的修改（合并前不影响 specs/）

---

## 四、核心概念

### 4.1 Specs（规格）

规格是对系统行为的描述，使用**需求 + 场景**的结构化格式：

```markdown
# Auth Specification

## Requirements

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

#### Scenario: Valid credentials
- GIVEN a user with valid credentials
- WHEN the user submits login form
- THEN a JWT token is returned
```

**关键点：**
- 规格描述"是什么行为"，不是"怎么实现"
- 使用 RFC 2119 关键词：`MUST/SHALL`（强制）、`SHOULD`（建议）、`MAY`（可选）
- 场景使用 Given/When/Then 格式，可直接转化为自动化测试

### 4.2 Changes（变更）

每个功能变更是一个独立文件夹，包含四类制品（Artifacts）：

```
openspec/changes/add-dark-mode/
├── proposal.md     ← 为什么做、做什么
├── design.md       ← 技术方案、架构决策
├── tasks.md        ← 实施清单（checkbox）
└── specs/          ← Delta Specs（差量规格）
    └── ui/
        └── spec.md ← 只描述变化的部分
```

多个变更可以**并行存在**，不互相冲突。

### 4.3 Artifacts（制品）流转

制品之间有依赖关系，形成流水线：

```
proposal ──► specs ──► design ──► tasks ──► 实施
  (为什么)   (是什么)   (怎么做)   (步骤)
```

| 制品 | 文件 | 内容 |
|------|------|------|
| 提案 | `proposal.md` | 意图、范围、高层方案 |
| 规格 | `specs/**/*.md` | 行为需求和场景（Delta格式） |
| 设计 | `design.md` | 技术方案、架构决策、数据流 |
| 任务 | `tasks.md` | 带 checkbox 的实施清单 |

**依赖关系图：**

```
           proposal（根节点）
               │
    ┌──────────┴──────────┐
    ▼                     ▼
  specs               design
    │                     │
    └──────────┬──────────┘
               ▼
             tasks
```

### 4.4 Delta Specs（差量规格）

差量规格是 OpenSpec 的核心创新，只描述"变了什么"，而非重写整个规格：

```markdown
# Delta for Auth

## ADDED Requirements
### Requirement: Two-Factor Authentication
...

## MODIFIED Requirements
### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes.
(Previously: 30 minutes)

## REMOVED Requirements
### Requirement: Remember Me
(Deprecated in favor of 2FA.)
```

**三个 Section：**

| Section | 含义 | 归档时动作 |
|---------|------|----------|
| `## ADDED Requirements` | 新增行为 | 追加到主规格 |
| `## MODIFIED Requirements` | 修改行为 | 替换现有需求 |
| `## REMOVED Requirements` | 废弃行为 | 从主规格删除 |

### 4.5 Archive（归档）

归档 = 完成一个变更，将 Delta 合并入主规格：

```
归档前：
openspec/specs/auth/spec.md  ←────────┐
openspec/changes/add-2fa/             │ merge
                   └── specs/auth/spec.md

归档后：
openspec/specs/auth/spec.md    （已包含 2FA 需求）
openspec/changes/archive/
    └── 2025-01-24-add-2fa/    （完整保留历史）
```

---

## 五、工作流（完整循环）

```
1. 提案 /opsx:propose "add-dark-mode"
        ↓ AI 生成 proposal.md + specs/ + design.md + tasks.md
2. 实施 /opsx:apply
        ↓ AI 按 tasks.md 逐项执行，打勾
3. 验证 /opsx:verify（可选）
        ↓ 检查实施是否符合规格
4. 归档 /opsx:archive
        ↓ Delta 合并入 specs/，变更移入 archive/
5. 下一个变更继续...
```

**实际对话示例：**

```
你: /opsx:propose add-dark-mode
AI: Created openspec/changes/add-dark-mode/
    ✓ proposal.md — 为什么做，做什么
    ✓ specs/       — 需求和场景
    ✓ design.md    — 技术方案
    ✓ tasks.md     — 实施清单

你: /opsx:apply
AI: 正在实施...
    ✓ 1.1 Add theme context provider
    ✓ 1.2 Create toggle component
    ✓ 2.1 Add CSS variables
    全部完成！

你: /opsx:archive
AI: 已归档 openspec/changes/archive/2025-01-23-add-dark-mode/
    规格已更新，准备好下一个功能。
```

---

## 六、支持的 AI 工具

OpenSpec 通过**斜杠命令（slash commands）**与 AI 协作，支持 20+ 工具：

- Claude Code / Claude.ai
- GitHub Copilot
- Cursor
- Windsurf
- Gemini CLI
- OpenCode
- Pi (pi.dev)
- 以及更多...

---

## 七、与其他工具的对比

| 工具 | 对比 |
|------|------|
| **GitHub Spec Kit** | 更全面但更重，有刚性阶段门，需要 Python 环境 |
| **AWS Kiro** | 强大但锁定在其 IDE，只支持 Claude 模型 |
| **什么都不用** | AI 编程无规格 = 依赖提示词，结果不可预测 |
| **OpenSpec** | 轻量、工具无关、迭代友好、适合存量系统 |

---

## 八、快速上手

```bash
# 安装
npm install -g @fission-ai/openspec@latest

# 在你的项目里初始化
cd your-project
openspec init

# 告诉 AI 开始
/opsx:propose "你想做什么"
```

**推荐模型：** Claude Opus 4.5 或 GPT 5.2（高推理能力模型效果最佳）

---

## 九、与本项目（OpenClaw）的关联思考

OpenSpec 可以作为我们**复刻 OpenClaw 工程的开发方法论**来使用：

| OpenSpec 概念 | 在 OpenClaw 复刻中的应用 |
|--------------|----------------------|
| `proposal.md` | 每个功能模块的立项说明（为什么做、做什么）|
| `specs/` | Gateway、Channel、Agent 等模块的行为规格 |
| `design.md` | 具体技术选型和架构设计 |
| `tasks.md` | 分阶段的实施任务清单 |
| Delta Specs | 迭代新增功能时只描述变化部分 |
| Archive | 功能完成后归档，保留决策历史 |

**建议：** 在开始编码前，先用 OpenSpec 把 Gateway 核心模块、Channel 接入规格、AI 代理调用规格等关键模块的行为先写清楚，再让 AI 按规格实施。这样可以避免"边聊边改"导致的混乱。

---

## 十、术语表

| 术语 | 定义 |
|------|------|
| **Artifact（制品）** | 变更中的文档（proposal/design/tasks/delta specs）|
| **Archive（归档）** | 完成变更并将 Delta 合并入主规格的操作 |
| **Change（变更）** | 一个以文件夹形式打包的系统修改提案 |
| **Delta Spec** | 描述变化的规格（ADDED/MODIFIED/REMOVED）|
| **Domain（领域）** | 规格的逻辑分组（如 auth/、payments/）|
| **Requirement（需求）** | 系统必须具备的某个特定行为 |
| **Scenario（场景）** | 需求的具体示例，通常用 Given/When/Then 格式 |
| **Schema（模式）** | 定义制品类型和依赖关系的配置 |
| **Spec（规格）** | 描述系统行为的文档，包含需求和场景 |
| **Source of Truth** | `openspec/specs/` 目录，当前系统行为的权威来源 |
