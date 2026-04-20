# Tasks: Phase Z5-i18n

## I1: i18n 基础设施

- [x] 1.1 ~~安装 i18next~~ → 改为轻量自研 i18n（LocaleContext + useT hook）
- [x] 1.2 新建 `i18n.ts` 初始化配置（含 {n} 变量插值支持）
- [x] 1.3 新建 `locales/en.json`（200+ 键）
- [x] 1.4 新建 `locales/zh-CN.json`（200+ 键）
- [x] 1.5 App.tsx 中 LocaleContext.Provider 包裹整个应用

## I2: UI 文本提取

- [x] 2.1 `Settings.tsx`: 所有硬编码中文 → `t()` 调用
- [x] 2.2 `Chat.tsx`: placeholder、按钮文本 → `t()`
- [x] 2.3 `App.tsx`: 侧边栏 + 状态栏文本 → `t()`
- [x] 2.4 `SessionPanel.tsx`: "新对话"、时间分组、相对时间 → `t()`
- [ ] 2.5 `WelcomeGuide.tsx`: 欢迎文本 → `t()` (未完成)
- [ ] 2.6 `MentionPicker.tsx`: 提及选择器 → `t()` (未完成)
- [x] 2.7 工具分类标签、Skills 分类标签 → `t()`

## I3: 语言切换 UI

- [x] 3.1 `Settings.tsx`: 语言切换按钮（English / 中文）
- [x] 3.2 持久化到 localStorage
- [x] 3.3 验证：切换后所有 UI 文本即时变更

## I4: 系统提示词

- [ ] 4.1 core system prompt 支持 language 参数 (未完成)
- [ ] 4.2 前端 gateway 请求传递 language 字段 (未完成)
- [ ] 4.3 验证：切换语言后 AI 回复语言跟随变化 (未完成)
