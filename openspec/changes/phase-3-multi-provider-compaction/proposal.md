# Proposal: Phase 3 — 多 Provider + Compaction + Settings 面板

## 意图

为 equality 添加**多模型 Provider 支持**、**上下文智能压缩**和**完善的设置面板**。  
Phase 3 完成后，用户可直连 DeepSeek / 通义千问等国内模型，长对话自动压缩不丢失上下文，并通过 Settings 面板管理所有配置。

## 背景

Phase 2 实现了 Tools + Skills + Tool Loop + 会话管理 + Markdown 渲染。  
但当前存在三个明显短板：

1. **Provider 单一**：只有 Copilot 和 Custom 两个 Provider，国内用户需自备 OpenAI 兼容 API 端点。DeepSeek、通义千问等国内主流模型无法一键直连。
2. **上下文截断粗暴**：当前 `trimMessages()` 直接丢弃最旧消息，长对话中大量有价值的上下文被静默丢失。
3. **Settings 不完整**：无法在 UI 中切换 Provider、配置 Tools/Skills、测试代理连接。

## 做什么

### A. 多 Provider 支持

1. **Provider 基类重构**：提取 `OpenAICompatProvider` 通用基类，所有国内模型只需替换 baseURL + apiKey
2. **DeepSeek 直连**：`api.deepseek.com/v1`，支持 V3 和 R1（含推理块解析）
3. **通义千问直连**：`dashscope.aliyuncs.com/compatible-mode/v1`，支持 qwen-plus / qwen-turbo / qwen-max
4. **Provider 自动路由**：根据已配置 API Key 自动选择，支持降级链
5. **费率表**：内置 CNY 费率，统一走 cost-ledger 记账

### B. Compaction（上下文压缩）

6. **LLM 摘要压缩**：对话超 50% 上下文窗口时，调 LLM 生成摘要替换旧历史
7. **Token 估算器**：轻量本地估算（中文 ~1.5 字/token，英文 ~4 字/token），不依赖 API
8. **兜底截断**：Compaction 失败时回退到现有 trimMessages
9. **前端事件**：SSE 推送 `compaction` 事件，前端显示"对话历史已压缩"

### C. Settings 面板重构

10. **Provider 管理**：Provider 列表 + API Key 配置 + 测试连接 + 模型选择
11. **Tools 配置**：工具开关、bash 超时、工具调用上限
12. **Skills 配置**：Skills 列表、额外目录、手动刷新
13. **代理配置**：代理 URL、测试、TLS 开关
14. **关于页面**：版本号、构建信息

### D. 对话体验优化

15. **代码块复制按钮** + 语言标签
16. **消息复制 / 重新生成**
17. **输入框自适应高度**
18. **会话标题自动生成**（LLM 总结 ≤10 字标题）

## 不做什么

- ❌ 异步 Compaction（留 Phase 5，Phase 3 先同步阻塞）
- ❌ 多代理编排（sessions_spawn / sessions_send）
- ❌ 渠道适配（微信/钉钉/飞书 IM 接入）
- ❌ DPAPI 加密存储（留后续安全加固阶段）
- ❌ 远程费率表更新（先用内置兜底）

## 范围

| 包 | 变动范围 |
|----|---------|
| `@equality/core` | providers/、context/compaction、cost-ledger 费率扩展、新 API 端点 |
| `@equality/desktop` | Settings 重构、Markdown 代码块增强、对话体验 UI |

## 风险

| 风险 | 缓解 |
|------|------|
| DeepSeek / 千问 API 变更 | 全部基于 OpenAI 兼容模式，变更概率低 |
| Compaction 摘要质量差 | 用最便宜模型生成摘要 + 保留结构化 prompt 约束 |
| Compaction 超时导致对话卡顿 | 60 秒超时保护 + 失败回退到 trimMessages |
| 费率变动 | 内置费率可手动更新，预留远程更新扩展点 |
