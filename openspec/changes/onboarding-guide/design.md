# Design: 用户引导增强（Onboarding Guide）

## 概述

增强新用户的首次启动体验，从"空白页 + 一个💬图标"升级为"引导卡片 + 示例场景 + 功能发现提示"。所有改动基于现有架构，不增加新依赖。

---

## D1. 空状态 → 欢迎引导卡片（Desktop 前端）

### 当前状态

Chat.tsx 第 721 行：
```tsx
{messages.length === 0 && !streaming && (
  <div className="chat-empty">
    <span className="chat-empty-icon">💬</span>
    <p>开始对话吧</p>
  </div>
)}
```

### 目标状态

将空状态替换为**欢迎引导组件** `WelcomeGuide`，包含：

1. **品牌区** — Equality logo + 一句话介绍
2. **示例场景卡片**（4 张）— 点击直接发送预设提问
3. **快捷提示** — 底部小字提示 @Skill / #Tool / 📎拖放文件

### 组件设计

```
WelcomeGuide.tsx
├─ 品牌区（logo + "你好，我是 Equality"）
├─ ScenarioCards（2×2 网格）
│   ├─ 🧑‍💻 代码助手 — "帮我分析当前项目结构并生成开发计划"
│   ├─ 📝 文档写作 — "帮我写一份项目 README 文档"
│   ├─ 🔍 信息检索 — "搜索最新的 TypeScript 5.x 新特性"
│   └─ 🛠️ 自动化任务 — "帮我创建一个 Git 提交规范的 Skill"
└─ 快捷提示栏
    "💡 @ 激活 Skill · # 选择工具 · 📎 拖放文件 · ⏸ 随时暂停"
```

### 数据流

- 点击卡片 → 调用 Chat 的 `setInput(prompt)` + 触发 `handleSend()`
- WelcomeGuide 通过 props 接收 `onSendPrompt: (text: string) => void`

### 文件变更

| 文件 | 操作 |
|---|---|
| `packages/desktop/src/WelcomeGuide.tsx` | **新增** — 欢迎引导组件 |
| `packages/desktop/src/WelcomeGuide.css` | **新增** — 样式 |
| `packages/desktop/src/Chat.tsx` | **修改** — 替换 `.chat-empty` 为 `<WelcomeGuide>` |

---

## D2. BOOTSTRAP.md 增强（Core 后端）

### 当前状态

workspace-bootstrap.ts 中的 `BOOTSTRAP_TEMPLATE` 只关注"认识用户"（姓名/性格/偏好），不包含功能介绍。

### 目标状态

在 BOOTSTRAP.md 模板的"对话引导"部分追加**功能导览步骤**：

```markdown
## 功能导览（认识完用户后执行）

在了解用户之后，简明扼要地介绍你能做什么：

1. **工具能力** — "我可以帮你执行命令、读写文件、搜索网页、管理进程等。"
2. **Skills 系统** — "我有 20+ 内置技能（如 Git、Python、文档处理），你用 @ 就能选择。"
3. **记忆能力** — "告诉我需要记住的事情，我会跨会话保存。"
4. **文件处理** — "拖放文件到对话框，我可以分析图片、PDF、代码等。"

不要一次全讲完。在第一轮对话自然地提到 1-2 个最相关的能力。
```

### 文件变更

| 文件 | 操作 |
|---|---|
| `packages/core/src/agent/workspace-bootstrap.ts` | **修改** — BOOTSTRAP_TEMPLATE 追加功能导览段 |

---

## D3. 内置 getting-started Skill（Core Bundled Skill）

### 目的

提供一个可搜索、可引用的"新手上路"Skill，让用户或 Agent 在任何时候都可以通过 `@getting-started` 获取使用指南。

### 内容

```yaml
name: getting-started
description: 'Equality 新手指南。Use when: 用户第一次使用、不知道如何开始、问"你能做什么"。NOT for: 已熟悉系统的用户。'
tools:
  - memory_search
  - memory_save
equality:
  auto-generated: true
  source-model: equality-system
  created: 2025-01-01
```

正文覆盖：

1. **快速开始** — 5 分钟上手流程
2. **核心能力一览** — 6 大类能力表格
3. **常用场景** — 8 个典型使用场景 + 示例提问
4. **高级技巧** — @多技能组合 / 暂停恢复 / 记忆管理 / 子会话

### 文件变更

| 文件 | 操作 |
|---|---|
| `packages/core/skills/getting-started/SKILL.md` | **新增** — 新手指南 Skill |

---

## D4. 功能发现提示（Feature Discovery Tips）

### 设计

在 Chat 输入框上方显示**低频提示条**，基于用户行为触发：

| 触发条件 | 提示内容 |
|---|---|
| 首次打开（无历史会话） | "💡 试试拖放文件到对话框，我可以分析图片和文档" |
| 发送 3 条消息后未使用 @Skill | "💡 输入 @ 可以选择 20+ 内置技能，如 @git、@python" |
| 发送 5 条消息后未使用附件 | "💡 点击 📎 或拖放文件，可以分析代码/图片/PDF" |

### 实现要点

- 提示条 3 秒后自动消失或点击关闭
- 每个提示只显示一次（通过 localStorage 标记 `equality_tip_dismissed_<id>`）
- 不阻挡正常交互
- 组件名: `FeatureTip`

### 文件变更

| 文件 | 操作 |
|---|---|
| `packages/desktop/src/FeatureTip.tsx` | **新增** — 功能发现提示组件 |
| `packages/desktop/src/FeatureTip.css` | **新增** — 样式 |
| `packages/desktop/src/Chat.tsx` | **修改** — 集成 FeatureTip |

---

## 不变量

- 不修改核心请求处理逻辑（agent-runner、gateway）
- 不增加新的 npm 依赖
- 所有新组件与现有亮/暗主题兼容
- WelcomeGuide 卡片内容硬编码在前端，无需后端 API
