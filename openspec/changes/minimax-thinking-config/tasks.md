# Tasks: MiniMax Thinking 配置优化

> **变更 ID**: minimax-thinking-config  
> **创建日期**: 2026-04-08

---

## Phase 1: Core 后端（修复 `<think>` 泄漏）

- [x] **T1.1** `config/secrets.ts` — 在 `KEY_NAMES` 新增 `MINIMAX_SHOW_THINKING`；在 `listSecrets()` 不遮掩列表中加入该键
- [x] **T1.2** `providers/base.ts` — 构造器新增 `extraBody?: Record<string, unknown>` 字段；`streamChat` 和 `chat` 方法中将 `extraBody` 合并到请求体
- [x] **T1.3** `providers/index.ts` — `createMiniMaxProvider()` 修改：
  - 默认模型改为 `MiniMax-M2.7`
  - `supportsThinking: true`
  - 读取 `MINIMAX_SHOW_THINKING` 配置，计算 `reasoning_split`
  - 传入 `extraBody: { reasoning_split }`
- [x] **T1.4** `providers/index.ts` — models 列表新增 `MiniMax-M2.7-highspeed`

## Phase 2: 前端设置页

- [x] **T2.1** `desktop/Settings.tsx` — 高级 Tab 新增「🧠 MiniMax 显示思考过程」toggle 开关
  - 读取 `MINIMAX_SHOW_THINKING` 已有值显示开关状态
  - 切换时保存 `"true"` / `"false"` 到 secrets
- [x] **T2.2** `desktop/useGateway.ts` — `SecretKey` 类型联合新增 `'MINIMAX_SHOW_THINKING'`

## Phase 3: 验证

- [ ] **T3.1** 手动验证：MiniMax-M2.7 对话不再出现 `<think>` 内容
- [ ] **T3.2** 手动验证：设置页切换「显示思考」后重新对话，行为符合预期
- [ ] **T3.3** 手动验证：其他 Provider（DeepSeek / Copilot / Custom）不受影响

---

## 依赖关系

```
T1.1 ─┐
T1.2 ─┼─► T1.3 ─► T1.4
      │
T2.2 ─┴─► T2.1 ─► T3.1 ─► T3.2 ─► T3.3
```
