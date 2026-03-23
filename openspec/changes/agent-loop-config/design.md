# Design: Agent Loop Config

## 1. 变更概述

4 个文件，改动量均为小改：

| 文件 | 改动 |
|------|------|
| `packages/core/src/config/secrets.ts` | `KEY_NAMES` 追加 2 个键 |
| `packages/core/src/tools/loop-detector.ts` | `LoopDetector` 构造函数接受可选 `circuitBreakerLimit` 参数 |
| `packages/core/src/agent/runner.ts` | `MAX_TOOL_LOOP` 改为从配置读，创建 `LoopDetector` 时传入配置值 |
| `packages/desktop/src/Settings.tsx` | 「性能设置」区域新增工具上限 + 轮次上限两个输入项 |

---

## 2. secrets.ts — 新增 KEY_NAMES

```typescript
const KEY_NAMES = [
  // ...现有键...
  'BASH_TIMEOUT_MS',
  'BASH_IDLE_TIMEOUT_MS',
  'BASH_MAX_TIMEOUT_MS',
  // 新增：
  'AGENT_MAX_TOOL_CALLS',   // 工具调用断路器上限
  'AGENT_MAX_LLM_TURNS',    // LLM 轮次上限
  // ...
] as const
```

---

## 3. loop-detector.ts — 构造函数参数

### 现状

```typescript
const CIRCUIT_BREAKER_LIMIT = 30   // 硬编码常量
```

`LoopDetector` 构造函数无参数，直接使用常量。

### 修改后

```typescript
const DEFAULT_CIRCUIT_BREAKER_LIMIT = 50
const MAX_CIRCUIT_BREAKER_LIMIT = 500

export class LoopDetector {
  private readonly circuitBreakerLimit: number

  constructor(circuitBreakerLimit?: number) {
    this.circuitBreakerLimit = Math.min(
      circuitBreakerLimit ?? DEFAULT_CIRCUIT_BREAKER_LIMIT,
      MAX_CIRCUIT_BREAKER_LIMIT
    )
  }
  // ...
}
```

`checkCircuitBreaker()` 内部使用 `this.circuitBreakerLimit` 而不是常量。

---

## 4. runner.ts — 读取配置

### 工具函数（复用 bash.ts 的模式）

```typescript
function getAgentConfigNumber(key: SecretKey, defaultVal: number, min: number, max: number): number {
  const raw = getSecret(key)
  if (!raw) return defaultVal
  const v = parseInt(raw, 10)
  if (isNaN(v) || v < min) return defaultVal
  return Math.min(v, max)
}
```

### 使用

```typescript
// 常量改为运行时读取（每次 runAttempt 调用时读，支持热更新）
const maxLlmTurns = getAgentConfigNumber('AGENT_MAX_LLM_TURNS', 50, 1, 500)
const maxToolCalls = getAgentConfigNumber('AGENT_MAX_TOOL_CALLS', 50, 1, 500)

const loopDetector = new LoopDetector(maxToolCalls)

// toolLoop: while (loopCount < maxLlmTurns) { ... }
```

> **为什么在 runAttempt 内读，而不是模块初始化时读**：支持用户改完设置后立即生效，不需要重启 Core。

---

## 5. Settings.tsx — UI 新增

在「性能设置」区域（bash 超时三项之后）新增独立分组「🔁 Agent 循环上限」：

```
┌─ 🔁 Agent 循环上限 ──────────────────────────┐
│  工具调用上限      [____50____] 次             │
│  说明：单次任务最多执行多少次工具调用。         │
│  写大型项目时可适当调高（建议 100-300）。       │
│                                              │
│  LLM 轮次上限      [____50____] 次             │
│  说明：单次任务最多发起多少轮 LLM 调用。        │
│  通常保持默认，工具上限是更常见的瓶颈。         │
│                                        [保存] │
└──────────────────────────────────────────────┘
```

保存按钮独立（不与 bash 超时合并），`handleSave('agentLoop', ['AGENT_MAX_TOOL_CALLS', 'AGENT_MAX_LLM_TURNS'])`。

---

## 6. 默认值变更说明

| 参数 | 旧默认 | 新默认 | 原因 |
|------|--------|--------|------|
| 工具调用断路器 | 30 | **50** | 30 太保守，写 25 个接口就触发；50 与 LLM 轮次对齐 |
| LLM 轮次 | 50 | **50** | 保持不变 |

---

## 7. 典型场景计算

**写 100 接口 Python 服务**：
- 每接口：`write_file` × 1 + `bash` 验证 × 1 = 2 次工具调用
- 100 接口 = 200 次工具调用
- 建议设置：`AGENT_MAX_TOOL_CALLS = 250`（留 25% 余量）

**5 小时不间断任务**：
- 时间不是限制（无时间上限），工具次数才是
- 估算：平均每轮 LLM 2 次工具调用，200 轮 LLM = 400 次工具调用
- 建议设置：`AGENT_MAX_TOOL_CALLS = 400`、`AGENT_MAX_LLM_TURNS = 200`
