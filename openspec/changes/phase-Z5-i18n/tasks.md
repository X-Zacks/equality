# Tasks: Phase Z5-i18n

## I1: i18n 基础设施

- [ ] 1.1 安装 `i18next` + `react-i18next` 依赖
- [ ] 1.2 新建 `i18n.ts` 初始化配置
- [ ] 1.3 新建 `locales/en.json`（英文翻译 — 默认语言）
- [ ] 1.4 新建 `locales/zh-CN.json`（中文翻译）
- [ ] 1.5 在 `main.tsx` 中 import i18n

## I2: UI 文本提取

- [ ] 2.1 `Settings.tsx`: 所有硬编码中文 → `t()` 调用
- [ ] 2.2 `Chat.tsx`: placeholder、按钮文本、错误消息 → `t()`
- [ ] 2.3 `App.tsx`: 状态栏文本 → `t()`
- [ ] 2.4 `SessionPanel.tsx`: "新对话"、时间分组 → `t()`
- [ ] 2.5 `WelcomeGuide.tsx`: 欢迎文本 → `t()`
- [ ] 2.6 `MentionPicker.tsx`: 提及选择器 → `t()`
- [ ] 2.7 工具分类标签、Skills 分类标签 → `t()`

## I3: 语言切换 UI

- [ ] 3.1 `Settings.tsx` 高级 tab: 添加语言切换按钮（English / 中文）
- [ ] 3.2 持久化到 localStorage
- [ ] 3.3 验证：切换后所有 UI 文本即时变更

## I4: 系统提示词

- [ ] 4.1 core system prompt 支持 language 参数
- [ ] 4.2 前端 gateway 请求传递 language 字段
- [ ] 4.3 验证：切换语言后 AI 回复语言跟随变化
