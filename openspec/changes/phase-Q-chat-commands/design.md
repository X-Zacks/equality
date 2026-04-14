# Design: Phase Q — Chat Commands

> Based on: proposal.md + specs/gateway/spec.md

## 架构设计

### 文件结构

```
packages/core/src/
  commands/
    types.ts          ← ChatCommand 类型定义
    registry.ts       ← ChatCommandRegistry 类
    parser.ts         ← 解析 /command args 格式
    builtins/
      index.ts        ← 注册所有内建指令
      status.ts       ← /status 实现
      new-session.ts  ← /new 实现
      reset.ts        ← /reset 实现
      compact.ts      ← /compact 实现
      usage.ts        ← /usage 实现
      model.ts        ← /model 实现
      help.ts         ← /help 实现
  index.ts            ← 新增 POST /chat/command 路由

packages/desktop/src/
  components/
    CommandPalette.tsx ← / 指令补全菜单（前端）
```

### 核心类型

```typescript
// commands/types.ts

export interface ChatCommandContext {
  sessionKey: string
  /** 当前 session（可能为 null） */
  session: Session | null
  /** 获取模型列表 */
  getAvailableModels: () => string[]
}

export interface ChatCommandResult {
  /** 结构化结果数据 */
  data: Record<string, unknown>
  /** 给用户看的格式化文本 */
  display: string
}

export interface ChatCommandDefinition {
  /** 指令名（不含 /） */
  name: string
  /** 简要说明 */
  description: string
  /** 参数格式提示 */
  usage?: string
  /** 执行函数 */
  execute: (args: string[], ctx: ChatCommandContext) => Promise<ChatCommandResult>
}
```

### 数据流

```
用户输入 "/status"
        │
        ▼
[Desktop] POST /chat/command { sessionKey, input: "/status" }
        │
        ▼
[Core index.ts] 路由 /chat/command
        │
        ▼
[parser.ts] parseChatCommand("/status") → { name: "status", args: [] }
        │
        ▼
[registry.ts] chatCommandRegistry.get("status") → definition
        │
        ▼
[status.ts] definition.execute([], ctx) → ChatCommandResult
        │
        ▼
[Core] → { ok: true, command: "status", result: { data, display } }
        │
        ▼
[Desktop] 渲染 result.display 为系统消息
```

### 关键设计决策

1. **指令不走 LLM**：`/` 开头的输入直接执行，不发送给 AI 模型
2. **即时返回**：不走 SSE 流，使用普通 JSON 响应，延迟 < 100ms
3. **可扩展**：插件通过 `chatCommandRegistry.register()` 注册新指令
4. **前端拦截**：desktop 在发送消息前检查是否为指令，调用 `/chat/command` 而非 `/chat/stream`
5. **上下文注入**：每个指令通过 `ChatCommandContext` 获取 session、模型列表等运行时状态

### HTTP API 设计

```
POST /chat/command
Body: { sessionKey: string, input: string }
Response:
  成功: { ok: true, command: string, result: ChatCommandResult }
  失败: { ok: false, error: string }

GET /chat/commands
Response: { commands: Array<{ name, description, usage }> }
```

### 前端 / 补全行为

1. 用户在输入框键入 `/` 时触发
2. 展示已注册指令列表（通过 `GET /chat/commands` 获取）
3. 支持模糊匹配过滤（如输入 `/st` 过滤出 `/status`）
4. 选中后自动填充指令名
5. 按回车发送（如果参数完整）或补充参数提示

### 安全考虑

- `/reset` 需要二次确认（前端弹窗 "确认清空？"），core 侧不阻断
- 指令执行不继承 `securityBeforeToolCall`（指令不是工具）
- 参数长度限制：每个参数最大 200 字符，args 最多 10 个
