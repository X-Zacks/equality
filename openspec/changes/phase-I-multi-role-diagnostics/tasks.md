# Phase I: 任务清单

## I1 — Tool Catalog & Profiles

- [ ] T1: 编写 Delta Spec — `specs/tool-catalog/spec.md`
- [ ] T2: 新建 `tools/catalog.ts` — 工具定义 + section + profile 解析
- [ ] T3: CORE_TOOL_GROUPS 分组映射
- [ ] T4: resolveCoreToolProfilePolicy() — 4 种 profile 解析
- [ ] T5: listCoreToolSections() — 按 section 返回工具列表
- [ ] T6: 修改 `tools/types.ts` — ToolDefinition 增加 sectionId/profiles
- [ ] T7: 修改 `tools/registry.ts` — getToolSchemas 支持 profile 过滤
- [ ] T8: 测试 — ≥ 15 个断言
  - T8.1: listCoreToolSections 返回分组
  - T8.2: isKnownCoreToolId 识别已知/未知工具
  - T8.3: coding profile 包含 read/write/exec
  - T8.4: minimal profile 仅含 session_status
  - T8.5: messaging profile 包含 message/sessions
  - T8.6: full profile 返回 undefined
  - T8.7: unknown profile 返回 undefined
  - T8.8: group:fs 包含正确工具
  - T8.9: getToolSchemas 带 profile 过滤

## I2 — Agent Scoping

- [ ] T9: 编写 Delta Spec — `specs/agent-scope/spec.md`
- [ ] T10: 新建 `config/agent-types.ts` — AgentEntry, ResolvedAgentConfig, EqualityConfig 类型
- [ ] T11: 新建 `config/agent-scope.ts` — listAgentIds, resolveDefaultAgentId
- [ ] T12: resolveAgentIdFromSessionKey() — session key 解析
- [ ] T13: resolveAgentConfig() — per-agent 配置解析 + fallback
- [ ] T14: resolveAgentEffectiveModel() — agent model + defaults fallback
- [ ] T15: 修改 `agent/system-prompt.ts` — 支持 agentConfig.identity
- [ ] T16: 测试 — ≥ 15 个断言
  - T16.1: listAgentIds 返回配置中的 agent
  - T16.2: 无配置返回 ['default']
  - T16.3: resolveDefaultAgentId 选择 default:true
  - T16.4: 无 default 选择第一个
  - T16.5: session key `agent:translator:abc` → 'translator'
  - T16.6: plain session key → 'default'
  - T16.7: resolveAgentConfig 返回正确配置
  - T16.8: model fallback 到 defaults
  - T16.9: identity 注入到 system prompt

## I3 — Security Audit

- [ ] T17: 编写 Delta Spec — `specs/security-audit/spec.md`
- [ ] T18: 新建 `security/audit-types.ts` — SecurityAuditFinding, SecurityAuditReport 类型
- [ ] T19: 新建 `security/audit.ts` — runSecurityAudit() 框架
- [ ] T20: 实现 6 类检查：sandbox/secrets/tools/content/proxy/workspace
- [ ] T21: 修改 `index.ts` — GET /api/security-audit 路由
- [ ] T22: 测试 — ≥ 15 个断言
  - T22.1: 空配置产生预期 findings
  - T22.2: sandbox 启用时无 sandbox.disabled
  - T22.3: sandbox 禁用时有 warn
  - T22.4: 无 deny 规则时 tools.dangerous_unrestricted
  - T22.5: summary 统计正确
  - T22.6: finding 结构完整 (checkId/severity/title/detail)
  - T22.7: remediation 存在于 warn/critical findings

## I4 — Cache Trace

- [ ] T23: 编写 Delta Spec — `specs/cache-trace/spec.md`
- [ ] T24: 新建 `diagnostics/redact.ts` — sanitizeDiagnosticPayload 脱敏
- [ ] T25: 新建 `diagnostics/queued-writer.ts` — QueuedFileWriter 异步写入
- [ ] T26: 新建 `diagnostics/cache-trace.ts` — createCacheTrace + 7 阶段
- [ ] T27: 消息摘要（SHA-256 fingerprint + digest）
- [ ] T28: 环境变量开关 EQUALITY_CACHE_TRACE
- [ ] T29: 测试 — ≥ 15 个断言
  - T29.1: 默认 disabled 返回 null
  - T29.2: env=1 启用返回 CacheTrace
  - T29.3: recordStage 产生正确事件
  - T29.4: seq 递增
  - T29.5: messageCount/messageRoles 正确
  - T29.6: messagesDigest 是 64 字符 hex
  - T29.7: sensitive data 被脱敏
  - T29.8: custom filePath 生效
  - T29.9: QueuedFileWriter 异步写入

## 统计

- 预计总断言数：≥ 60（I1:15 + I2:15 + I3:15 + I4:15）
- tsc --noEmit：零错误
- 现有测试：343 个不受影响
