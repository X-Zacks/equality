# Proposal: Phase Z5-i18n — 中英双语支持

## 背景

当前 Equality 所有 UI 文本均为硬编码中文。需要支持中英双语，默认英语，在设置 → 高级中提供语言切换开关。

影响范围较广：
- **UI 文本**：`App.tsx`、`Settings.tsx`、`Chat.tsx`、`SessionPanel.tsx`、`WelcomeGuide.tsx`、`MentionPicker.tsx` 等所有组件中的中文字符串
- **系统提示词**：`packages/core` 中的 system prompt 模板可能包含中文指令
- **工具描述**：工具注册时的 description 字段
- **错误消息**：各处 `alert()` 和错误提示

## 目标

- I1: i18n 基础设施 — 引入 `react-i18next`，创建 `zh-CN.json` 和 `en.json` 翻译文件
- I2: UI 文本提取 — 所有硬编码中文字符串替换为 `t('key')` 调用
- I3: 语言切换 — 设置 → 高级中添加语言切换开关，默认英语，持久化到 localStorage
- I4: 系统提示词 — core 的 system prompt 根据语言设置切换中/英版本

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| i18n 基础设施 | `i18n.ts`（新建）、`locales/en.json`、`locales/zh-CN.json` | 中 |
| UI 文本提取 | `App.tsx`、`Settings.tsx`、`Chat.tsx`、`SessionPanel.tsx` 等 | 大 |
| 语言切换 UI | `Settings.tsx`（高级 tab） | 小 |
| 系统提示词 | `packages/core/src/agent/system-prompt.ts` | 中 |

## 注意事项

- 默认语言为 **英语**
- 语言切换后需刷新部分组件（或使用 react-i18next 的响应式机制）
- CSS 中的中文注释不影响功能，无需翻译
- 工具分类标签（"📄 文件"、"🔍 搜索"等）也需翻译
