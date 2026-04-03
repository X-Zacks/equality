# Delta Spec: Phase E — Provider Failover 策略增强

> 依赖: [../../../specs/llm-provider/spec.md](../../../specs/llm-provider/spec.md)
>
> 本 Delta Spec 覆盖 GAP-12：将当前基础 Model Fallback 升级为按错误类型分类的 failover policy。

---

## ADDED Requirements

### Requirement: Failover 错误分类

系统 SHALL 在 Provider 失败时先做错误分类，再决定是否切换候选模型。

错误类型至少包括：
- `abort`
- `context_overflow`
- `rate_limit`
- `overloaded`
- `auth`
- `billing`
- `network`
- `timeout`
- `fatal`

- `abort` MUST NOT 触发 failover
- `context_overflow` MUST NOT 触发 failover，而是交由 Compaction 处理
- `rate_limit` / `overloaded` / `network` / `timeout` SHOULD 触发 failover
- `auth` SHOULD 将当前 provider 置入长冷却期并切换到下一候选
- `billing` SHOULD 将当前 provider 置入较长冷却期

#### Scenario: AbortError 不触发 failover
- GIVEN 用户主动取消了当前请求
- WHEN Provider 抛出 `AbortError`
- THEN 系统立即结束本次运行
- AND 不切换到任何备用模型

#### Scenario: 429 触发 failover
- GIVEN 主 Provider 返回 HTTP 429
- WHEN failover policy 分类错误
- THEN 系统将错误识别为 `rate_limit`
- AND 将该 Provider 置入冷却期
- AND 切换到下一个可用候选

---

### Requirement: Provider 冷却与探测

系统 SHALL 为 failover 候选维护运行时冷却状态。

- 因 `rate_limit` 失败的 Provider MUST 进入冷却期（默认 30 秒）
- 因 `billing` 失败的 Provider SHOULD 进入更长冷却期
- 因 `network` / `timeout` 失败的 Provider MAY 在较短时间后重新探测
- 冷却中的 Provider MUST 在候选选择阶段被跳过
- 探测行为 MUST 受最小间隔限制，避免对故障 Provider 高频打点

#### Scenario: 冷却中的 Provider 被跳过
- GIVEN Provider A 刚因 429 失败并进入 30 秒冷却
- WHEN 下一次运行在 10 秒后再次发起
- THEN 候选选择阶段跳过 Provider A
- AND 优先尝试其他可用 Provider

---

### Requirement: thinking 渐进降级

当候选模型支持推理等级（thinking/reasoning）时，系统 SHALL 先尝试降低推理等级，再切换到完全不同的模型。

- 降级顺序 SHOULD 为 `high → medium → low → off`
- 若模型不支持 thinking，则直接进入 fallback chain
- 一旦已经开始稳定向用户输出内容，MUST NOT 在同一轮中途切换模型，以避免回复风格跳变

#### Scenario: 推理模型过载时先降 thinking
- GIVEN 当前模型支持 thinking 且运行在高推理等级
- WHEN 调用失败且分类结果允许降级
- THEN 系统先降低 thinking 等级并重试
- AND 若仍失败，再切换到下一个候选模型

---

## MODIFIED Requirements

### Requirement: Model Fallback（修改）

**原规格**：
主模型调用失败后，按 fallback 列表切换到备用模型；区分 `AbortError` 和 `Context Overflow`。

**修改后**：
- 切换前 MUST 先经过 failover policy 错误分类
- 候选选择 MUST 考虑 provider 冷却状态
- 对支持 thinking 的模型，SHOULD 先进行 thinking 渐进降级
- `auth` 错误 SHOULD 将该 Provider 置入长冷却期并切换到下一候选
- failover 事件 SHOULD 以用户可见但简洁的方式通知（如“已切换到备用模型”）

#### Scenario: auth 失败禁用 provider 并切换
- GIVEN 当前 Provider 返回 401/403 auth 错误
- WHEN failover policy 分类错误
- THEN 系统将该 Provider 置入长冷却期
- AND 切换到下一个可用 Provider

---

## REMOVED Requirements

（无）
