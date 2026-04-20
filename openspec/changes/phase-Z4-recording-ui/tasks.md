# Tasks: Phase Z4

## Z4.1 持续录音 + 语音转文字

- [x] 1.1 Chat.tsx: 录音改为 MediaRecorder + SpeechRecognition 组合，转文字填入输入框
- [x] 1.2 Chat.tsx: 移除音频附件发送逻辑（不再 write_temp_file + sendMessage）
- [x] 1.3 Chat.css: 录音按钮样式（红点脉冲 + 时长显示）

## Z4.2 工具分类展示

- [x] 2.1 Settings.tsx: 添加 TOOL_CATEGORIES 映射和 getToolCategory 函数
- [x] 2.2 Settings.tsx: 工具 Tab 增加分类筛选 tabs（参考 skill-category-tabs）
- [x] 2.3 Settings.css: 工具分类 tabs 样式（复用 skill-category-tab 样式）

## Z4.3 UI 主题升级

- [x] 3.1 App.css: 新增 .app-root.theme-black 纯黑色板变量
- [x] 3.2 App.tsx: ThemePreference/EffectiveTheme 类型增加 'black'，body.background 增加分支
- [x] 3.3 Settings.tsx: 主题切换按钮增加「🖤 纯黑」选项
- [x] 3.4 App.css: theme-dark 变量保持深海蓝色板 + body 背景
- [x] 3.5 App.css: :root 添加 font-smoothing（已完成）
- [x] 3.6 Chat.css: AI 消息去背景化 + 输入框 focus 发光 + 按钮高光
- [x] 3.7 Settings.css: provider-card/drawer 背景色更新
- [x] 3.8 SessionPanel.css: 侧边栏背景色更新
