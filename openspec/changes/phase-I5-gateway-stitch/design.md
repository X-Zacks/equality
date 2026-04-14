# Design: Phase I.5 — Gateway 缝合

---

## G1: codebase_search 工具注册

**变更文件**: `packages/core/src/tools/builtins/index.ts`

**方案**: 在 import 区和 builtinTools 数组中添加 codebaseSearchTool。

**边界考虑**:
- codebase-search.ts 依赖 indexer/ 模块，首次调用时延迟构建索引
- 不影响现有工具，纯追加
- 工具名 `codebase_search` 与 OpenClaw 一致

---

## G2: Hooks 框架接入 runner

**变更文件**: `packages/core/src/agent/runner.ts`

**方案**: 在 runner.ts 中 import globalHookRegistry，在 4 个关键节点调用 invoke：
1. `beforeToolCall` — 工具执行前（已有 params.beforeToolCall，新增 hooks 链路）
2. `afterToolCall` — 工具执行后（已有 params.afterToolCall，新增 hooks 链路）
3. `beforeLLMCall` — 每轮 LLM 调用前（toolLoop 开头）
4. `afterLLMCall` — 每轮 LLM 流式读取完毕后

**边界考虑**:
- hooks 调用失败不阻塞主流程（catch + warn）
- beforeToolCall hook 的 block 逻辑与现有 params.beforeToolCall 共存：先 params hook，再 globalHookRegistry
- hooks 是 async，但 runner 已经是 async，无性能问题
- 不改变 params.beforeToolCall/afterToolCall 的现有契约

---

## G3: Session 生命周期事件发射

**变更文件**: `packages/core/src/session/store.ts`

**方案**: import emitSessionEvent，在关键操作后发射：
- `getOrCreate` — 新建时发 `session:created`，从磁盘恢复时发 `session:restored`
- `reap` — 回收时发 `session:reaped`

**index.ts 补充**:
- 删除 session 时发 `session:destroyed`
- persist 后发 `session:persisted`

**边界考虑**:
- emitSessionEvent 是同步的，单个 handler 异常已隔离
- 不改变 getOrCreate / reap 的返回值
- 只在状态真正变化时发射（如 getOrCreate 从缓存命中不发射）

---

## G4: Config 验证接入启动

**变更文件**: `packages/core/src/index.ts`

**方案**: 在 initSecrets() 之后调用 validateConfig()，验证结果仅 warn 不阻断启动。

**边界考虑**:
- 当前 secrets 存储为 flat KV，validateConfig 需要先从 listSecrets() 构造 Record
- 验证失败打 warn 日志但不 throw（不破坏现有启动流程）
- 为未来严格模式预留 strict 参数

---

## G5-G9: 渐进增强（本次暂留 design，实施可在后续迭代）

G5 (WebSearchRegistry)、G6 (CommandQueue)、G7 (Links hook)、G8 (Plugin loader)、G9 (Structured Logger) 属于"锦上添花"型改动，本轮优先实施 G1-G4 以保证运行时核心能力完整，G5-G9 在验证 G1-G4 无回归后推进。
