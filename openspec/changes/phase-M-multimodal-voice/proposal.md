# Phase M 提案：多模态与语音

## 动机

Phase K/L 完成后，Equality 的扩展性、智能搜索和运维健壮性已接近 OpenClaw 水平。但桌面应用最直观的交互维度——**多模态理解**和**语音合成**——仍为空白：

1. **媒体理解受限**（GAP-30）——现有 `read-image` 工具支持单张图片 Vision 分析，但无音频转录、无视频处理、无自动媒体类型路由。用户拖入音频文件时 Agent 无法理解内容。
2. **无语音输出**（GAP-31）——Agent 只能以文本回复。桌面应用的语音交互体验缺失，无法满足"边做饭边提问"等解放双手的场景。

## 范围

| ID | 名称 | GAP | 优先级 |
|----|------|-----|--------|
| M1 | Media Understanding Pipeline | GAP-30 | P3 |
| M2 | TTS Integration | GAP-31 | P3 |

## 非目标

- 实时语音对话（STT + TTS 双向流，需 WebRTC）
- 视频实时分析（仅支持预录视频关键帧提取）
- 本地 Whisper 模型运行（首版使用 API）
- 自训练 TTS 模型
- 电话/Telephony TTS
- 多模态记忆存储（图片/音频存入 memory DB）

## 成功标准

- M1: 定义 `MediaProvider` 接口 + `MediaRouter`，支持图片/音频/PDF 三种媒体类型路由，音频转录通过 Whisper API
- M2: 定义 `TTSProvider` 接口 + `TTSEngine`，支持 Web Speech API（浏览器端）+ OpenAI TTS API（服务端）
- 新增测试 ≥ 60 个断言
- tsc --noEmit 零错误
- 现有断言无回归
