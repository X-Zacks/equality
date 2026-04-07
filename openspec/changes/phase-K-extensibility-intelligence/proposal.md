# Phase K 提案：扩展性与智能

## 动机

Phase J 完成了可观测性基础设施（结构化日志、Session 事件、Hooks 框架），为扩展点提供了基础。但系统仍面临两个核心瓶颈：

1. **扩展性天花板**（GAP-32）——每添加一个 LLM Provider 或自定义工具都需修改核心代码。现有 `HookRegistry` 提供了 hook 点，MCP Client 提供了外部工具接入，但缺少统一的插件接口/SDK 将它们串联起来。
2. **记忆能力上限**（GAP-37）——`memory/db.ts` 已有 SQLite+FTS5 全文检索（BM25 排名），但只能做词汇匹配，无法理解语义相似性（"TypeScript ≈ TS"）。Phase 12.1 已预留向量 embedding 规划。
3. **链接理解缺失**（GAP-28）——用户消息中的 URL 不自动识别/抓取，Agent 需要被明确要求"帮我看看这个链接"才会触发 `web_fetch` 工具。

## 范围

| ID | 名称 | GAP | 优先级 |
|----|------|-----|--------|
| K1 | Plugin SDK (Lite) | GAP-32 | P1 |
| K2 | Memory Embeddings + Hybrid Search | GAP-37 | P2 |
| K3 | Link Understanding | GAP-28 | P2 |

## 非目标

- 完整的插件市场/Hub（K1 只做本地插件 SDK，不做远程安装）
- 多模态记忆（图片/音频存入 memory）—— 留待 Phase M
- JavaScript SPA 渲染抓取（K3 只做静态 HTML）
- 向量数据库服务端（K2 使用本地 embedding，不依赖外部 vector DB）
- MCP Resources/Prompts 支持（超出 K1 范围）

## 成功标准

- K1: 定义 `PluginManifest` + `PluginHost` 接口，支持 3 类插件（provider / tool / hook），可从本地目录加载/卸载插件
- K2: 在现有 FTS5 基础上增加本地 embedding 向量搜索，支持混合检索（BM25 + cosine 加权），recall 质量可测试验证
- K3: 自动从用户消息提取 URL，SSRF 防护（阻止内网 IP），网页内容自动摘要注入 context
- 新增测试 ≥ 80 个断言
- tsc --noEmit 零错误
- 现有 587 个断言无回归
