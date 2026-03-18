# Tasks: Phase 3 — 多 Provider + Compaction + Settings 面板

## 前置条件
- Phase 2 完成（Tools + Skills 全功能）
- Standard Window Redesign 完成（标准窗口 + 会话管理 + Markdown 渲染）
- Copilot Provider + Custom Provider 已可用

---

## 1. 多 Provider 支持

> 当前只有 copilot 和 custom 两个 Provider。本阶段新增 DeepSeek、通义千问直连。

- [x] 1.1 重构 Provider 基类：提取 `OpenAICompatProvider` 通用基类
  - `streamChat()` 流式对话（OpenAI SDK，只替换 baseURL + apiKey）
  - `chat()` 非流式调用
  - `getCapabilities()` 返回模型能力声明（contextWindow / supportsToolCalling 等）
  - Provider 注册表：`ProviderRegistry.register()` / `resolve()`
- [x] 1.2 实现 `providers/deepseek.ts`：DeepSeek 直连
  - baseURL: `https://api.deepseek.com/v1`
  - 模型：`deepseek-chat`（V3）、`deepseek-reasoner`（R1）
  - R1 推理块（thinking tokens）解析支持
  - API Key: `DEEPSEEK_API_KEY`
- [x] 1.3 实现 `providers/qwen.ts`：通义千问直连
  - baseURL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - 模型：`qwen-plus`、`qwen-turbo`、`qwen-max`
  - API Key: `QWEN_API_KEY`（阿里云 DashScope API Key）
- [x] 1.4 Provider 自动路由
  - 根据已配置的 API Key 自动选择可用 Provider
  - 优先级：用户设置 > copilot > deepseek > qwen > custom
  - Provider 不可用时自动降级到下一个
- [x] 1.5 费率表 + 成本计算
  - 内置费率表（CNY / 1M tokens）
  - DeepSeek V3: 输入 ¥0.14 / 输出 ¥0.28
  - DeepSeek R1: 输入 ¥1.0 / 输出 ¥16.0
  - Qwen Plus: 输入 ¥0.8 / 输出 ¥3.2
  - 多 Provider 统一走 cost-ledger 记账

## 2. Compaction（上下文压缩）

> 当前 trimMessages 是简单截断，本阶段改为 LLM 摘要压缩。

- [x] 2.1 实现 `context/compaction.ts`：上下文压缩引擎
  - 触发条件：`usedTokens / contextWindow > 0.5`
  - 压缩算法：
    1. 标记最旧的历史块（保留 system + 最近 N 轮）
    2. 调用 LLM 生成摘要（用最便宜的模型，如 deepseek-chat）
    3. 摘要替换被移除的历史块
  - 摘要 MUST 保留：任务状态、批量进度、不透明标识符（UUID/hash）
- [x] 2.2 Token 估算器
  - 轻量 token 计数（不依赖 API）
  - 中文：~1.5 字符/token，英文：~4 字符/token
  - 用于判断是否触发 Compaction
- [x] 2.3 替换现有 trimMessages
  - 保留 trimMessages 作为紧急截断兜底（Compaction 失败时）
  - 正常路径：Compaction → 摘要压缩
  - 异常路径：trimMessages → 暴力截断
- [x] 2.4 Compaction 事件推送
  - 通过 onDelta 推送 "💭 对话历史已压缩" 文本
  - 前端自动显示在 streaming 流中

## 3. Settings 面板重构

> Phase 2 延后的 9.3 项 + UI 打磨。

- [x] 3.1 Provider 选择 UI
  - Provider 列表：Copilot / DeepSeek / 通义千问 / Volc / 自定义
  - 每个 Provider 的 API Key 输入 + 保存/清除
  - Copilot 模型选择下拉框
  - 当前活跃 Provider 高亮标识 + 绿点
- [x] 3.2 Tools 配置面板
  - 工具列表展示（从 GET /tools 获取）
  - 显示工具名称
  - 提示工具调用上限 + bash 超时信息
- [x] 3.3 Skills 配置面板
  - Skills 列表展示（名称 + 描述 + 来源标签）
  - Skills 手动刷新按钮（POST /skills/reload）
  - Tab 内自动加载
- [x] 3.4 代理设置面板
  - 代理服务器 URL 配置（在模型 Tab 内）
  - 保存/清除代理配置
- [x] 3.5 关于页面
  - 版本号 v0.2.1
  - 运行环境 / 工具数量 / Skills 数量 统计
  - Tab 式导航：模型 / 工具 / Skills / 关于

## 4. 代码块增强

- [x] 4.1 代码块复制按钮
  - 每个代码块右上角显示复制按钮
  - 点击复制到剪贴板，按钮变为 ✓ 持续 2 秒
- [x] 4.2 代码块语言标签
  - 在代码块头部左侧显示语言名称（如 typescript、python）
  - 右侧显示复制按钮

## 5. 对话体验优化

- [x] 5.1 消息复制
  - 每条消息 hover 时显示复制按钮
  - 复制 Markdown 原文
- [x] 5.2 消息重新生成
  - assistant 消息的“重新生成”按钮
  - 删除最后一条 assistant 回复，重新发送
- [x] 5.3 输入框自适应高度
  - 多行输入时自动扩展（最高 200px）
  - 内容清空后恢复单行
- [x] 5.4 会话标题自动生成
  - 第一轮对话完成后，后台异步调用 LLM 生成 ≤10 字的标题
  - 标题保存到 session 文件，SessionPanel 刷新时自动显示

## 6. 验收

- [ ] 6.1 DeepSeek Provider：配置 API Key 后对话正常，费用统计正确
- [ ] 6.2 通义千问 Provider：配置 API Key 后对话正常
- [ ] 6.3 Provider 降级：主 Provider 不可用时自动切换备用
- [ ] 6.4 Compaction：长对话（超 50% 上下文窗口）自动压缩，继续对话不报错
- [ ] 6.5 Settings 面板：所有配置项可正常保存和读取
- [ ] 6.6 代码块复制：点击按钮成功复制代码
- [ ] 6.7 消息重新生成：点击后重新获取回复
