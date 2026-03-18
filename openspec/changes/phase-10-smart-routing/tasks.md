# Phase 10: 智能模型路由 — Tasks

> 状态：🔄 进行中  
> Spec: [specs/llm-provider/spec.md](../../specs/llm-provider/spec.md)

## 实施清单

### 1. router.ts 路由引擎

- [ ] 1.1 定义 Tier 类型和 ModelPreference
- [ ] 1.2 实现 `classifyComplexity()` 复杂度分类器（纯规则）
- [ ] 1.3 定义 MODEL_TIERS 路由表
- [ ] 1.4 实现 `parseModelOverride(message)` 解析 @model 语法
- [ ] 1.5 实现 `routeModel(message, explicitProvider?)` 主路由函数
- [ ] 1.6 路由结果日志（console.log tier + 选中的 model）

### 2. runner.ts 集成

- [ ] 2.1 替换 getProviderWithFallback() 为 routeModel()
- [ ] 2.2 将 strippedMessage 传入后续流程

### 3. 验证

- [ ] 3.1 TypeScript 编译零新增错误
