# Proposal: Phase Z — 配额设置 UI + 语音输入

## 背景

1. **月度配额**：后端 `PUT /quota` API 已完整实现，Settings 页有配额状态展示（进度条），但**没有编辑表单**——用户无法通过 UI 设置配额。
2. **语音输入**：项目定位为"办公 AI Agent"，但聊天界面没有语音输入入口。Tauri v2 基于 WebView2，支持 Web Speech API（SpeechRecognition）。

## 目标

- Z1: 在 Settings 模型 Tab 的配额区域添加**添加/编辑/删除配额**表单
- Z2: 在 Chat 输入区域添加**麦克风按钮**，支持语音转文字输入

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| 配额编辑表单 | `packages/desktop/src/Settings.tsx` | 中等 |
| 配额删除 API | `packages/core/src/index.ts` | 小 |
| 语音输入按钮 + 钩子 | `packages/desktop/src/Chat.tsx` | 中等 |
| 语音输入样式 | `packages/desktop/src/SessionPanel.css` | 小 |

## 非目标

- TTS 语音合成（不在本次范围）
- 第三方 ASR 服务（Whisper 等）——先用浏览器原生能力
