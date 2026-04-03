# Phase F: UX 强化 — 交互式 UI 载荷 + Prompt 稳定性测试

## 状态：草案

---

## 为什么做？

Phase A–E 补齐了核心工程能力（可靠性 / 安全 / 可扩展 / 多 Agent / 任务），
但最终用户感知的两个缺口仍然存在：

1. **聊天仅支持纯文本/Markdown**：Agent 无法向用户呈现结构化操作（按钮、选择器），
   复杂场景下只能把所有选项堆在文字里，体验不如竞品。
2. **System Prompt 无回归保护**：每次改动 system-prompt.ts 都有可能意外破坏
   已有行为（如 Skills 注入顺序、执行证据规则），目前完全靠人工 review。

---

## 做什么？

### F1: 交互式 UI 载荷（GAP-14）

允许 Agent 在回复中携带结构化 UI 元素（按钮 / 下拉选择），
Desktop 层渲染为可点击组件，用户交互结果回传到 Agent 继续对话。

**核心交付：**
- Core 侧：`InteractivePayload` 类型定义 + SSE `interactive` 事件
- Desktop 侧：`InteractiveBlock` 组件 — 渲染按钮/选择器，点击后回传

### F2: Prompt 稳定性测试框架（GAP-15）

多场景 System Prompt 快照测试，变更时自动检测 prompt 是否意外改变。

**核心交付：**
- `system-prompt.test.ts`：6+ 场景的快照断言
- 快照文件 `__snapshots__/`：golden prompt 文本

---

## 不做什么？

- 不做富媒体卡片（图片轮播、视频嵌入）— 超出 V1 范围
- 不做服务端渲染 — Desktop 是 Tauri WebView，纯客户端渲染
- 不做 prompt fuzzing — V1 仅做确定性快照，不做随机变异测试
- 不改动 system-prompt.ts 的实际内容 — 仅为其加测试

---

## 成功标准

| 指标 | 目标 |
|------|------|
| F1: Interactive SSE 事件可被 Desktop 渲染 | Agent 回复包含按钮 → 用户点击 → 结果回传成功 |
| F1: 按钮/选择器两种组件类型可用 | 至少支持 button + select 两种 |
| F2: 快照测试覆盖 ≥6 场景 | 基础/带 Skills/带 activeSkill/带工作目录/组合场景/空参数 |
| F2: prompt 变更时测试自动失败 | 修改 system-prompt.ts → 快照不匹配 → 测试报错 |
| tsc --noEmit 零错误 | ✅ |
| 所有现有测试（149+）继续通过 | ✅ |
