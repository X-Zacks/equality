# Delta Spec: Phase E4 — Provider 模型切换通知接入

> 本 Delta 覆盖 `providers/index.ts` 对 `onModelSwitch` 回调的支持。
>
> 依赖: Phase E2 的 `llm-provider/spec-delta.md`（FailoverPolicy 已实现）

---

## ADDED Requirements

### Requirement: getDefaultProvider 支持模型切换回调

`providers/index.ts` 中的 `getDefaultProvider()` 函数 SHALL 支持可选的 `onModelSwitch` 回调参数。

函数签名变更：
```typescript
// 原来
function getDefaultProvider(): LLMProvider

// 变更后
function getDefaultProvider(opts?: {
  onModelSwitch?: OnModelSwitch
}): LLMProvider
```

约束：
- 原有无参调用方式 MUST 保持兼容（`opts` 为可选）
- 当 `opts.onModelSwitch` 存在时，构建的 `FallbackProvider` MUST 接收该回调
- 当 `opts.onModelSwitch` 不存在时，行为与原来完全一致

#### Scenario: 无参调用保持兼容
- GIVEN 代码库中所有调用 `getDefaultProvider()` 的位置
- WHEN 不传入任何参数
- THEN 行为与 Phase E2 之前完全相同

#### Scenario: 带回调调用触发通知
- GIVEN Gateway 调用 `getDefaultProvider({ onModelSwitch: callback })`
- WHEN Provider 发生 failover 切换
- THEN `callback` 被调用，参数包含 `fromProvider`、`toProvider`、`reason`

---

### Requirement: getProviderWithFallback 同样支持回调

`getProviderWithFallback()` 函数 SHALL 也支持可选的 `onModelSwitch` 参数，并透传给 `FallbackProvider`。

约束：
- 与 `getDefaultProvider` 保持接口一致性
- 若不传，行为不变

---

### Requirement: Gateway 顶层 defaultProvider 单例

Gateway `index.ts` SHALL 在模块顶层创建一个带 `onModelSwitch` 回调的 `defaultProvider` 单例。

约束：
- 单例在所有路由注册之前创建（模块初始化阶段）
- `onModelSwitch` 回调 MUST 调用 `broadcastNotification()` 推送通知
- `/chat/stream` 路由在无显式 provider 指定时 MUST 优先使用此单例（而非每次调用 `getDefaultProvider()`）

#### Scenario: failover 通知到达 UI
- GIVEN SSE 客户端已连接 `/events`
- AND Gateway 顶层 defaultProvider 单例已绑定 onModelSwitch
- WHEN `/chat/stream` 请求期间发生 rate_limit failover
- THEN SSE 客户端收到 `type: 'notification'` 事件
- AND body 中包含新旧 provider ID 和 reason

---

## MODIFIED Requirements

### Requirement: FallbackProvider 构建方式（修改）

**原规格（Phase E2）**：
`getProviderWithFallback()` 构建 `FallbackProvider` 时不传 `onModelSwitch`。

**修改后**：
`getProviderWithFallback()` 和 `getDefaultProvider()` 均接受可选 `onModelSwitch`，并在构建 `FallbackProvider` 时透传。

（`FallbackProvider` 自身的构造函数已在 E2 中支持 `onModelSwitch`，本次只是从调用侧补齐。）

---

## REMOVED Requirements

（无）
