# Proposal: Phase Z4 — 持续录音+音频附件 + UI 深海蓝主题

## 背景

1. **录音体验**：当前语音输入基于 SpeechRecognition，自动断句不可控。用户希望点击开始后持续录音，手动点击结束。
2. **音频直接发送**：不再将语音转文字填入输入框，而是录音结束后直接将音频文件作为附件发给大模型处理。
3. **UI 美化**：基于 `docs/eigent-ui-analysis.md` 高优先级建议，实施深海蓝色板替换。

## 目标

- Z4.1: 持续录音 — MediaRecorder API，点击开始/结束，音频存为临时文件作为附件发送
- Z4.2: UI 主题升级 — 深海蓝色板 + font-smoothing + 按钮高光 + 输入框发光 + 消息去卡片化

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| 录音逻辑重写 | `Chat.tsx` | 中等 |
| UI 色板替换 | `App.css`, `Chat.css`, `Settings.css`, `SessionPanel.css` | 大（纯 CSS） |
