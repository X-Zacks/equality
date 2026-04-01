# Equality vs OpenClaw 工程能力差距分析（2026.3.31 更新）

> 基于 `example/openclaw-2026.3.31` 最新代码的全面对比分析。
> 目标：明确 Equality 需要补齐的关键差距，之后逐项实现。

---

## 一、差距总览

### 缺失状态图例

| 标记 | 含义 |
|------|------|
| 🔴 | 完全缺失 — Equality 无对应模块 |
| 🟡 | 基础版 — Equality 有初步实现，覆盖 < 50% |
| 🟢 | 接近对齐 — Equality 已有等价实现 |

---

## 二、核心差距清单（按优先级排序）

### GAP-1 🔴 错误反馈自动重试（P0）

**现状**：`bash` 返回 stderr + exit code，但 runner 层无自动识别编译/测试失败并重试的能力。模型需自行判断是否继续修复。

**OpenClaw 实现**：
- `run.ts`（1476 行）：完整的多层重试循环
  - Context overflow → 自动触发 compaction → 重试（最多 160 轮）
  - Auth 失败 → 自动轮换 profile 继续
  - Rate limit → 降级 thinking level → fallback model
- `failover-policy.ts`：按故障类型分类决策（rate_limit / overloaded / billing / auth）
- `configured-provider-fallback.ts`：默认 provider 不可用时自动扫描替代

**竞品 Cursor/VSCode Agent**：run → 捕获编译错误 → 自动 re-prompt 修复

**Equality 补齐方向**：
1. runner 层识别 bash isError=true 且为编译/测试错误时，自动追加错误上下文到 messages 并 continue toolLoop
2. 增加 provider 级 failover：rate_limit → 换 profile / 降级 / fallback model
3. context overflow → 自动 compact → 重试

---

### GAP-2 🔴 LSP 语义代码理解（P0）

**现状**：纯文件 grep/glob，无 AST/类型/引用/诊断能力。Agent 做多文件重构时极容易遗漏引用。

**OpenClaw 实现**：
- `pi-bundle-lsp-runtime.ts`（310 行）：完整 LSP 客户端
  - JSON-RPC 帧协议（Content-Length）+ stdio 传输
  - `initialize` → `initialized` → 正常请求 → `shutdown` → `exit` 完整生命周期
  - 按 server capabilities 动态生成 `lsp_hover_*` / `lsp_definition_*` / `lsp_references_*` 工具
  - 10s 请求超时保护
- `embedded-pi-lsp.ts`：Bundle LSP 服务器配置加载与合并

**Equality 补齐方向**：
1. 新增 `tools/builtins/lsp.ts`：启动 tsserver/pyright 等 LSP 服务器
2. 暴露 `lsp_hover`、`lsp_definition`、`lsp_references`、`lsp_diagnostics` 工具给 Agent
3. 会话级 LSP 进程管理（启动/缓存/超时关闭）

---

### GAP-3 🔴 工具循环检测增强（P0）

**现状**：基础 LoopDetector（基于 args hash），仅有 generic repeat 检测 + 全局熔断。

**OpenClaw 实现**（`tool-loop-detection.ts`，624 行）：
- **四重检测器**：
  1. `generic_repeat`：连续相同 (name, argsHash) 检测
  2. `known_poll_no_progress`：轮询同一资源但结果哈希不变（resultHash 追踪）
  3. `ping_pong`：A-B-A-B 交替调用检测
  4. `global_circuit_breaker`：任意工具总调用数超限
- **三级阈值**：warning(10) → critical(20) → global breaker(30)
- SHA-256 稳定哈希，30 条滑动窗口
- `recordToolCallOutcome()`：事后补填结果哈希

**Equality 补齐方向**：
1. 增加 `known_poll_no_progress` 检测器（需 resultHash）
2. 增加 `ping_pong` 检测器
3. 三级阈值（warning → critical → terminate）
4. 滑动窗口历史

---

### GAP-4 🔴 工具 Schema 跨 Provider 兼容（P1）

**现状**：工具 schema 直接传给所有 provider，无兼容性处理。不同 provider 对 JSON Schema 支持不一致导致工具调用失败。

**OpenClaw 实现**（`pi-tools.schema.ts` + `schema/`）：
- 自动将 `anyOf` / `oneOf` 联合类型打平为单一 object schema
- Gemini 专用清理（移除不支持的 JSON Schema 关键字）
- xAI 移除 `pattern` / `maxLength` 等验证约束
- 自动注入缺失的 `type` 或 `properties`
- Claude 风格工具别名兼容

**Equality 补齐方向**：
1. 新增 `tools/schema-compat.ts`：按 provider 类型清洗工具 schema
2. Gemini/xAI/OpenAI 各自的 schema 规范化规则

---

### GAP-5 🔴 bash 执行安全管道（P1）

**现状**：`bash.ts` 直接 `spawn powershell`，无沙箱、无审批、无路径限制、无 PTY。

**OpenClaw 实现**（`bash-tools.exec.ts`，900 行）：
- **Shell Bleed Preflight**：执行前检测 Python/JS 文件中泄漏的 shell 变量语法
- **递归注入检测**：解析 `sudo`, shell wrapper 的嵌套，阻止命令注入
- **审批系统**：集成 allowlist，支持 /allow/allow-always/deny
- **PTY 支持**：真实终端模拟，interactive 程序可正常运行
- **Elevated 执行**：受控提权模式，多层门控
- **沙箱路径隔离**（`sandbox-paths.ts`）：防路径逃逸/符号链接攻击/Unicode 空格注入

**Equality 补齐方向**：
1. 路径沙箱：bash 执行限制在 workspaceDir 内
2. 危险命令白名单/审批流
3. Shell bleed 检测（执行脚本前检查变量泄漏）

---

### GAP-6 🔴 MCP 协议集成（P1）

**现状**：无任何 MCP (Model Context Protocol) 支持。

**OpenClaw 实现**：
- **MCP 客户端**（`pi-bundle-mcp-runtime.ts`，310 行）：
  - 会话级隔离的 MCP 运行时
  - 支持 stdio / SSE / streamable-http 三种传输
  - 配置指纹热重载、工具目录懒加载、分页 listTools
- **MCP 服务器端**（`src/mcp/`，~400 行）：
  - 9 个标准 MCP 工具（conversations/messages/events/permissions）
  - Claude Channel 权限协议

**Equality 补齐方向**：
1. 新增 MCP 客户端：支持连接外部 MCP 工具服务器
2. 将 MCP 工具注册到 toolRegistry，Agent 可调用
3. 后续考虑暴露 MCP 服务器端

---

### GAP-7 🔴 Compaction 分段压缩与渐进降级（P1）

**现状**：单次摘要压缩，无分段、无 identifier policy、无超时/重试。

**OpenClaw 实现**（`compaction.ts`，529 行）：
- **自适应分块**：`splitMessagesByTokenShare()` 根据平均消息大小调整比例 (0.15~0.4)
- **分阶段摘要**：分块并行摘要 → 合并摘要
- **渐进降级**：全量失败 → 跳过超大消息 → 纯元数据
- **标识符保护**：UUID/hash/URL/IP 不被缩写
- **安全**：永不将 toolResult.details 送入摘要 LLM
- **重试**：3 次指数退避 + 抖动

**Equality 补齐方向**：
1. `compaction.ts` 支持分块摘要（大历史先分块再合并）
2. 标识符保留策略（正则保护关键标识符）
3. 压缩超时 + 3 次重试

---

### GAP-8 🔴 多 Agent 编排与子 Agent 系统（P1）

**现状**：无子 Agent 能力，所有任务在单一 toolLoop 中执行。

**OpenClaw 实现**：
- **subagent-spawn.ts**（913 行）：run/session 两种模式、线程绑定、附件传递、深度限制
- **subagent-control.ts**（996 行）：列表/监控/steer/kill，含级联终止后代
- **subagent-orphan-recovery.ts**（244 行）：Gateway 重启后自动恢复中断任务

**Equality 补齐方向**：
1. 先实现单层子 Agent（runner 内 spawn 新的 runAttempt）
2. 控制面：list/steer/kill
3. 后续：深度限制、孤儿恢复

---

### GAP-9 🔴 后台任务注册中心（P2）

**现状**：无后台任务管理系统。cron 工具可创建定时任务但无统一注册/监控/通知。

**OpenClaw 实现**（`src/tasks/`，2000+ 行）：
- 4 种运行时（subagent/acp/cli/cron）
- 7 种状态（queued → running → succeeded/failed/timed_out/cancelled/lost）
- 通知策略（done_only/state_changes/silent）
- SQLite 持久化 + 事件系统 + 访问控制

**Equality 补齐方向**：
1. 新增 `tasks/registry.ts`：统一任务注册与状态跟踪
2. 与 cron 工具集成
3. 通知投递

---

### GAP-10 🔴 七层工具策略管道（P2）

**现状**：仅有 `allowedTools` 白名单过滤（~10 行）。

**OpenClaw 实现**（`tool-policy-pipeline.ts`）：
- 七层过滤：profile → providerProfile → global → globalProvider → agent → agentProvider → group
- 支持 plugin 分组展开
- 警告缓存防日志刷屏

**Equality 补齐方向**：
1. 新增 `tools/policy.ts`：多层策略管道
2. 支持 per-agent / per-provider 工具策略
3. 危险工具（write_file/bash/apply_patch）的分级授权

---

### GAP-11 🟡 可插拔上下文引擎扩展（P2）

**现状**：`DefaultContextEngine` 含 `assemble`/`afterTurn`，约 120 行。

**OpenClaw 实现**（`src/context-engine/`，~660 行）：
- `ContextEngine` 接口含 10 个生命周期方法
- 引擎注册/工厂/slot 系统
- `beforeTurn`/`afterToolCall`/`beforeCompaction` 增量生命周期
- `rewriteTranscript` 安全转录改写
- `prepareSpawnContext`/`cleanupSpawnContext` 子 Agent 上下文
- 第三方插件引擎支持

**Equality 补齐方向**：
1. 扩展 ContextEngine 接口：增加 beforeTurn/afterToolCall/beforeCompaction
2. 引擎注册表 + 工厂模式

---

### GAP-12 🟡 Provider Failover 策略（P2）

**现状**：有基础 `FallbackProvider`，但无按错误类型分类的智能 failover。

**OpenClaw 实现**：
- `failover-policy.ts`：按故障原因（rate_limit/overloaded/billing/auth）决定冷却/探测/保留策略
- `run.ts` 内 failover 级联：rate_limit → 换 profile → 降级 thinking → fallback model
- Auth profile 轮转（`auth-profiles.ts`）
- Live model switch（运行时动态切换模型）

**Equality 补齐方向**：
1. FallbackProvider 增加错误分类（rate_limit vs auth vs billing）
2. 支持降级 thinking level
3. 多 auth profile 轮换

---

### GAP-13 🔴 写操作精确识别（P2）

**现状**：`MUTATING_TOOL_NAMES` 静态集合（6 个工具名），仅用于执行证据 guard。

**OpenClaw 实现**（`tool-mutation.ts`，207 行）：
- 分工具类型判断：write/edit/exec 总是 mutating；process/message 按 action 子类型判断
- READ_ONLY_ACTIONS 白名单（get/list/read/status/show 等）
- 操作指纹提取（path/messageId/sessionKey 等稳定标识）
- `isMutatingToolCall(name, args)` 精确判断

**Equality 补齐方向**：
1. 将 `MUTATING_TOOL_NAMES` 升级为 `isMutatingToolCall(name, args)` 函数
2. 增加 action 级别判断（process list vs process kill）

---

### GAP-14 🔴 交互式 UI 载荷（P3）

**现状**：聊天仅支持纯文本/Markdown。

**OpenClaw 实现**（`src/interactive/`，202 行）：
- 按钮（primary/secondary/success/danger 样式）
- 下拉选择器
- 文本块
- `InteractiveReplyPayload` 标准化结构

**Equality 补齐方向**：
1. Desktop 层支持渲染交互式组件（按钮/选择器）
2. Agent 回复可携带结构化操作

---

### GAP-15 🔴 Prompt 稳定性测试框架（P3）

**现状**：无 system prompt 回归测试。

**OpenClaw 实现**（`prompt-composition-scenarios.ts`）：
- 多场景 prompt 快照：DM/群聊/嵌入式/带 skills/带 context files
- 变更时自动检测 prompt 是否意外改变

**Equality 补齐方向**：
1. 新增 `system-prompt.test.ts`：多场景快照测试

---

## 三、Equality 独有优势

| 能力 | 说明 |
|------|------|
| 伪执行文本 Guard | OpenClaw 无此机制，Equality 独有 |
| 自动纠偏重试 | 检测模型未调用工具却输出伪执行文本时，强制一次重试 |
| Steering 中途调整 | POST /chat/steer 端点，支持用户中途改变方向 |
| OpenSpec 工作流 | project-dev-workflow Skill 提供完整的需求→Spec→编码→续接工作流 |
| Desktop Tauri 集成 | OpenClaw 无桌面端，Equality 有完整的 Tauri 桌面应用 |

---

## 四、实施路线图

### Phase A：可靠性基础（GAP-1, GAP-3, GAP-4）
1. 编译/测试错误自动重试
2. 工具循环检测四重检测器
3. 跨 provider 工具 schema 兼容层

### Phase B：代码理解（GAP-2）
4. LSP 运行时 + hover/definition/references/diagnostics 工具

### Phase C：安全性（GAP-5, GAP-10, GAP-13）
5. bash 沙箱路径隔离
6. 工具策略管道
7. 写操作精确识别

### Phase D：可扩展性（GAP-6, GAP-7, GAP-11）
8. MCP 客户端集成
9. Compaction 分段压缩
10. 可插拔上下文引擎

### Phase E：多 Agent 与任务（GAP-8, GAP-9, GAP-12）
11. 子 Agent spawn/control
12. 后台任务注册中心
13. Provider failover 策略增强

### Phase F：体验增强（GAP-14, GAP-15）
14. 交互式 UI 载荷
15. Prompt 稳定性测试

---

## 五、参考代码位置

### OpenClaw（`example/openclaw-2026.3.31/`）
- Runner: `src/agents/pi-embedded-runner/run.ts` (1476行)
- LSP: `src/agents/pi-bundle-lsp-runtime.ts` (310行)
- MCP: `src/agents/pi-bundle-mcp-runtime.ts` (310行)
- Bash: `src/agents/bash-tools.exec.ts` (900行)
- Loop: `src/agents/tool-loop-detection.ts` (624行)
- Compaction: `src/agents/compaction.ts` (529行)
- Schema: `src/agents/pi-tools.schema.ts`
- Mutation: `src/agents/tool-mutation.ts` (207行)
- Policy: `src/agents/tool-policy-pipeline.ts`
- Sandbox: `src/agents/sandbox-paths.ts`
- SubAgent: `src/agents/subagent-spawn.ts` (913行) + `subagent-control.ts` (996行)
- Tasks: `src/tasks/` (2000+行)
- Context Engine: `src/context-engine/` (660行)
- Failover: `src/agents/failover-policy.ts`

### Equality（`packages/core/src/`）
- Runner: `agent/runner.ts` (685行)
- Tools: `tools/builtins/` (18个工具)
- Context: `context/default-engine.ts` (207行)
- Truncation: `tools/truncation.ts`
- Providers: `providers/` (base/copilot/fallback/router)
