# Subtask（子任务）机制分析与改进建议

> 分析日期：2026-04-25

---

## 一、问题 1：Subtask 目前是否并行执行？

### 结论：**是的，天然支持并行，但取决于 LLM 的调用方式**

### 并行的两个层面

#### 层面 A：Runner 的工具并发执行 ✅ 已支持

`runner.ts` 中，当 LLM 在一个回合返回多个 `tool_calls` 时，**所有工具通过 `Promise.allSettled` 并发执行**：

```
runner.ts L936: // 每个工具独立封装为 async 函数，Promise.allSettled 并发启动，保序汇总
runner.ts L1069: const settled = await Promise.allSettled(executions)
```

这意味着：如果 LLM 在一个回合同时发出 3 个 `subtask_spawn` 调用，这 3 个子任务会**同时启动**，并行执行。

#### 层面 B：SubtaskManager.spawnParallel ✅ 已实现但未被工具暴露

`subtask-manager.ts` 中实现了 `spawnParallel()` 方法，带有并发信号量控制（默认 `maxConcurrent=5`）：

```typescript
// subtask-manager.ts L155
async spawnParallel(parentSessionKey, items, opts?) {
  // 并发信号量
  // 创建所有任务的 promise
  // await Promise.allSettled(promises)
}
```

**但 `subtask_spawn` 工具只暴露了 `spawn()`（单个任务），没有暴露 `spawnParallel()`。**

### 实际行为

| 场景 | 是否并行 | 原因 |
|------|----------|------|
| LLM 一个回合发出 3 个 `subtask_spawn` | ✅ 并行 | Runner 的 `Promise.allSettled` 并发执行 |
| LLM 分 3 个回合各发 1 个 `subtask_spawn` | ❌ 串行 | 每次 spawn 都 `await` 结果后才返回给 LLM |
| 代码调用 `spawnParallel()` | ✅ 并行 | 但目前无工具入口 |

### 关键限制

`subtask_spawn` 的 `execute` 函数是 **`await _manager.spawn()`**——会阻塞直到子任务完成。所以：

- **能否并行取决于 LLM 是否在同一回合发出多个 subtask_spawn 调用**
- 实践中，大部分模型倾向于一个回合只发一个 `subtask_spawn`，导致**实际表现为串行**
- 即使模型发出多个，也受限于 `DEFAULT_SUBTASK_CONFIG.maxConcurrent = 5`

### 改进建议

1. **方案 A：新增 `subtask_spawn_parallel` 工具**  
   暴露 `spawnParallel()`，接受一个任务数组，一次性并行启动多个子任务。这样即使 LLM 只发一个 tool_call 也能并行。

2. **方案 B：`subtask_spawn` 增加 `wait: false` 参数（fire-and-forget）**  
   不等待结果，立即返回 `taskId`，LLM 后续通过 `subtask_list` 查询状态。  
   **风险**：LLM 可能忘记检查结果，或结果丢失。

3. **方案 C（推荐）：在 system prompt 中引导 LLM 一次发出多个 subtask_spawn**  
   最小改动，利用 Runner 已有的并发能力。

---

## 二、问题 2：Subtask 模型选择不遵循用户选择

### 结论：**确认存在此问题**

### 根因分析

```
调用链:
  用户选择模型 (前端)
    → /chat endpoint (index.ts)
      → runAttempt({ ...无 provider 参数... })
        → routeModel(userMessage, params.provider=undefined, ...)
          → 自动路由（按消息复杂度分类选模型）
```

**主会话**和**子任务**都没有显式传 `provider`，都走 `routeModel()` 自动路由。

但区别在于：
- **主会话**：用户可以在消息中用 `@model` 语法指定模型，`routeModel()` 会解析
- **子任务**：`prompt` 是 Agent 自动生成的，**不会包含 `@model` 指令**，所以永远走自动路由

### 代码证据

```typescript
// subtask-manager.ts L253 — executeChild
const result = await this.deps.runAttempt({
  sessionKey: childSessionKey,
  userMessage: params.prompt,
  abortSignal: abortController.signal,
  // ❌ 没有传 provider — 子任务永远走自动路由
  toolRegistry: this.deps.defaults?.toolRegistry,
  allowedTools: params.allowedTools,
  ...
})
```

```typescript
// subtask-types.ts — SpawnSubtaskParams 中定义了 model 字段但未使用
export interface SpawnSubtaskParams {
  prompt: string
  goal?: string
  allowedTools?: string[]
  model?: string          // ← 定义了但从未传递给 runAttempt
  timeoutMs?: number
}
```

### 影响

| 场景 | 用户期望 | 实际行为 |
|------|----------|----------|
| 用户选了 Claude Opus → Agent 发起子任务 | 子任务也用 Claude Opus | ❌ 子任务按复杂度自动选模型（可能选到 GPT-4o） |
| 用户选了便宜模型节省费用 | 子任务也用便宜模型 | ❌ 子任务可能选到贵的模型 |
| 用户用国内模型（网络原因） | 子任务也用国内模型 | ❌ 子任务可能选到需要翻墙的模型 |

### 改进方案

需要修改的文件和位置：

#### 1. `index.ts`：SubtaskManager 初始化时传入当前 provider 获取方式

**问题**：SubtaskManager 在启动时创建（一次性），但用户的模型选择是**每次请求**不同的。所以不能在 init 时固定 provider。

#### 2. 推荐方案：请求级 provider 透传

```
/chat endpoint 
  → 解析用户选择的 provider
  → 存入 per-session 变量
  → SubtaskManager.spawn() 读取父 session 的 provider
  → executeChild() 传给 runAttempt({ provider })
```

具体改动点：

| 文件 | 改动 |
|------|------|
| `subtask-types.ts` | `SpawnSubtaskParams.model` 改为 `provider?: LLMProvider` |
| `subtask-manager.ts` | `executeChild()` 将 `params.provider` 传给 `runAttempt()` |
| `subtask-spawn.ts` | 从 `ctx` 中获取当前会话的 provider 信息传入 |
| `index.ts` | 在 `/chat` 处理中将用户选择的 provider 关联到 sessionKey |
| `runner.ts` 的 `RunAttemptParams` | 确保 `provider` 参数被正确使用 |

**或者更简单的方案**：在 SubtaskManager.defaults 中增加一个 `getProviderForSession(sessionKey)` 回调，每次 spawn 时动态获取父会话的 provider。

---

## 三、问题 3：Subtask 超时时间分析

### 结论：**默认 300 秒（5 分钟），但 LLM 可以传更短的值**

### 超时机制

```typescript
// subtask-spawn.ts L67
const DEFAULT_TIMEOUT_SECONDS = 300  // 5 minutes
const timeoutMs = (input.timeout_seconds
  ? Number(input.timeout_seconds)
  : DEFAULT_TIMEOUT_SECONDS) * 1000
```

```typescript
// subtask-manager.ts L229 — executeChild
if (params.timeoutMs) {
  timer = setTimeout(() => {
    abortController.abort()
    registry.transition(taskId, 'timed_out', `超时 ${params.timeoutMs}ms`)
  }, params.timeoutMs)
}
```

### 你看到的 180 秒

180 秒不是代码硬编码的值，而是 **LLM 自行决定传的参数**。`subtask_spawn` 的 `timeout_seconds` 参数描述是：

> "Subtask timeout in seconds, default 300"

LLM 在调用时可能根据自己的判断传了 `timeout_seconds: "180"`。

### 为什么 180 秒不够？

图片识别任务的耗时链：

```
subtask_spawn 启动
  → runAttempt 初始化 session + 构建 system prompt
  → LLM 首次推理（规划要做什么）~10-30s
  → 调用 read_image 工具
    → 读取图片 + base64 编码
    → 发送给视觉模型 API
    → 等待视觉模型响应 ~30-120s（取决于图片大小和模型负载）
  → LLM 处理视觉结果 + 生成回复 ~10-30s
  → 如果有多轮工具调用，每轮都要重复上述过程
```

**单张图片识别**大约需要 60-180 秒。如果子任务包含**多张图片**或**多轮推理**，300 秒都可能不够。

### 改进方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A：改大默认值** | 默认改为 600s 或 900s | 最简单 | 仍然是硬限制，特殊任务可能不够 |
| **B：允许无超时** | `timeout_seconds=0` 表示不限制 | 灵活 | 可能导致僵尸任务永不结束 |
| **C（推荐）：无超时 + 自动清理** | 默认不限超时，但加全局最大存活时间（如 30 分钟）+ 死锁检测 | 灵活+安全 | 实现稍复杂 |
| **D：按任务类型动态超时** | 检测 allowed_tools 包含 read_image/image_generate 时自动延长 | 智能 | 难以覆盖所有场景 |

### 推荐方案 C 的具体设计

```
1. subtask_spawn 工具：
   - timeout_seconds 默认值改为 0（不限制）
   - 工具 description 更新为："default 0 (no limit)"

2. subtask-manager.ts：
   - timeoutMs=0 或 undefined 时不设置 setTimeout
   - 新增全局安全阀：MAX_SUBTASK_LIFETIME = 30 * 60 * 1000（30 分钟）
   - 超过安全阀时强制终止 + 记录 warning

3. 定期清理：
   - SubtaskManager 增加 housekeeping 定时器（每 5 分钟检查一次）
   - 清理超过 MAX_SUBTASK_LIFETIME 的僵尸任务
```

---

## 四、改动总结与优先级

| 优先级 | 问题 | 改动范围 | 工作量 |
|--------|------|----------|--------|
| 🔴 P0 | 子任务不遵循用户模型选择 | `subtask-manager.ts` + `index.ts` + `subtask-spawn.ts` | 中（需要设计 provider 透传机制） |
| 🟡 P1 | 超时时间不合理 | `subtask-spawn.ts` + `subtask-manager.ts` | 小（改默认值 + 支持 0=无限制 + 安全阀） |
| 🟢 P2 | 并行执行优化 | 可选：新增工具 或 system prompt 引导 | 小-中 |

### P0 模型透传 — 推荐实现路径

```
1. index.ts: 在 /chat endpoint 中，解析完 provider 后存入 Map<sessionKey, LLMProvider>
2. SubtaskManager: 构造时接受 getParentProvider(sessionKey) 回调
3. executeChild(): 调用 getParentProvider(parentSessionKey) 获取父会话 provider
4. runAttempt(): 将 provider 传入，routeModel() 中 explicitProvider 不为空时直接使用
```

### P1 超时改进 — 推荐实现路径

```
1. subtask-spawn.ts: DEFAULT_TIMEOUT_SECONDS = 0
2. subtask-spawn.ts: description 改为 "default 0 (no timeout limit)"
3. subtask-manager.ts: timeoutMs <= 0 时不设 setTimeout
4. subtask-manager.ts: 新增 MAX_SUBTASK_LIFETIME = 30 * 60 * 1000 安全阀
5. subtask-manager.ts: constructor 中启动 housekeeping 定时器
```

---

## 五、讨论点

1. **P0 模型透传**：是传完整 `LLMProvider` 对象，还是只传 `providerId + modelId` 让子任务自己创建？前者更简单但可能有状态问题，后者更干净。

2. **P1 超时**：0 = 无限制后，是否需要在前端 UI 上给用户一个手动终止子任务的按钮？（目前 `subtask_kill` 只能由 Agent 自己调用）

3. **P2 并行**：是否值得新增 `subtask_spawn_parallel` 工具？还是先通过 system prompt 引导模型一次发多个 `subtask_spawn` 就够了？
