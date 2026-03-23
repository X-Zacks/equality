# Proposal: Agent 循环上限配置化

## 背景与问题

当前 Agent Runner 的两个关键上限全部硬编码：

| 常量 | 位置 | 默认值 | 含义 |
|------|------|--------|------|
| `MAX_TOOL_LOOP` | `runner.ts` L55 | **50** | 单次任务最多发起 50 次 LLM 调用 |
| `CIRCUIT_BREAKER_LIMIT` | `loop-detector.ts` L37 | **30** | 单次任务最多执行 30 次工具调用 |

### 实际限制场景

**写一个 100 接口的 Python 服务**：

```
每个接口需要：write_file (1) + bash python 验证 (1) = 2 次工具调用
100 接口 × 2 = 200 次工具调用
断路器上限 30 → 写到第 15 个接口就会被强制终止
```

**5 小时不间断工作**：时间本身不是瓶颈，工具次数（30）和 LLM 轮次（50）才是。对于大型任务，用户需要能调高这两个上限。

### 上限的意义

这两个上限**不应该被删除**，它们是防止 Agent 陷入循环的安全阀。但默认值应该是合理的"正常任务"预设，对于大型任务用户应该可以调高。

---

## 目标

将 `AGENT_MAX_TOOL_CALLS`（工具调用断路器）和 `AGENT_MAX_LLM_TURNS`（LLM 轮次上限）两个参数：
1. 从硬编码改为从 `settings.json` 读取
2. 在「高级设置」页面与 bash 超时配置放在一起，对用户可见可修改
3. 保持原有默认值（30 和 50），未配置时行为不变

---

## 范围

| 变更 | 文件 |
|------|------|
| 新增两个 SecretKey | `packages/core/src/config/secrets.ts` |
| 读取配置替换硬编码 | `packages/core/src/agent/runner.ts` |
| LoopDetector 接受动态上限 | `packages/core/src/tools/loop-detector.ts` |
| 高级设置 UI 新增两个输入项 | `packages/desktop/src/Settings.tsx` |

---

## 不在范围内

- 修改断路器的其他三个检测器（generic_repeat/poll/ping_pong）的阈值（可后续配置化）
- 任务分段（将一个大任务拆成多个 runAttempt 自动续接）—— 这是更大的功能
