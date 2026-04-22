# Proposal: Subtask 重命名 + Skills 同步 + Skills 分类架构

## 背景与问题

### 问题 1：subagent 命名导致概念混淆

当前子任务系统使用 `subagent` 命名（`subagent_spawn` / `subagent_list` / `subagent_steer` / `subagent_kill`）。
"subagent" 暗示"独立 Agent"，但实际上这些是**子任务**——在父会话上下文中分出的并行/串行工作单元。
用户和开发者更容易理解 `subtask` 这个概念。

技术事实：当前 `spawnParallel()` 使用 `Promise.allSettled` + 信号量实现并发控制（`maxConcurrent=5`），
每个子任务运行在独立 child session 中。这是 **Node.js 单线程事件循环上的异步并发**，不是多线程。

### 问题 2：Skills 文件存在于 equality 安装目录，沙箱限制导致无法使用

Skills 的脚本（如 docx/pdf/pptx/xlsx 中的 Python 脚本）存放在 `packages/core/skills/` 目录下。
当 Agent 在用户的 Workspace Dir（如 `C:\Users\xxx\projects\my-app`）中运行 bash 工具时，
沙箱机制可能限制对 equality 安装目录的访问。需要一个同步机制将 bundled skills 同步到用户的 Workspace Dir。

### 问题 3：Skills 缺乏企业级分类架构

当前 `SkillMetadata.category` 仅支持 7 种简单分类（development/data/document/communication/workflow/infra/other），
没有分层概念。参照 Anthropic Skills 体系的五层架构设计，需要为 Equality 设计适合的 Skills 分层分类。

---

## 目标

1. **subagent → subtask 全局重命名**：工具名、类型、文件名、API 路由、前端显示全部统一
2. **Skills 同步机制**：启动时自动将 bundled skills 同步到 Workspace Dir 的 `.equality/skills/` 目录
3. **Skills 分类架构分析文档**：基于 Anthropic 五层架构与 Equality 现有 skills，输出分析文档

---

## 范围

| 变更 | 影响范围 |
|------|---------|
| 工具名 subagent_* → subtask_* | 4 个工具文件、builtins/index.ts、tool policy |
| 类/类型名 SubagentManager → SubtaskManager | agent/ 目录、类型定义 |
| 文件名重命名 | subagent-*.ts → subtask-*.ts |
| runtime 字段 'subagent' → 'subtask' | TaskRegistry |
| sessionKey 格式 `::sub::` → `::task::` | SubtaskManager、前端 |
| Skills 同步器 | 新文件 skills/sync.ts |
| 分析文档 | docs/equality-skills-architecture.md |
