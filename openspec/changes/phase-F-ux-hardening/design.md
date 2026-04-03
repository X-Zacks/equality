# Phase F: 技术设计

---

## 1. F1: 交互式 UI 载荷

### 1.1 数据流

```
Agent (LLM) 
  → runner.ts 检测回复中的 :::interactive 代码块
  → 解析为 InteractivePayload
  → SSE 事件 { type: 'interactive', payload }
  → Desktop useGateway 接收
  → Chat.tsx 渲染 InteractiveBlock 组件
  → 用户点击按钮 / 选择选项
  → POST /chat/stream { message: "__interactive_reply__:{actionId}:{value}" }
  → runner 收到用户消息，Agent 继续对话
```

### 1.2 InteractivePayload 类型

```typescript
// packages/core/src/agent/interactive.ts

/** 按钮样式 */
type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger'

/** 单个按钮 */
interface InteractiveButton {
  type: 'button'
  actionId: string       // 唯一标识，回传时使用
  label: string          // 显示文字
  style?: ButtonStyle    // 默认 primary
}

/** 下拉选择器 */
interface InteractiveSelect {
  type: 'select'
  actionId: string
  placeholder?: string
  options: { label: string; value: string }[]
}

/** 文本块（只读，用于说明） */
interface InteractiveText {
  type: 'text'
  content: string
}

type InteractiveElement = InteractiveButton | InteractiveSelect | InteractiveText

/** 载荷根类型 */
interface InteractivePayload {
  elements: InteractiveElement[]
}
```

### 1.3 检测与解析

Agent 回复中使用围栏代码块标记交互式载荷：

````
:::interactive
{
  "elements": [
    { "type": "text", "content": "检测到 3 个可能的修改方案：" },
    { "type": "button", "actionId": "plan-a", "label": "方案 A：重构", "style": "primary" },
    { "type": "button", "actionId": "plan-b", "label": "方案 B：补丁修复", "style": "secondary" },
    { "type": "button", "actionId": "plan-c", "label": "取消", "style": "danger" }
  ]
}
:::
````

**解析时机**：`runner.ts` 在 stream 完成后、写入 session 前扫描 `assistantText`。
若检测到 `:::interactive ... :::` 块，提取 JSON、发射 `onInteractive` 回调，
并从 assistantText 中剥离该块（用户看到的是纯文本部分）。

### 1.4 SSE 事件格式

```json
{
  "type": "interactive",
  "payload": {
    "elements": [ ... ]
  }
}
```

与 `delta`/`tool_start`/`tool_result`/`done` 同级，Desktop 已有的 SSE 监听机制直接接收。

### 1.5 用户交互回传

Desktop 组件点击后调用 `sendMessage()`：

- Button: `__interactive_reply__:plan-a:clicked`
- Select: `__interactive_reply__:region:us-east-1`

Agent 收到的 userMessage 含前缀 `__interactive_reply__`，
system prompt 中会说明此为用户交互回复，Agent 应据此继续。

### 1.6 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/agent/interactive.ts` | 新增 | 类型 + 解析器 + 剥离 |
| `packages/core/src/agent/runner.ts` | 修改 | `RunAttemptParams.onInteractive` 回调 + 检测逻辑 |
| `packages/core/src/index.ts` | 修改 | `/chat/stream` 传入 `onInteractive` → SSE |
| `packages/desktop/src/useGateway.ts` | 修改 | `DeltaEvent` 增加 `interactive` 类型 |
| `packages/desktop/src/Chat.tsx` | 修改 | 渲染 `InteractiveBlock`，点击回传 |
| `packages/desktop/src/InteractiveBlock.tsx` | 新增 | 按钮/选择器 React 组件 |
| `packages/desktop/src/InteractiveBlock.css` | 新增 | 组件样式 |

---

## 2. F2: Prompt 稳定性测试框架

### 2.1 测试策略

使用 **快照断言**：每个场景生成 System Prompt 文本，与 golden 文件对比。
若不一致则测试失败，开发者需 review 变更并更新快照。

### 2.2 场景矩阵

| # | 场景 | buildSystemPrompt 参数 |
|---|------|----------------------|
| S1 | 基础（无 options） | `undefined` |
| S2 | 带工作目录 | `{ workspaceDir: 'C:\\project' }` |
| S3 | 带 Skills 列表 | `{ skills: [mockSkill1, mockSkill2] }` |
| S4 | 带 activeSkill（@ 指定） | `{ activeSkill: mockSkill1 }` |
| S5 | 全参数组合 | `{ workspaceDir, skills, activeSkill, modelName }` |
| S6 | 空参数（显式 {}） | `{}` |

### 2.3 快照管理

```
packages/core/src/__tests__/
  system-prompt.test.ts          ← 测试文件
  __snapshots__/
    system-prompt.snap.json      ← golden 快照
```

**快照格式**：JSON 对象 `{ "S1": "prompt text...", "S2": "...", ... }`

**更新流程**：
1. 修改 `system-prompt.ts` → 运行测试 → 快照不匹配 → 测试失败
2. 开发者确认变更合理 → 执行 `npx tsx src/__tests__/system-prompt.test.ts --update` → 更新快照
3. 提交新快照

### 2.4 实现细节

- 固定 `Date`/`os.platform()`/`os.arch()` 等动态值 → mock 或 post-process 替换
- 比较前将时间戳/平台信息替换为占位符 `{{NOW}}` / `{{PLATFORM}}`
- 使用现有测试框架（`assert` + `npx tsx`），与 E1/E2/E3 一致

### 2.5 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/__tests__/system-prompt.test.ts` | 新增 | 6 场景快照测试 |
| `packages/core/src/__tests__/__snapshots__/system-prompt.snap.json` | 新增 | golden 快照 |

---

## 3. 初始化顺序

Phase F 不改变任何初始化顺序。
- F1 仅在 runner 回调链 + Desktop 渲染层加代码
- F2 纯测试，无运行时影响

---

## 4. 兼容性

- 旧版 Desktop 不识别 `interactive` 事件 → 忽略（不影响纯文本对话）
- Agent 不一定每次都输出 `:::interactive` → 完全可选能力
- 快照测试不阻塞 CI（若未来加 CI，可配置为 precommit hook）
