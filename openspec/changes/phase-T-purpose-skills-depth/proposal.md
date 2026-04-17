# Proposal: Phase T — Purpose 持久化 + Skills 渐进披露 + 子代理深度限制

## 意图

基于 Hermes-Agent 差距分析（2026-04-17 修正版），关闭 3 个剩余 P0 差距：

1. **Purpose 持久化** — 当前 SessionPurpose 只在内存中，服务重启丢失
2. **Skills 渐进式披露** — 当前全量注入 skill 到 system prompt 浪费 token
3. **子代理深度限制** — 当前无 MAX_DEPTH，理论上存在无限递归风险

## 范围

### T1: Purpose 持久化
- `persist.ts` 序列化 purpose 字段到 session JSON
- `store.ts` 恢复 purpose 字段
- 测试：持久化→恢复→字段一致

### T2: Skills 渐进式披露
- system prompt 只注入 skill 元数据（name + description），不注入完整 body
- 新增 `skill_view` 工具：Agent 按需读取完整 SKILL.md
- 保留现有 O3 沉淀引导不变

### T3: 子代理深度限制
- `subagent-spawn.ts` 新增 `MAX_SUBAGENT_DEPTH = 3` 检查
- 通过 session metadata 传递当前深度
- 超限时返回错误，不创建子代理

## 不在范围内
- Skills Hub 安全（quarantine/guard）— 后续迭代
- MoA / Profiles — 非核心
