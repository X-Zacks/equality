# Phase U: 请求配额 — 技术设计

## 1. 数据模型

### 1.1 cost_entries 表扩展

```sql
ALTER TABLE cost_entries ADD COLUMN model_tier TEXT NOT NULL DEFAULT 'standard';
-- model_tier: 'premium' | 'standard' | 'basic'
```

`model_tier` 由 `router.ts` 中已有的 `MODEL_TIERS` 映射自动填充：
- `heavy` → `premium` (GPT-5, Claude Opus, o3, etc.)
- `standard` → `standard` (GPT-4o, Claude Sonnet, DeepSeek V3, etc.)
- `light` → `basic` (GPT-4o-mini, qwen-turbo, etc.)

### 1.2 新增 request_quotas 表

```sql
CREATE TABLE IF NOT EXISTS request_quotas (
  provider       TEXT NOT NULL,
  tier           TEXT NOT NULL,   -- 'premium' | 'standard' | 'basic'
  monthly_limit  INTEGER NOT NULL,
  warn_pct       REAL NOT NULL DEFAULT 0.8,   -- 80% 预警
  critical_pct   REAL NOT NULL DEFAULT 0.95,  -- 95% 严重预警
  auto_downgrade INTEGER NOT NULL DEFAULT 1,  -- 1=耗尽自动降级
  PRIMARY KEY (provider, tier)
);
```

## 2. 核心模块

### 2.1 request-quota.ts (新增, ~150 行)

```typescript
export interface QuotaConfig {
  provider: string
  tier: 'premium' | 'standard' | 'basic'
  monthlyLimit: number
  warnPct: number       // 0.8
  criticalPct: number   // 0.95
  autoDowngrade: boolean
}

export interface QuotaStatus {
  provider: string
  tier: string
  used: number           // 本月已用
  limit: number          // 配额上限
  remaining: number
  pct: number            // 使用百分比
  level: 'ok' | 'warn' | 'critical' | 'exhausted'
}

export function getQuotaConfig(provider: string, tier: string): QuotaConfig | null
export function setQuotaConfig(config: QuotaConfig): void
export function getMonthlyUsage(provider: string, tier: string): number
export function checkQuota(provider: string, tier: string): QuotaStatus
export function formatQuotaWarning(status: QuotaStatus): string | null
```

### 2.2 ledger.ts 改动 (~30 行)

- `record()` 新增 `modelTier` 参数，写入 `model_tier` 列
- `dailySummary()` 返回增加 `premiumCallCount` 字段
- `sessionCostSummary()` 返回增加 `premiumCallCount`

### 2.3 router.ts 改动 (~40 行)

在 `routeModel()` 中，当选定模型 tier 后：

```typescript
const quota = checkQuota(provider, selectedTier)
if (quota.level === 'exhausted' && quota.autoDowngrade) {
  // 降级到下一 tier
  selectedModel = downgradeModel(selectedModel)
  downgradeReason = `配额已用尽 (${quota.used}/${quota.limit})`
}
```

### 2.4 runner.ts 改动 (~20 行)

在 `runAttempt()` LLM 调用完成后：

```typescript
const quota = checkQuota(provider, modelTier)
const warning = formatQuotaWarning(quota)
if (warning) {
  // 追加到回复末尾（类似现有的 costLine）
  result.quotaWarning = warning
}
```

### 2.5 前端改动

**设置页 (~80 行)**：
- 每个 provider 卡片下增加"月度配额"输入框
- 显示当前月使用进度条 (绿 → 黄 → 红)

**Chat 底部 (~20 行)**：
- `done` 事件 payload 增加 `quotaWarning?: string`
- 存在时在 costLine 下方渲染黄/红色警告条

**/usage 命令 (~30 行)**：
- 现有 `/usage` 输出中增加请求配额部分

## 3. 数据流

```
用户消息 → router.ts (选模型 + 检查配额 → 可能降级)
         → LLM API 调用
         → ledger.record(…, modelTier)
         → checkQuota() → formatQuotaWarning()
         → runner 追加 quotaWarning 到回复
         → SSE 推送到前端
```

## 4. 迁移

- DB 迁移：`ALTER TABLE cost_entries ADD COLUMN model_tier`
- 历史数据回填：根据 `model` 字段用 MODEL_TIERS 映射补填 tier
- 新表 `request_quotas` 创建
- 默认不配置任何配额（不影响现有用户）
