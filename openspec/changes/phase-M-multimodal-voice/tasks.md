# Phase M: 任务清单

## M1 — Media Understanding Pipeline (GAP-30)

- [x] T1: 编写 Delta Spec — `specs/media-understanding/spec.md`
- [x] T2: 新建 `media/types.ts` — MediaType / MediaInput / MediaResult / MediaProvider 类型
- [x] T3: 新建 `media/router.ts` — MediaRouter 类（register/detectType/route）
- [x] T4: MIME 类型检测 — 扩展名 → MediaType 映射 + 大小限制检查
- [ ] T5: 新建 `media/providers/audio-transcribe.ts` — Whisper API 转录 provider（v2，需 API key）
- [ ] T6: 新建 `media/providers/image-vision.ts` — 封装现有 Vision 调用为 MediaProvider（v2）
- [x] T7: 处理结果缓存 — 基于文件 hash 的 10 分钟内存缓存
- [x] T8: SUPPORTED_MEDIA_TYPES 常量导出
- [x] T9: 测试 — 41 个断言 ✅

## M2 — TTS Integration (GAP-31)

- [x] T10: 编写 Delta Spec — `specs/tts-integration/spec.md`
- [x] T11: 新建 `tts/types.ts` — TTSRequest / TTSResult / TTSProvider 类型
- [x] T12: 新建 `tts/text-prep.ts` — prepareText() markdown 清理 + 长文截断 + 句子边界
- [x] T13: 新建 `tts/engine.ts` — TTSEngine 类（register/getDefault/speak）
- [ ] T14: 新建 `tts/providers/openai-tts.ts` — OpenAI TTS API provider（v2，需 API key）
- [x] T15: 前端 fallback 返回 — format: 'speech-api' + 预处理文本
- [x] T16: OPENAI_TTS_VOICES 常量导出
- [x] T17: 测试 — 37 个断言 ✅

## 统计

- 实际总断言数：78（M1:41 + M2:37）
- 新文件：5 个（media/types, media/router, tts/types, tts/text-prep, tts/engine）
- 修改文件：0 个（v2 任务推迟）
