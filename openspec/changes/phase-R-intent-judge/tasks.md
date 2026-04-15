# Phase R: Intent Judge LLM 任务清单

## R1 — autoCapture LLM 意图判断（已完成）

### Core 端
- [x] R1-T1: 废弃纯正则 CAPTURE_TRIGGERS + CAPTURE_ANTI_PATTERNS
- [x] R1-T2: 实现关键词预过滤 `MEMORY_KEYWORD_PREFILTER`
- [x] R1-T3: 实现 `INTENT_JUDGE_PROMPT` 意图判断提示词
- [x] R1-T4: `autoCapture()` 改为 async，并行调 LLM 不阻塞主流程
- [x] R1-T5: 保存 LLM 提炼后的文本而非用户原始提问
- [x] R1-T6: `secrets.ts` 注册 `INTENT_JUDGE_PROVIDER` + `INTENT_JUDGE_MODEL`

### 测试
- [x] R1-T7: `phase-R1-autocapture.test.ts` — 25 assertions 预过滤测试

### Bug 修复（同 PR）
- [x] R1-T8: `system-prompt.ts` — 加强 PowerShell 语法指引（禁止 &&）
- [x] R1-T9: `bash.ts` — UTF-8 编码强制（解决中文乱码）
- [x] R1-T10: `bash.ts` — 工具描述增加 PowerShell 注意事项
- [x] R1-T11: `MemoryTab.tsx` — 删除确认弹窗改为 React 组件（修复 confirm() 时序 BUG）

## R2 — Intent Judge UI 配置

### Core 端
- [x] R2-T1: `src/index.ts` — `GET /settings` 响应增加 `intentJudge` 字段
- [x] R2-T2: 验证 intent judge provider 可用性（API Key 已配置）

### Desktop 端
- [x] R2-T3: `Settings.tsx` — ProviderDrawer 增加 "🧠 意图判断" 开关区域
- [x] R2-T4: 排他逻辑：打开一个 Provider 的 Intent Judge 自动关闭其他
- [x] R2-T5: 开关 disabled 条件：Provider 未配置时不可见
- [x] R2-T6: Copilot Drawer 特殊处理（模型从 selectedModel 读取）
- [x] R2-T7: Custom Provider Drawer 特殊处理（模型从 CUSTOM_MODEL 读取）
- [x] R2-T8: `useGateway.ts` — SettingsState 增加 intentJudge 字段

### 测试
- [ ] R2-T9: 手动验证：打开/关闭 Intent Judge 开关，检查排他性
- [ ] R2-T10: 手动验证：发送 "我喜欢什么" 确认不被保存
- [ ] R2-T11: 手动验证：发送 "记住我叫张三" 确认被保存
