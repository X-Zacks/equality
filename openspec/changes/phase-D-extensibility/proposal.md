# Proposal: Phase D — 可扩展性（GAP-6, GAP-7, GAP-11 + C1/C3 集成缝合）

> 作为 Equality 编程助手，打通安全管道与运行时的集成、支持外部工具协议、增强长对话的上下文稳定性。

---

## 一、为什么做

### 1.1 安全管道的"最后一公里"

Phase C 构建了三个安全模块（C1 变异分类、C2 Bash 沙箱、C3 策略管道），但运行时集成状态如下：

| 模块 | 运行时集成 | 问题 |
|------|:--------:|------|
| C1 `mutation.ts` | ⚠️ 部分 | `isMutatingOperation()` 被 `runner.ts:guardUnsupportedSuccessClaims` 调用，但核心的 `classifyMutation()` 和 `extractFingerprint()` **从未被运行时调用** |
| C2 `bash-sandbox.ts` | ✅ 已集成 | `bash.ts` 在 spawn 前调用 `validateBashCommand()` |
| C3 `policy-pipeline.ts` | ❌ 未集成 | `resolvePolicyForTool()` 和 `applyToolPolicy()` 均**无运行时调用者**。`index.ts` 的 `runAttempt()` 调用**从未传入** `beforeToolCall` hook |

**结论**：Phase C 的 111 个测试验证了模块的内部正确性，但 C1/C3 是"枪已造好但没装上膛"。Phase D 首先需要缝合这个集成缺口。

### 1.2 工具生态封闭

当前 Agent 只能使用内置的 22 个工具。无法连接外部 MCP 工具服务器，限制了 Agent 的能力扩展。

**OpenClaw 参考**：`pi-bundle-mcp-runtime.ts`（310 行），支持 stdio / SSE / streamable-http 三种传输，会话级隔离的 MCP 连接。

### 1.3 长对话上下文丢失

当前 Compaction 是单次摘要（`compactIfNeeded()`），对超长历史（>50 轮工具调用）会丢失关键标识符（UUID、文件路径、变量名）。

**OpenClaw 参考**：`compaction.ts`（529 行），自适应分块 → 并行摘要 → 合并，标识符保护策略。

### 1.4 上下文引擎不可扩展

当前 `ContextEngine` 接口仅有 `assemble()` / `afterTurn()` 两个方法，无法在工具执行前后、Compaction 前后注入逻辑。

---

## 二、做什么

**四个子阶段，按依赖顺序执行：**

### D1. 安全管道集成缝合

**目标**：将 C1/C3 真正缝入 `runner.ts` 工具执行管道。

```
当前 tool 执行流:
  LLM → tool_calls → beforeToolCall(未接入) → tool.execute → afterToolCall(未接入) → LoopDetector

Phase D1 后:
  LLM → tool_calls → C3 策略检查 → C1 分类+risk标记 → tool.execute → audit log → LoopDetector
```

**影响范围**：
- `index.ts`：构造 `beforeToolCall` 回调，内部调用 `resolvePolicyForTool()`
- `runner.ts`：**不修改**（`beforeToolCall` hook 已存在，只需 index.ts 传入）
- `policy-pipeline.ts`：不变
- `mutation.ts`：不变

### D2. MCP 客户端（GAP-6）

**目标**：支持连接外部 MCP 工具服务器，将 MCP 工具注册到 ToolRegistry。

```
设置页 "MCP 服务器" → 配置 → 启动时连接 → 工具发现 → 注册到 ToolRegistry → Agent 可调用
```

**影响范围**：
- 新增 `tools/mcp/client.ts`：MCP 客户端（stdio 传输优先）
- 新增 `tools/mcp/bridge.ts`：MCP 工具 → ToolDefinition 适配
- `index.ts`：启动时读取 MCP 配置、创建客户端、注册工具
- `config/secrets.ts`：新增 `MCP_SERVERS` 配置键

### D3. Compaction 分段压缩（GAP-7）

**目标**：增强 Compaction 的信息保留度，支持分段摘要和标识符保护。

**影响范围**：
- `context/compaction.ts`：重写核心逻辑（分块 + 并行摘要 + 合并）
- 新增 `context/identifier-shield.ts`：标识符保护（UUID/hash/URL/路径正则）
- `context/default-engine.ts`：不变（只调用 `compactIfNeeded`）

### D4. 可插拔上下文引擎（GAP-11）

**目标**：扩展 ContextEngine 生命周期，支持 `beforeTurn` / `afterToolCall` / `beforeCompaction` 钩子。

**影响范围**：
- `context/types.ts`：扩展 `ContextEngine` 接口
- `context/default-engine.ts`：实现新的生命周期方法
- `runner.ts`：在工具执行前后调用新的引擎方法（仅新增调用点，不改现有逻辑）

---

## 三、不做什么

- ❌ MCP 服务器端暴露（Phase E+）
- ❌ 多 Agent 编排（Phase E：GAP-8）
- ❌ 后台任务注册中心（Phase E：GAP-9）
- ❌ Provider Failover 增强（Phase E：GAP-12）
- ❌ 交互式 UI 载荷（Phase F：GAP-14）
- ❌ UI 侧的 "需要审批" 弹窗（D1 仅标记 requiresApproval，不做 UI 阻塞等待）

---

## 四、预期收益

| 子阶段 | GAP | 收益 |
|--------|-----|------|
| D1 | C1+C3 | Phase C 安全模块从"库函数"变为"运行时保护"，高危工具被策略管道拦截 |
| D2 | GAP-6 | Agent 能力从 22 个内置工具扩展到任意 MCP 工具服务器 |
| D3 | GAP-7 | 长对话（>50轮）不再丢失文件路径和 UUID，摘要质量提升 |
| D4 | GAP-11 | 第三方插件可替换默认上下文引擎，Compaction 前后可注入自定义逻辑 |

---

## 五、依赖关系

```
D1（安全缝合）──────────────────► D4（上下文引擎扩展）
       │                               │
       │  无依赖                        │ afterToolCall 用于审计
       ▼                               ▼
D2（MCP 客户端）            D3（Compaction 分段）
       │                               │
       └── MCP 工具需要策略管道 ──── D1 ─┘
```

**建议执行顺序**：D1 → D3 → D4 → D2（D1 先行解除阻塞，D2 最独立可并行但依赖 D1 策略检查）
