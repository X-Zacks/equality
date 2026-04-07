# Delta Spec: Session — Transcript Compact + Session Snapshot

> 修改 `openspec/specs/session/spec.md`。增强对话记录管理和结构化快照。

---

## ADDED Requirements

### Requirement: Transcript Compact [借鉴 claw-code transcript.py]

系统 SHALL 提供 `compactTranscript()` 函数，压缩过长的对话记录。

借鉴 claw-code `TranscriptStore.compact(keep_last=10)` 的设计：

```typescript
interface TranscriptCompactConfig {
  keepLast: number                // 保留最近 N 条消息（默认 10）
  compactThreshold: number        // 消息数超过此值触发自动 compact（默认 30）
  preserveSystemPrompt: boolean   // 是否保留 system prompt（默认 true）
}
```

行为要求：
- MUST 保留最后 `keepLast` 条消息
- MUST 当 `preserveSystemPrompt=true` 时，system prompt 永远保留（不计入 keepLast）
- SHOULD 在消息数超过 `compactThreshold` 时自动触发
- MUST 与现有 context compaction 机制协同（本功能处理消息条数，context compaction 处理 token 数）

#### Scenario: 基本 compact
- GIVEN 35 条消息，keepLast=10，compactThreshold=30
- WHEN `compactTranscript()` 被调用
- THEN 返回 10 条消息（最后 10 条）

#### Scenario: 保留 system prompt
- GIVEN 35 条消息，第 1 条是 system prompt，keepLast=10，preserveSystemPrompt=true
- WHEN `compactTranscript()` 被调用
- THEN 返回 11 条消息（system prompt + 最后 10 条）

#### Scenario: 未达阈值不触发
- GIVEN 20 条消息，compactThreshold=30
- WHEN 检查是否需要 compact
- THEN 不触发 compact（20 < 30）

#### Scenario: 空消息列表
- GIVEN 空消息列表
- WHEN `compactTranscript()` 被调用
- THEN 返回空数组

---

### Requirement: Session Snapshot [借鉴 claw-code RuntimeSession]

系统 SHALL 提供 `SessionSnapshot` 类型和 `captureSnapshot` / `restoreFromSnapshot` 函数。

借鉴 claw-code `RuntimeSession` 的全量快照概念——将 session 的完整运行时状态序列化为可持久化的结构。

SessionSnapshot MUST 包含：
- `sessionKey: string`
- `prompt: string` — 最后一条用户消息
- `manifest?: ProjectManifest` — [claw-code: PortManifest] 项目概览
- `bootstrapStages?: BootstrapStage[]` — [claw-code: SetupReport] 启动状态
- `historyLog?: HistoryEvent[]` — [claw-code: HistoryLog] 历史事件
- `toolsUsed: string[]` — 本次 session 使用过的工具
- `turnCount: number` — 对话轮次
- `tokenUsage: { input: number; output: number }` — token 消耗
- `persistedAt: number` — 快照时间

#### Scenario: 快照捕获
- GIVEN 一个活跃的 session，已有 5 轮对话
- WHEN `captureSnapshot()` 被调用
- THEN 返回 SessionSnapshot
- AND turnCount = 5
- AND tokenUsage 反映真实消耗

#### Scenario: 快照恢复
- GIVEN 一个 SessionSnapshot（JSON 格式）
- WHEN `restoreFromSnapshot()` 被调用
- THEN session 状态与快照时一致
- AND 可以继续对话

#### Scenario: 快照序列化
- GIVEN 一个 SessionSnapshot
- WHEN `JSON.stringify(snapshot)` + `JSON.parse()`
- THEN 恢复后数据一致
- AND persistedAt 类型为 number（非 Date 字符串）
