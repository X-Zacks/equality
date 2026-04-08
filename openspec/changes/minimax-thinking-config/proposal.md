# Proposal: MiniMax Thinking 配置优化

> **变更 ID**: minimax-thinking-config  
> **创建日期**: 2026-04-08  
> **优先级**: P1（用户可见问题）

---

## 背景

当前使用 MiniMax-M2.7 模型时存在以下问题：

1. **`<think>` 内容泄漏到聊天界面**：MiniMax-M2.7 默认开启 Interleaved Thinking，推理内容以 `<think>...</think>` 标签嵌入 `content` 字段，但当前 MiniMax provider 的 `supportsThinking` 设为 `false`（默认值），导致流式处理管道 **不会** 注入 `dropThinkingBlocks` 装饰器，`<think>` 内容原样输出到聊天区。

2. **缺少 `reasoning_split` 参数**：MiniMax OpenAI 兼容 API 支持 `extra_body: { reasoning_split: true/false }` 参数。设为 `true` 时思考内容分离到 `reasoning_details` 字段（不污染 `content`），设为 `false` 时以 `<think>` 标签嵌入 `content`。当前未传递此参数。

3. **Prompt 缓存未利用**：MiniMax 支持自动 Prompt 缓存（≥512 token 的重复前缀），系统提示词 + 工具定义是静态内容，完全可以命中缓存节省成本。当前代码无需改动（自动生效），但应在架构文档中记录。

4. **缺少用户可配置项**：用户无法在设置页控制 MiniMax 的思维链可见性。

## 目标

- **G1**：修复 `<think>` 内容泄漏，默认不在聊天区显示思考过程
- **G2**：在设置页「高级」Tab 增加「MiniMax 显示思考过程」开关（默认关闭）
- **G3**：利用 MiniMax `reasoning_split=true` API 将思考内容从 `content` 中分离
- **G4**：当用户开启「显示思考过程」时，以折叠区域展示思考内容

## 不做什么

- 不改变其他 Provider 的 thinking 处理逻辑（DeepSeek-R1 / QwQ 等已有 `dropThinkingBlocks` 正常工作）
- 不实现 Anthropic SDK 兼容方式调用 MiniMax（保持当前 OpenAI 兼容路径）
- 不实现主动缓存（Prompt 自动缓存无需代码改动）

## 影响范围

| 模块 | 变更 |
|------|------|
| `providers/base.ts` | 支持 `extraBody` 参数透传 |
| `providers/index.ts` | MiniMax 工厂函数传递 `reasoning_split` + `supportsThinking` |
| `config/secrets.ts` | 新增 `MINIMAX_SHOW_THINKING` 配置项 |
| `agent/runner.ts` | 条件性传递 thinking delta 到前端 |
| `desktop/Settings.tsx` | 高级 Tab 新增开关 |
| `desktop/Chat.tsx` | 可折叠思考区域 UI |
