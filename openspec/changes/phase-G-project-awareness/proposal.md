# Phase G: 项目感知与安全 — Proposal

> **目标**：让 Agent 自动感知项目上下文（GAP-16）、安全处理外部内容（GAP-19）、准确管理 context window（GAP-25）

---

## 动机

Phase A-F 完成了 15 个工程差距的实现，但 Agent 仍然对项目结构完全不知情——用户放置 `AGENTS.md` 或 `SOUL.md` 来定制 Agent 行为的能力缺失。同时，web_search 等工具返回的外部内容直接注入 LLM 上下文，存在 prompt injection 风险。最后，context window 大小使用硬编码值，切换不同模型时截断行为不准确。

## 范围

### G1 — 工作区引导文件加载（GAP-16）
- 扫描 `workspaceDir` 下的 `AGENTS.md`、`SOUL.md`、`TOOLS.md`、`IDENTITY.md` 四种文件
- 内容注入到 system prompt 中
- 安全限制：2MB 上限、路径边界检查
- 缓存机制（mtime 检测避免重复读取）

### G2 — 外部内容安全包装（GAP-19）
- 14 种 prompt injection 模式检测
- 安全 boundary 标记包装（随机 ID 防欺骗）
- 来源标注（web_search / web_fetch / api）
- 集成到 web_search 和 web_fetch 工具



### G3 — Context Window Guard（GAP-25）
- 已知模型 context window 查表
- 配置文件覆盖
- `resolveContextWindow()` 统一接口
- 影响 compaction 阈值和 tool result 截断

## 非目标

- 不实现工作区初始化模板（OpenClaw 的 `ensureAgentWorkspace` 模板拷贝）
- 不实现 HEARTBEAT.md / BOOTSTRAP.md / MEMORY.md（V2 增量）
- 不实现全宽字符折叠防御（OpenClaw 的 Unicode homoglyph 防御过于复杂，V1 跳过）

## 成功指标

- 新增 ≥ 20 个测试断言
- `tsc --noEmit` 零错误
- 现有 208 个测试不受影响
