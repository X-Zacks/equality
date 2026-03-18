# Phase 10.1 — 实施清单

> 状态：✅ 完成

## 实施清单

### 1. Core — MODEL_TIERS 升级

- [x] 1.1 heavy tier: 首选 gpt-5.4, 备选 claude-sonnet-4
- [x] 1.2 standard tier: 首选 gpt-5.2, 备选 gpt-4.1
- [x] 1.3 light tier: 增加 o4-mini 备选

### 2. Core — Settings 扩展

- [x] 2.1 secrets.ts: 新增 MODEL_ROUTING / SELECTED_MODEL 两个 SecretKey
- [x] 2.2 index.ts GET /settings: 返回 modelRouting + selectedModel
- [x] 2.3 index.ts POST /chat/stream: 根据 model 参数决定走 auto 还是 manual

### 3. Desktop — Rust 层

- [x] 3.1 proxy.rs chat_stream: 新增 model 参数转发

### 4. Desktop — 前端

- [x] 4.1 useGateway.ts: sendMessage 新增 model 参数 + SettingsState 扩展
- [x] 4.2 Chat.tsx: 模型选择器 UI（Auto toggle + dropdown）
- [x] 4.3 Chat.tsx: 切换时保存偏好到 Core settings
- [x] 4.4 Chat.css: 模型选择器样式

### 5. 验证

- [x] 5.1 TypeScript (Core) 编译零错误
- [x] 5.2 TypeScript (Desktop) 编译零错误
- [x] 5.3 Rust 编译通过
- [ ] 5.4 Auto 模式实测
- [ ] 5.5 Manual 模式实测
