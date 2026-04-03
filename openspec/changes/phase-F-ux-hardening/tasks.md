# Phase F: 实施任务清单

---

## F1: 交互式 UI 载荷

### 1.1 Core 侧类型与解析

- [ ] 1.1.1 新建 `packages/core/src/agent/interactive.ts`
  - 导出 `InteractivePayload`, `InteractiveElement`, `InteractiveButton`, `InteractiveSelect`, `InteractiveText` 类型
  - 导出 `parseInteractiveBlocks(text: string): { cleaned: string; payloads: InteractivePayload[] }`
  - 正则匹配 `:::interactive\n{...}\n:::`，支持多个块
  - JSON.parse 失败 → 跳过该块，保留原文
  - 导出 `formatInteractiveReply(actionId: string, value: string): string` — 生成 `__interactive_reply__:actionId:value`
  - 导出 `parseInteractiveReply(message: string): { actionId: string; value: string } | null` — 解析用户回传

- [ ] 1.1.2 单元测试 `packages/core/src/__tests__/interactive.test.ts`
  - 解析单个 interactive 块
  - 解析多个 interactive 块
  - 无 interactive 块 → cleaned = 原文, payloads = []
  - 无效 JSON → 跳过，保留原文
  - parseInteractiveReply 正确解析
  - parseInteractiveReply 非交互消息 → null

### 1.2 Runner 集成

- [ ] 1.2.1 `RunAttemptParams` 新增 `onInteractive?: (payload: InteractivePayload) => void`
- [ ] 1.2.2 runner.ts stream 完成后、写入 session 前：
  - 调用 `parseInteractiveBlocks(currentText)`
  - 若有 payloads → 逐个调用 `onInteractive`
  - `currentText` 替换为 `cleaned`（剥离 :::interactive 块）

### 1.3 Gateway SSE

- [ ] 1.3.1 `index.ts` `/chat/stream` 中传入 `onInteractive` 回调
  - `send({ type: 'interactive', payload })` — 与 delta/tool_start 同级

### 1.4 Desktop 渲染

- [ ] 1.4.1 `useGateway.ts` `DeltaEvent` 增加 `type: 'interactive'` + `payload` 字段
- [ ] 1.4.2 `Chat.tsx` 处理 interactive 事件：
  - 存储 `interactivePayloads` 状态
  - 在消息列表末尾渲染 InteractiveBlock
  - 用户交互后调用 `sendMessage(__interactive_reply__:...)`
  - 交互后清除该 InteractiveBlock
- [ ] 1.4.3 新建 `InteractiveBlock.tsx` + `InteractiveBlock.css`
  - `ButtonElement`：4 种样式（primary/secondary/success/danger）
  - `SelectElement`：下拉选择器 + 确认
  - `TextElement`：只读文字
  - 无障碍：keyboard navigation、aria-label
- [ ] 1.4.4 Desktop 类型检查通过 `npx tsc --noEmit`

---

## F2: Prompt 稳定性测试

### 2.1 快照框架

- [ ] 2.1.1 新建 `packages/core/src/__tests__/system-prompt.test.ts`
  - 实现 `normalizePrompt(text)` — 替换动态值为占位符
  - 实现 `loadSnapshot()` / `saveSnapshot()` — 读写 JSON 快照文件
  - 实现 `--update` flag 检测 — process.argv 包含 `--update` 时覆盖快照
  - 6 个场景（S1-S6）各生成 prompt → 对比快照

- [ ] 2.1.2 首次运行生成 golden 快照
  - `__snapshots__/system-prompt.snap.json`
  - 提交到 git

### 2.2 验证

- [ ] 2.2.1 所有 6 场景通过
- [ ] 2.2.2 手动修改 system-prompt.ts 一行 → 测试失败 → 还原 → 测试通过
- [ ] 2.2.3 `--update` 模式更新快照后通过

---

## 验证

- [ ] 3.1 Core `npx tsc --noEmit` 零错误
- [ ] 3.2 Desktop `npx tsc --noEmit` 零错误
- [ ] 3.3 既有测试全部通过（E1: 56 + E2: 59 + E3: 34 + 其他）
- [ ] 3.4 F1 interactive 测试通过
- [ ] 3.5 F2 prompt 快照测试通过
- [ ] 3.6 Git 提交
