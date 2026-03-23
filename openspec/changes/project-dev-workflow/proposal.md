# Proposal: Project Dev Workflow Skill（需求→Spec→长时间开发）

## 背景与问题

当前 Agent 在接到"帮我做一个项目/功能"类请求时，缺乏标准化的工作流程：
- 有时直接开始写代码，没有充分澄清需求
- 有时给出 spec 文档但没有按 OpenSpec 格式组织，不便于后续追踪
- 跨 session 的任务状态没有统一的恢复机制，每次重新开始都需要用户重新描述
- 长时间开发（100+ 文件）缺乏 Phase 化推进策略，容易在中途因工具上限中断

---

## 目标

提供一个**标准化的项目开发工作流 Skill**，Agent 在接到项目开发请求时自动遵循：

1. **需求澄清阶段**：通过结构化问题确认目标用户、技术栈、核心功能、验收标准
2. **Spec 生成阶段**：按 OpenSpec 格式生成 `proposal.md`、`specs/`、`design.md`、`tasks.md`
3. **用户确认阶段**：展示 spec 摘要，等待用户确认后开始编码
4. **分 Phase 实现阶段**：每次对话完成一个 Phase，结束时输出 checkpoint 摘要
5. **跨 session 续接**：下次对话时读取 `tasks.md` 自动恢复进度

---

## 用户故事

**US-1 需求澄清**
> 作为用户，当我说"帮我做一个 XX 系统"时，Agent 先问我 3-5 个关键问题（不超过），再开始写 spec。

**US-2 OpenSpec 输出**
> 作为用户，Agent 生成的 spec 文档放在项目目录下的 `openspec/changes/<feature>/` 中，格式与本项目保持一致。

**US-3 Phase 化推进**
> 作为用户，每次对话 Agent 完成 tasks.md 中的一个 Phase，完成后告诉我进度，并等待我确认继续。

**US-4 跨 session 续接**
> 作为用户，下次对话时我说"继续上次的项目"，Agent 读 tasks.md 自动找到未完成的 Phase，无需我重新描述需求。

---

## 方案概述

### 方案：新增 project-dev-workflow Skill

在 `packages/core/skills/project-dev-workflow/SKILL.md` 中定义完整流程，包括：
- 需求澄清问题模板
- OpenSpec 目录结构规范
- tasks.md checkpoint 格式
- Phase 推进节奏（单次对话目标）
- memory_save 使用时机

---

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| 新增 Skill | `packages/core/skills/project-dev-workflow/SKILL.md` | Agent 接收项目请求时的行为 |

---

## 不在本次范围内

- IDE 插件集成
- 多人协作支持
- 自动 git commit 策略
