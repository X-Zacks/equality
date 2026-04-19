# Proposal: Phase Z4 — 持续录音+语音转文字 + 工具分类 + UI 多主题

## 背景

1. **录音体验**：当前语音输入基于 SpeechRecognition，自动断句不可控。用户希望点击开始后持续录音，手动点击结束。
2. **语音转文字**：录音结束后通过 SpeechRecognition 将语音转为文字，显示在输入框中供用户编辑后发送（音频直接发送给大模型行不通，改为转文字方案）。
3. **工具分类展示**：设置界面中工具 Tab 当前为平铺列表，需要参考 Skills Tab 的分类方式，按类别（文件操作、搜索、浏览器、系统、记忆等）分组展示。
4. **UI 美化**：实施深海蓝色板 + 新增黑色板主题。

## 目标

- Z4.1: 持续录音 — MediaRecorder API 录音，SpeechRecognition 转文字填入输入框
- Z4.2: 工具分类展示 — 设置页工具 Tab 按类别分组，参考 Skills 的 category tabs 实现
- Z4.3: UI 主题升级 — 深海蓝色板 + 新增纯黑色板 + font-smoothing + 按钮高光 + 输入框发光 + 消息去卡片化

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| 录音逻辑重写（转文字） | `Chat.tsx` | 中等 |
| 工具分类展示 | `Settings.tsx`, `Settings.css` | 中等 |
| UI 色板替换 + 黑色板 | `App.css`, `App.tsx`, `Chat.css`, `Settings.css`, `SessionPanel.css` | 大 |
