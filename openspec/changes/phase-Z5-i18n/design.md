# Design: Phase Z5-i18n

## I1: i18n 基础设施

### 技术选型

使用 `react-i18next` + `i18next`：
- 成熟稳定，React 生态主流
- 支持动态切换语言（无需刷新）
- 支持嵌套 key、插值、复数等

### 文件结构

```
packages/desktop/src/
├── i18n.ts                    ← i18next 初始化配置
└── locales/
    ├── en.json                ← 英文翻译（默认）
    └── zh-CN.json             ← 中文翻译
```

### 初始化

```ts
// i18n.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const LANG_KEY = 'equality-language'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
  lng: localStorage.getItem(LANG_KEY) || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})
export default i18n
```

### 翻译文件结构

```json
{
  "app": {
    "newChat": "New Chat",
    "settings": "Settings",
    "coreOnline": "Core Online",
    "coreOffline": "Core Offline"
  },
  "chat": {
    "inputPlaceholder": "Type a message... (Enter to send, Shift+Enter for newline, @ for Skill, # for Tool)",
    "voiceInput": "Voice Input",
    "stopRecording": "Stop Recording"
  },
  "settings": {
    "title": "Settings",
    "tabs": { "model": "Model", "tools": "Tools", "skills": "Skills", "memory": "Memory", "advanced": "Advanced", "about": "About" },
    "tools": {
      "registeredTools": "Registered Tools",
      "categories": { "all": "All", "file": "File", "search": "Search", "browser": "Browser", "system": "System", "memory": "Memory", "schedule": "Schedule", "other": "Other" }
    },
    "advanced": {
      "language": "Language",
      "languageDesc": "Switch interface language. Changes take effect immediately."
    }
  }
}
```

## I2: UI 文本提取

使用 `useTranslation` hook：
```tsx
const { t } = useTranslation()
// 之前：<span>新对话</span>
// 之后：<span>{t('app.newChat')}</span>
```

涉及文件（按影响大小排序）：
1. `Settings.tsx` — 最多文本（tab 标签、配置卡、分类标签、按钮、提示等）
2. `Chat.tsx` — 输入框 placeholder、按钮、错误消息
3. `App.tsx` — 状态栏、标题
4. `SessionPanel.tsx` — "新对话"、时间分组标签
5. `WelcomeGuide.tsx` — 欢迎指南文本
6. `MentionPicker.tsx` — 提及选择器文本

## I3: 语言切换 UI

设置 → 高级 tab 中添加：

```tsx
<div className="advanced-item">
  <div className="advanced-item-header">
    <span className="advanced-item-label">{t('settings.advanced.language')}</span>
    <span className="advanced-item-unit">{i18n.language === 'zh-CN' ? '中文' : 'English'}</span>
  </div>
  <div className="theme-switch">
    <button className={`theme-btn ${i18n.language === 'en' ? 'active' : ''}`}
      onClick={() => { i18n.changeLanguage('en'); localStorage.setItem(LANG_KEY, 'en') }}>
      🌐 English
    </button>
    <button className={`theme-btn ${i18n.language === 'zh-CN' ? 'active' : ''}`}
      onClick={() => { i18n.changeLanguage('zh-CN'); localStorage.setItem(LANG_KEY, 'zh-CN') }}>
      🇨🇳 中文
    </button>
  </div>
</div>
```

## I4: 系统提示词

core 的 system prompt 根据前端传入的 `language` 参数切换模板：
- `en`: "You are Equality, a helpful AI assistant..."
- `zh-CN`: "你是 Equality，一个有用的 AI 助手..."

前端通过 gateway 请求中传递 `language` 字段。
