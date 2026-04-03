# Phase G: 项目感知与安全 — Proposal

> **目标**：让 Agent 自动感知项目上下文（GAP-16）、安全处理外部内容（GAP-19）、准确管理 context window（GAP-25）

---

## 动机

Phase A-F 完成了 15 个工程差距的实现，但 Agent 仍然对项目结构完全不知情——没有工作区引导文件机制来定制 Agent 身份和行为。同时，web_search 等工具返回的外部内容直接注入 LLM 上下文，存在 prompt injection 风险。最后，context window 大小使用硬编码值，切换不同模型时截断行为不准确。

**关键设计约束**：Equality 的操作主体是对话框，不是命令行。所有配置和初始化都应通过**对话驱动**完成，而非要求用户手动创建文件。

## 范围

### G1 — 对话驱动的工作区引导（GAP-16）

参考 OpenClaw 的 `ensureAgentWorkspace()` + `BOOTSTRAP.md` 机制，设计对话驱动的初始化流程：

- **自动种子**：Core 启动时调用 `ensureWorkspaceBootstrap()`，自动在 `workspaceDir` 下种下 6 个模板文件
- **引导文件**：`BOOTSTRAP.md`（首次引导脚本）、`AGENTS.md`、`IDENTITY.md`、`USER.md`、`SOUL.md`、`TOOLS.md`
- **对话引导**：全新工作区种下 `BOOTSTRAP.md` → Agent 在 system prompt 中收到引导脚本 → Agent 主动发起对话了解用户 → Agent 用 `write_file` 填写身份文件 → 引导完成后 Agent 删除 `BOOTSTRAP.md`
- **安全限制**：2MB 上限、路径边界检查、`writeFile(flag: 'wx')` 原子非覆盖
- **缓存机制**：mtime + size 缓存避免重复读取
- **System Prompt 注入**：`BOOTSTRAP.md` 使用 `<bootstrap-script>` 高优先级标签；其他文件使用 `<workspace-context>` 标签

### G2 — 外部内容安全包装（GAP-19）
- 14 种 prompt injection 模式检测
- 安全 boundary 标记包装（随机 ID 防欺骗）
- 来源标注（web_search / web_fetch / api）
- 集成到 web_search 和 web_fetch 工具

### G3 — Context Window Guard（GAP-25）
- 已知模型 context window 查表（25+ 模型，支持前缀匹配）
- 配置覆盖 > 模型查表 > Provider 报告 > 兜底 128K 的优先链
- `resolveContextWindow()` 统一接口
- 影响 compaction 阈值和 tool result 截断

## 非目标

- 不实现 HEARTBEAT.md / MEMORY.md（V2 增量）
- 不实现全宽字符折叠防御（OpenClaw 的 Unicode homoglyph 防御过于复杂，V1 跳过）
- 不实现跨会话记忆持久化（已有 Phase 12 Memory 模块负责）

## 成功指标

- 新增 ≥ 60 个测试断言
- `tsc --noEmit` 零错误
- 现有 208 个测试不受影响
