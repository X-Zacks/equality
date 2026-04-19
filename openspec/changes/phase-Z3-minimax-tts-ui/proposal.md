# Proposal: Phase Z3 — MiniMax 高速模型 + TTS 自动播报 + UI 分析

## 背景

1. **MiniMax-M2.7-highspeed**：后端 `providers/index.ts` 已注册 highspeed 模型，但 `/models` API 未暴露，前端无法选择。
2. **TTS 交互改进**：Phase Z2 的语音播报需手动点击 🔊，用户希望回复出来后自动开始播报。另外播报内容包含表情符号和 token 统计文字，影响听感。
3. **UI 美观度**：参考 example/eigent 的现代 UI 风格（shadcn/ui + Tailwind + Framer Motion），分析差距并产出改进建议。

## 目标

- Z3.1: `/models` API 增加 `MiniMax-M2.7-highspeed` 选项
- Z3.2: TTS 自动播报 — 助手回复完成后自动朗读，无需手动触发
- Z3.3: TTS 内容过滤 — 去除表情符号、token 统计信息
- Z3.4: 产出 Eigent UI 分析文档，为后续视觉优化提供参考

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| 模型列表补全 | `packages/core/src/index.ts` | 小（1行） |
| TTS 自动播报 | `packages/desktop/src/Chat.tsx` | 中等 |
| TTS 过滤 | `packages/desktop/src/Chat.tsx` | 小 |
| UI 分析 | `docs/eigent-ui-analysis.md` | 仅文档 |
