# Proposal: 模型自适应工具护栏（Model-Adaptive Tool Guard）

> Phase: S  
> 状态: 已立项  
> 创建: 2026-04-15

## 背景

当前系统已有基于正则的"执行证据 Guard"（`guardUnsupportedSuccessClaims`、`shouldForceToolRetry`），能拦截"没调工具却宣称已执行"的情况。但存在一个更微妙的问题：

**模型对"状态核验类问题"的处理不一致。**

强模型（如 GPT-5.4）能自然理解"推到 git 了么？"是需要工具核验的问题，主动调用 bash 检查。中等模型（如 MiniMax-M2.7）有时会直接从上下文推测答案，跳过工具调用，输出看似合理但无实际证据支撑的回答。

## 目标

在 `runner.ts` 的最终回答输出前，增加一个轻量的"回答证据守卫"（Answer Evidence Guard）：

1. 检测模型回答中的**事实性断言**（已推送/已修改/编译通过/服务启动等）
2. 对照本轮实际执行的工具集，判断是否有证据支撑
3. 无证据时：**改写为"尚未实际核验"并引导用户确认是否需要检查**

## 范围

- ✅ 后置证据校验（Answer Evidence Guard）
- ✅ 事实断言模式匹配
- ✅ 证据类型与工具的映射
- ✅ 无证据时的回答改写
- ❌ 不做前置意图分类器（保持强模型自然能力）
- ❌ 不做模型分层配置（第一版统一策略）
- ❌ 不改变 UI

## 高层方案

在 `runner.ts` 的 `guardUnsupportedSuccessClaims` 之后，增加新的 `guardUnverifiedClaims` 函数：

```
模型最终回答 → guardUnsupportedSuccessClaims (已有) → guardUnverifiedClaims (新增) → 输出
```

新守卫的逻辑：
- 从回答中提取事实性断言的**证据类别**（git_status / file_change / compile_result / service_status / command_result）
- 对照 `executedToolNames` 集合，检查是否有匹配的工具调用
- 如果有断言但无证据 → 改写回答
