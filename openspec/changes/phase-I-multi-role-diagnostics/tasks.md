# Phase I: 任务清单

## I1 — Tool Catalog & Profiles

- [x] T1: 编写 Delta Spec — `specs/tool-catalog/spec.md`
- [x] T2: 新建 `tools/catalog.ts` — 工具定义 + section + profile 解析
- [x] T3: CORE_TOOL_GROUPS 分组映射
- [x] T4: resolveCoreToolProfilePolicy() — 4 种 profile 解析
- [x] T5: listCoreToolSections() — 按 section 返回工具列表
- [x] T6: 修改 `tools/types.ts` — ToolDefinition 增加 sectionId/profiles
- [x] T7: 修改 `tools/registry.ts` — getToolSchemas 支持 profile 过滤
- [x] T8: 测试 — ≥ 15 个断言 (实际 38)

## I2 — Agent Scoping

- [x] T9: 编写 Delta Spec — `specs/agent-scope/spec.md`
- [x] T10: 新建 `config/agent-types.ts` — AgentEntry, ResolvedAgentConfig, EqualityConfig 类型
- [x] T11: 新建 `config/agent-scope.ts` — listAgentIds, resolveDefaultAgentId
- [x] T12: resolveAgentIdFromSessionKey() — session key 解析
- [x] T13: resolveAgentConfig() — per-agent 配置解析 + fallback
- [x] T14: resolveAgentEffectiveModel() — agent model + defaults fallback
- [x] T15: 修改 `agent/system-prompt.ts` — 支持 agentConfig.identity
- [x] T16: 测试 — ≥ 15 个断言 (实际 26)

## I3 — Security Audit

- [x] T17: 编写 Delta Spec — `specs/security-audit/spec.md`
- [x] T18: 新建 `security/audit-types.ts` — SecurityAuditFinding, SecurityAuditReport 类型
- [x] T19: 新建 `security/audit.ts` — runSecurityAudit() 框架
- [x] T20: 实现 6 类检查：sandbox/secrets/tools/content/proxy/workspace
- [x] T21: 修改 `index.ts` — GET /api/security-audit 路由
- [x] T22: 测试 — ≥ 15 个断言 (实际 25)

## I4 — Cache Trace

- [x] T23: 编写 Delta Spec — `specs/cache-trace/spec.md`
- [x] T24: 新建 `diagnostics/redact.ts` — sanitizeDiagnosticPayload 脱敏
- [x] T25: 新建 `diagnostics/queued-writer.ts` — QueuedFileWriter 异步写入
- [x] T26: 新建 `diagnostics/cache-trace.ts` — createCacheTrace + 7 阶段
- [x] T27: 消息摘要（SHA-256 fingerprint + digest）
- [x] T28: 环境变量开关 EQUALITY_CACHE_TRACE
- [x] T29: 测试 — ≥ 15 个断言 (实际 35)

## 统计

- 实际总断言数：124（I1:38 + I2:26 + I3:25 + I4:35）
- tsc --noEmit：零错误 ✅
- 现有测试：343 个无回归 → 总计 467 个断言全部通过 ✅
