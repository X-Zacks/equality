# Proposal: Phase E — 多 Agent 与任务（GAP-8, GAP-9, GAP-12）

> 作为 Equality 编程助手，在完成 Phase D 可扩展性后，继续补齐“任务执行形态”与“运行时容灾”能力：让 Agent 能把复杂工作拆成子任务、让后台任务有统一注册中心、让 Provider 故障时具备更智能的 failover。

---

## 一、为什么做

### 1.1 单一 toolLoop 已接近上限

Phase D 解决了外部工具扩展、Compaction 稳定性和上下文生命周期，但当前所有复杂任务仍然挤在**单一 `runAttempt()` + 单一 toolLoop** 中完成。

这在以下场景会明显吃力：

| 场景 | 当前问题 |
|------|------|
| 大型重构 | 一个 Agent 同时读代码、改代码、跑测试、汇总结果，提示词与上下文互相污染 |
| 调查型任务 | 主 Agent 既要规划又要执行，容易在“继续深挖”与“回到主线总结”之间震荡 |
| 长时间后台工作 | cron 能触发任务，但缺少统一任务状态、取消、重试、通知入口 |
| 多 Provider 故障 | 当前只有基础 fallback，无法根据错误类型智能决策切换策略 |

### 1.2 缺少统一任务注册中心

当前 Equality 已有 `cron`、会话队列、运行中 abort、SSE 流式回复，但这些能力彼此分散：

- `cron` 负责任务调度，但不掌握统一任务状态
- `runAttempt()` 负责任务执行，但不暴露独立任务对象
- 子任务/后台任务没有统一的 `taskId`、状态机、通知策略

**结论**：在引入子 Agent 之前，必须先有一个统一的任务注册中心，否则“spawn / list / steer / kill”都会缺少稳定的承载面。

### 1.3 Failover 还停留在“能切换”，未达到“会决策”

Equality 已有基础 `FallbackProvider` / routing / auto model switch，但当前问题仍在：

| 故障类型 | 当前行为 | 缺口 |
|------|------|------|
| `429 rate_limit` | 可能 fallback | 无 provider 冷却、无分类探测 |
| `5xx / overloaded` | 可能 fallback | 无不同错误级别策略 |
| `auth / billing` | 直接失败或笼统 fallback | 无 auth profile 轮换、无更精确的保留/禁用策略 |
| thinking 模型过载 | 无推理级别降级 | 无“高推理→低推理→普通模型”的渐进策略 |

OpenClaw 的经验表明：**多 Agent 与长任务越多，failover 质量越关键**。否则子 Agent 一旦落到不稳定模型上，父任务会整体失稳。

---

## 二、做什么

**Phase E 分为三个子阶段，按依赖顺序建议执行：**

### E1. 后台任务注册中心（GAP-9）

**目标**：引入统一的 `TaskRegistry`，所有长任务、cron 任务、子 Agent 任务都以 `taskId` 为中心管理。

```
任务来源（cron / subagent / 手动）
          │
          ▼
      TaskRegistry
   ├─ register()
   ├─ transition()
   ├─ list/get()
   ├─ cancel()/steer()
   └─ events / notification
```

**核心收益**：
- 子 Agent 有稳定的控制面
- cron 不再是“黑盒触发器”
- UI / SSE / HTTP API 有统一的状态来源

### E2. Provider Failover 策略增强（GAP-12）

**目标**：将当前基础 fallback 升级为**按错误类型分类**的 failover policy。

```
LLM 调用失败
   │
   ├─ AbortError           → 立即返回，不切换
   ├─ Context Overflow     → 交给 Compaction，不切换
   ├─ rate_limit / 429     → 冷却 provider，切下一个候选
   ├─ overloaded / 5xx     → 短冷却 + 重试/切换
   ├─ auth                 → 切 auth profile 或禁用 provider
   ├─ billing              → 长冷却并切换
   └─ timeout/network      → 探测后切换
```

**核心收益**：
- 长任务执行更稳
- 子 Agent 不再因单个 provider 抖动而整批失败
- 用户得到更可解释的“为什么切了模型”反馈

### E3. 多 Agent 编排与子 Agent 系统（GAP-8）

**目标**：在当前单 Agent 基础上，先实现**单层子 Agent** 能力，让主 Agent 能把某类工作委派给独立子任务。

```
主 Agent
  │  调用 subagent 工具
  ▼
SubagentManager.spawn()
  │
  ├─ 创建 taskId + child session
  ├─ 注册到 TaskRegistry
  ├─ 启动子 runAttempt()
  ├─ 支持 steer / kill / list
  └─ 完成后将摘要回填父对话
```

**V1 范围**：
- 单层 spawn（不允许孙子 Agent）
- 控制面：`list` / `steer` / `kill`
- 结果回填：子 Agent 输出摘要回到父会话

---

## 三、不做什么

- ❌ 深层递归多 Agent（`depth > 1`）
- ❌ 子 Agent 孤儿恢复（Gateway 重启后自动恢复）
- ❌ 任务 SQLite 持久化（Phase E 先用 JSON / 内存+磁盘快照）
- ❌ ACP / CLI / 外部渠道等多运行时任务接入（先聚焦 `subagent` / `cron` / `manual`）
- ❌ UI 可视化工作流编排器
- ❌ Prompt 模板市场 / 任务模板匹配（留后续 Phase）

---

## 四、预期收益

| 子阶段 | GAP | 收益 |
|--------|-----|------|
| E1 | GAP-9 | 所有长任务有统一 taskId、状态机、通知和控制面 |
| E2 | GAP-12 | Provider 失败不再“盲切”，而是按错误类型做稳定降级 |
| E3 | GAP-8 | 主 Agent 可把调查/执行类工作委派给子 Agent，降低单轮上下文压力 |

---

## 五、依赖关系

```
E1（TaskRegistry）──────────────┐
                              ├──► E3（SubAgent 系统）
E2（Failover 策略增强）─────────┘

E2 也独立增强主 Agent / cron / subagent 的稳定性
```

**建议执行顺序**：E1 → E2 → E3

- `E1` 先提供统一任务对象
- `E2` 先增强执行稳定性
- `E3` 在有任务注册与 failover 保护后再接入，多 Agent 风险最低
