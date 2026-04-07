# Delta Spec: API Key Rotation

> Phase H3 (GAP-20) — 同一 Provider 多 API Key 轮换  
> 修改领域：providers（FailoverPolicy 增强）

---

## ADDED Requirements

### Requirement: Key 轮换执行器

系统 MUST 提供 `executeWithKeyRotation<T>()` 泛型函数，接收多个 API Key，依次尝试直到成功或全部失败。

```typescript
interface KeyRotationOptions<T> {
  provider: string               // Provider 名称（用于日志）
  keys: string[]                 // API Key 列表
  execute: (key: string) => Promise<T>   // 使用指定 key 执行请求
  shouldRetry?: (params: {       // 判断是否应该换 key 重试
    key: string
    error: unknown
    attempt: number
    message: string
  }) => boolean
  onRetry?: (params: {           // 换 key 重试时的回调
    key: string
    error: unknown
    attempt: number
    message: string
  }) => void
}

function executeWithKeyRotation<T>(opts: KeyRotationOptions<T>): Promise<T>
```

#### Scenario: 首个 Key 成功
- GIVEN keys = ["key-A", "key-B"]
- AND key-A 的请求成功
- WHEN `executeWithKeyRotation()` 被调用
- THEN 只使用 key-A
- AND 不触发 onRetry

#### Scenario: 首个 Key 限流后轮换
- GIVEN keys = ["key-A", "key-B"]
- AND key-A 返回 429 rate limit 错误
- WHEN `executeWithKeyRotation()` 被调用
- THEN 自动切换到 key-B 重试
- AND `onRetry` 被调用一次

#### Scenario: 所有 Key 失败
- GIVEN keys = ["key-A", "key-B"]
- AND 两个 key 都返回 429
- WHEN `executeWithKeyRotation()` 被调用
- THEN 抛出最后一个错误

#### Scenario: 空 Key 列表
- GIVEN keys = []
- WHEN `executeWithKeyRotation()` 被调用
- THEN 抛出 "No API keys configured" 错误

---

### Requirement: Key 列表去重

`executeWithKeyRotation()` MUST 对输入的 key 列表进行去重和空值过滤：
- 去除前后空格
- 过滤空字符串
- 相同 key 只保留第一个

#### Scenario: Key 去重
- GIVEN keys = ["key-A", " key-A ", "", "key-B", "key-A"]
- WHEN 去重后
- THEN 有效 keys = ["key-A", "key-B"]

---

### Requirement: Provider Key 收集

系统 MUST 提供 `collectProviderKeys(provider, primaryKey?)` 函数，从环境变量收集指定 Provider 的所有可用 API Key。

环境变量命名约定：
- `{PROVIDER}_API_KEY` — 主 key
- `{PROVIDER}_API_KEY_1`, `{PROVIDER}_API_KEY_2`, ... — 额外 key
- Provider 名称转大写 + 下划线（如 `openai` → `OPENAI`）

```typescript
function collectProviderKeys(provider: string, primaryKey?: string): string[]
```

#### Scenario: 收集 OpenAI 多 Key
- GIVEN 环境变量 `OPENAI_API_KEY=sk-main`, `OPENAI_API_KEY_1=sk-extra1`, `OPENAI_API_KEY_2=sk-extra2`
- WHEN `collectProviderKeys('openai', 'sk-main')` 被调用
- THEN 返回 `['sk-main', 'sk-extra1', 'sk-extra2']`（去重）

#### Scenario: 只有主 Key
- GIVEN 只有 `OPENAI_API_KEY=sk-main`
- WHEN `collectProviderKeys('openai', 'sk-main')` 被调用
- THEN 返回 `['sk-main']`

---

### Requirement: 默认重试判断

当 `shouldRetry` 未提供时，系统 MUST 使用默认策略：**rate_limit 错误（429 / "rate_limit" / "too many requests"）时重试**。

其他错误类型（auth / billing / fatal）SHALL NOT 触发 key 轮换。

#### Scenario: 认证错误不重试
- GIVEN key-A 返回 401 错误
- AND shouldRetry 未提供（使用默认）
- WHEN `executeWithKeyRotation()` 被调用
- THEN 直接抛出错误，不尝试 key-B
