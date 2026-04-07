# Phase M: 任务清单

## M1 — Media Understanding Pipeline (GAP-30)

- [ ] T1: 编写 Delta Spec — `specs/media-understanding/spec.md`
- [ ] T2: 新建 `media/types.ts` — MediaType / MediaInput / MediaResult / MediaProvider 类型
- [ ] T3: 新建 `media/router.ts` — MediaRouter 类（register/detectType/route）
- [ ] T4: MIME 类型检测 — 扩展名 → MediaType 映射 + 大小限制检查
- [ ] T5: 新建 `media/providers/audio-transcribe.ts` — Whisper API 转录 provider
- [ ] T6: 新建 `media/providers/image-vision.ts` — 封装现有 Vision 调用为 MediaProvider
- [ ] T7: 处理结果缓存 — 基于文件 hash 的 10 分钟内存缓存
- [ ] T8: SUPPORTED_MEDIA_TYPES 常量导出
- [ ] T9: 测试 — ≥ 30 个断言

## M2 — TTS Integration (GAP-31)

- [ ] T10: 编写 Delta Spec — `specs/tts-integration/spec.md`
- [ ] T11: 新建 `tts/types.ts` — TTSRequest / TTSResult / TTSProvider 类型
- [ ] T12: 新建 `tts/text-prep.ts` — prepareText() markdown 清理 + 长文截断 + 句子边界
- [ ] T13: 新建 `tts/engine.ts` — TTSEngine 类（register/getDefault/speak）
- [ ] T14: 新建 `tts/providers/openai-tts.ts` — OpenAI TTS API provider
- [ ] T15: 前端 fallback 返回 — format: 'speech-api' + 预处理文本
- [ ] T16: OPENAI_TTS_VOICES 常量导出
- [ ] T17: 测试 — ≥ 30 个断言

## 统计

- 预估总断言数：~60（M1:30 + M2:30）
- 新文件：~9 个
- 修改文件：~1 个（read-image.ts）
