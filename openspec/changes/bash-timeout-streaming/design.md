# Design: Bash 超时重构 & 流式输出

> 变更：bash-timeout-streaming  
> 依赖：[proposal.md](./proposal.md) | [specs/tools/spec.md](./specs/tools/spec.md)

---

## 1. 超时模型

### 1.1 双超时架构

```
bash spawn(child)
  │
  ├── idleTimer: 每次收到 stdout/stderr 时重置
  │     └── 到期 → killTree(pid) + resolve("无输出超时")
  │
  └── overallTimer: 一次性定时器
        └── 到期 → killTree(pid) + resolve("总超时")
```

### 1.2 超时值来源（优先级高→低）

```
① LLM 传入的 input.timeout_ms（受 BASH_MAX_TIMEOUT_MS 钳位）
② settings.json 中的 BASH_TIMEOUT_MS
③ 代码默认值 DEFAULT_TIMEOUT_MS = 300_000
```

idle timeout 始终来自 settings.json 或默认值，LLM 不能控制。

### 1.3 与 OpenClaw 对比

| 维度 | OpenClaw exec | OpenClaw pi-bash | Equality（本设计） |
|---|---|---|---|
| 默认总超时 | 30 分钟 | 无 | **5 分钟** |
| 无输出超时 | 有（supervisor 层） | 无 | **120 秒** |
| 最大总超时 | 无上限 | 无上限 | **30 分钟** |
| 后台模式 | 10s yield | 无 | 保持现有 background=true |
| 流式输出 | onUpdate 回调 | onUpdate 回调 | **onUpdate 回调** |

选择 5 分钟而非 30 分钟作为默认值的理由：
- Equality 是桌面应用，用户期望较快响应
- 有 idle timeout 兜底，持续有输出的命令不会被误杀
- 真正长时间的任务应使用 `background=true` 模式

---

## 2. 流式输出数据流

```
bash child.stdout ──► onData(chunk)
                        │
                        ├── chunks.push(chunk)           // 收集完整输出
                        ├── resetIdleTimer()              // 重置无输出超时
                        └── throttledUpdate(last500chars)  // 节流推送
                              │
                              ▼
                    onUpdate(partial: string)              // ToolDefinition 回调
                              │
                              ▼
                    runner.onToolUpdate({ toolCallId, partial })
                              │
                              ▼
                    SSE: { type: "tool_update", toolCallId, content }
                              │
                              ▼
                    Tauri: event "chat-delta" { type: "tool_update", ... }
                              │
                              ▼
                    useGateway.ts: onToolCall({ status: "running", partial })
                              │
                              ▼
                    Chat.tsx: 工具卡片显示 partial 内容
```

### 2.1 节流策略

```typescript
let lastUpdateTime = 0
const THROTTLE_MS = 500

function throttledUpdate(text: string) {
  const now = Date.now()
  if (now - lastUpdateTime < THROTTLE_MS) return
  lastUpdateTime = now
  onUpdate?.(text.slice(-500))  // 最后 500 字符
}
```

---

## 3. Settings 配置设计

### 3.1 存储

复用现有 `secrets.ts` 的 `settings.json`。配置项和 API Key 混存于同一个 JSON：

```json
{
  "DEEPSEEK_API_KEY": "sk-xxx",
  "HTTPS_PROXY": "http://10.62.216.80:8000",
  "BASH_TIMEOUT_MS": "300000",
  "BASH_IDLE_TIMEOUT_MS": "120000",
  "BASH_MAX_TIMEOUT_MS": "1800000"
}
```

### 3.2 读取方式

bash.ts 中通过 `getSecret(key)` 读取，与读 API Key 方式一致：

```typescript
import { getSecret } from '../../config/secrets.js'

function getConfigNumber(key: SecretKey, defaultVal: number, min: number, max: number): number {
  const raw = getSecret(key)
  if (!raw) return defaultVal
  const num = Number(raw)
  if (!Number.isFinite(num)) {
    console.warn(`[bash] 配置 ${key} 值无效: "${raw}", 使用默认值 ${defaultVal}`)
    return defaultVal
  }
  return Math.min(max, Math.max(min, num))
}
```

### 3.3 KEY_NAMES 扩展

`secrets.ts` 的 `KEY_NAMES` 数组新增三项：

```typescript
const KEY_NAMES = [
  // ... existing ...
  'BASH_TIMEOUT_MS',
  'BASH_IDLE_TIMEOUT_MS',
  'BASH_MAX_TIMEOUT_MS',
] as const
```

### 3.4 前端设置页面

**高级设置作为独立 Tab**，与模型、工具、Skills、关于并列于顶部导航栏：

```
[ 🤖 模型 ]  [ 🔧 工具 ]  [ 📚 Skills ]  [ ⚙️ 高级 ]  [ ℹ️ 关于 ]
```

高级 Tab 内部：

```
─── ⚡ 性能设置 ─────────────────

Bash 默认超时 (ms)   [  300000  ]
  bash 前台命令的默认总超时。最小 5000ms，默认 5分钟。

Bash 无输出超时 (ms) [  120000  ]
  命令在此时间内无任何输出则判定卡死。设为 0 禁用。默认 2分钟。

Bash 最大超时 (ms)   [ 1800000  ]
  bash 命令的总超时上限。默认 30分钟。

                              [ 保存 ]
```

**不采用"塞到模型 Tab 底部"方案**，理由：
- 高级设置与模型配置概念正交，不应混放
- 模型 Tab 已经较长，继续追加影响可发现性
- 独立 Tab 与现有导航风格一致，布局规整

---

## 4. 改动文件清单

### 4.1 Core 层（5 文件）

| 文件 | 改动 |
|---|---|
| `config/secrets.ts` | KEY_NAMES 新增 3 个配置项 |
| `tools/types.ts` | `execute` 签名加 `onUpdate?` 参数 |
| `tools/builtins/bash.ts` | 双超时 + 流式 onUpdate + 读配置 |
| `agent/runner.ts` | 传 `onUpdate` 回调 + `onToolUpdate` 事件 |
| `index.ts` | SSE 发 `tool_update` 事件 |

### 4.2 Desktop 层（4 文件）

| 文件 | 改动 |
|---|---|
| `src-tauri/src/proxy.rs` | 透传 `tool_update` SSE 事件（已有通用逻辑，可能无需改） |
| `src/useGateway.ts` | 处理 `tool_update` 事件类型 |
| `src/Chat.tsx` | 工具卡片显示 `partial` 实时输出 |
| `src/Settings.tsx` | 新增高级设置区域 |

---

## 5. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 默认总超时 | 5 分钟（非 OpenClaw 的 30 分钟） | 桌面应用场景，更偏交互式；有 idle timeout 保护长任务 |
| idle timeout | 120 秒 | 比 OpenClaw fresh 模式的 180s 短，桌面场景反馈要更快 |
| 流式推送截断 | 最后 500 字符 | 只需让用户看到"最新在做什么"，不需要完整 log |
| 节流 | 500ms | 平衡实时性和 SSE 频率 |
| 配置存储 | 复用 settings.json | 不引入新的配置文件，保持简单 |
| 配置值类型 | string（json 中） | 与现有 KEY_NAMES 保持一致格式 |
