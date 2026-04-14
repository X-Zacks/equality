# Proposal: Phase I.5 — Gateway 缝合冲刺

> Status: in-progress
> Created: 2026-04-14
> Priority: P0

---

## 动机

Phase J-O 的模块级代码已全部实现并通过单测（587+ 断言），但经核查源码发现：
**大量模块仅存在为独立库，未接入 Gateway 运行时（index.ts / runner.ts / store.ts）**。

这意味着用户运行 Equality 时，这些功能实际上不生效。

## 范围

将以下已实现但未集成的模块接入运行时，具体 9 个 Gap：

| # | Gap | 文件 | 影响 |
|---|-----|------|------|
| G1 | `codebase_search` 工具未注册 | `tools/builtins/index.ts` | Agent 无法使用代码库搜索 |
| G2 | Hooks 框架未接入 runner | `agent/runner.ts` | hook 点不触发 |
| G3 | Session 生命周期事件未发射 | `session/store.ts` | 外部无法监听 session 事件 |
| G4 | Config 验证未在启动时调用 | `index.ts` | 错误配置无法拦截 |
| G5 | Web 搜索未走 Registry | `tools/builtins/web-search.ts` | 搜索引擎不可扩展 |
| G6 | Bash 未接入 CommandQueue | `tools/builtins/bash.ts` | 并发无限流 |
| G7 | Links beforeLLMCall hook 未注册 | `index.ts` | URL 自动理解不触发 |
| G8 | Plugin loader 缺失 | `plugins/loader.ts` | 插件无法从磁盘加载 |
| G9 | Structured Logger 未替代 console.log | `index.ts` / `runner.ts` | 日志不结构化 |

## 非范围

- 新增 TTS/Media provider（需要外部 API Key，属于 v2）
- 频道系统（Phase P，独立提案）
- 向量搜索外置（Phase R，远期）

## 实施策略

**最小侵入原则**：每个 Gap 独立提交，改动控制在 3-5 个文件以内，不修改模块内部逻辑，只做"接线"。

先做风险最低、价值最高的 G1（30 分钟），逐步推进到 G2-G3（核心缝合），最后 G4-G9（渐进增强）。
