# Cost Ledger Specification

> 描述成本追踪系统：记录每次 LLM 调用的 token 消耗和人民币费用。  
> 依赖：[llm-provider/spec.md](../llm-provider/spec.md)

---

## Requirements

### Requirement: 成本记录

每次 LLM 调用完成后，系统 MUST 自动写入一条 `CostEntry`：

```typescript
interface CostEntry {
  entryId: string;           // UUID
  sessionKey: string;
  runId: string;             // 同一个 runAttempt 内的唯一 ID
  timestamp: number;         // Unix ms
  durationMs: number;
  
  provider: string;          // "deepseek" | "qwen" ...
  model: string;             // "deepseek-v3" ...
  
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    thinkingTokens?: number;
    totalTokens: number;
  };
  
  cost: {
    inputCny: number;
    outputCny: number;
    cacheReadCny: number;
    totalCny: number;
  };
  
  phase: "classify" | "prompt" | "compact" | "subagent" | "embedding";
}
```

---

### Requirement: 持久化

成本记录 MUST 持久化到 SQLite 数据库：

```
%APPDATA%\Equality\cost-ledger.db
```

表结构（简化）：
```sql
CREATE TABLE cost_entries (
  entry_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  total_cny REAL NOT NULL,
  payload TEXT NOT NULL    -- 完整 JSON（含 usage 明细）
);

CREATE INDEX idx_session_key ON cost_entries(session_key);
CREATE INDEX idx_timestamp ON cost_entries(timestamp DESC);
```

---

### Requirement: 预算限额

系统 SHOULD 支持每日费用限额：

- 限额配置：`config.limits.dailyBudgetCny`（默认 ¥10）
- 检查时机：每次 `runAttempt` 开始前
- 超出限额时：拒绝运行，向渠道发送"今日预算已用完"提示

#### Scenario: 达到每日限额
- GIVEN 今日已消耗 ¥9.98，设定限额 ¥10
- WHEN 新的 `runAttempt` 开始前检查预算
- THEN 估算本次请求成本约 ¥0.05，加上已用超出限额
- AND 拒绝运行，向用户发送："💰 今日 AI 费用预算（¥10.00）已用完，请明天再试或在设置中调整限额"

---

### Requirement: 任务结束成本报告

每次 `runAttempt` 完成后，系统 SHOULD 在回复末尾附加简短的成本摘要（可配置开关）：

```
---
💰 本次花费：¥0.0023  |  tokens：8,234  |  模型：deepseek-v3
```

对于复杂的多步任务，SHOULD 提供更详细的按阶段明细（见 DESIGN_PHILOSOPHY.md 第三十九章示例）。

---

### Requirement: 查询接口

Gateway MUST 暴露以下成本查询 HTTP 端点：

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/cost/today` | 今日总费用和按模型明细 |
| `GET` | `/cost/sessions` | 最近 N 个 Session 的费用排行 |
| `GET` | `/cost/export` | 导出 CSV（供 Excel 分析）|

Tauri 设置面板 MUST 展示今日费用和本月累计费用。
