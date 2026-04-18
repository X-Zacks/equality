# Proposal: Evidence Guard 静默化

> 优先级：🟡 P1  
> 关联变更：[tool-execution-proof-guard](../tool-execution-proof-guard/proposal.md)

## 意图

当前 `guardUnverifiedClaims()` 在检测到模型回答中存在未经工具核验的事实断言时，会在回答末尾**追加可见警告文字**给用户（如"⚠️ 以上回答中涉及以下内容的判断尚未经过工具实际核验"）。

用户反馈这种方式**不够友好**——Agent 应该自己判断是否需要调用工具来验证，而不是把"我不确定"的信息暴露给用户。

## 目标

- 移除 `guardUnverifiedClaims` 的用户可见警告追加
- 当检测到未核验断言时，自动追加一轮**静默纠偏重试**（nudge 模型去调用对应工具验证）
- 如果重试后仍无法核验，则静默放行（不再向用户显示警告）

## 范围

- `packages/core/src/agent/runner.ts` — `guardUnverifiedClaims` 函数 + `runAttempt` 调用处

## 成功标准

- 用户不再看到 "⚠️ 以上回答中涉及以下内容的判断尚未经过工具实际核验" 警告
- 编译零新增错误
