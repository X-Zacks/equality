# Proposal: Session Purpose System

## 意图

当前工作区引导机制 (Phase G1) 使用 6 个 workspace 级 `.md` 文件（BOOTSTRAP / AGENTS / IDENTITY / USER / SOUL / TOOLS）来定义 Agent 身份与行为。

**问题：**
1. **SOUL.md / IDENTITY.md / USER.md 语义重叠** — 三个文件都在描述"Agent 应该怎么做"和"用户是谁"，边界模糊
2. **workspace 级 = 所有会话共享** — 无法按会话区分目的（写代码 vs 闲聊 vs 文档整理）
3. **token 浪费** — 每轮对话都注入 3 个模板文件，大部分内容对当前任务无关
4. **引导流程笨重** — BOOTSTRAP.md 一次性引导太多信息，用户体验差

## 方案概述

**干掉** SOUL.md / IDENTITY.md / USER.md 三个文件，替换为**会话级 Purpose** 机制：

- 每个会话有一个 `purpose` 字段（结构化 JSON），描述本次会话的目标、约束、偏好
- Purpose 可从用户首轮消息自动推断，也可手动设置
- 注入 system prompt 时只注入与本会话相关的上下文，减少 token 消耗
- **保留** AGENTS.md（项目级规则）和 TOOLS.md（环境备注）— 这两个是 workspace 级，合理

## 范围

- 移除 SOUL.md / IDENTITY.md / USER.md 模板和相关种下逻辑
- Session 类型新增 `purpose` 字段
- 新增 Purpose 推断逻辑（从首轮消息提取）
- 修改 system prompt 注入：用 purpose 替代旧三文件
- 简化 BOOTSTRAP.md 引导流程
- 更新测试

## 不在范围内

- AGENTS.md / TOOLS.md 不动
- 前端 Purpose 编辑 UI（后续迭代）
- Purpose 历史/统计（后续迭代）
