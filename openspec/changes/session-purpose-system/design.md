# Design: Session Purpose System

## 架构决策

### D1: Purpose 存储在 Session 对象内存中
Purpose 是会话级数据，直接存储在 `Session` 接口的 `purpose` 字段中。不持久化到磁盘（会话恢复时从历史消息重新推断即可）。

### D2: Purpose 推断用纯文本匹配，不调用 LLM
调用 LLM 推断 purpose 会增加延迟和成本。使用正则 + 关键词匹配足够处理 90% 场景。复杂场景留给用户手动设置（后续迭代）。

### D3: 行为准则内置到 system-prompt.ts
SOUL.md 的核心内容（5 条准则）直接硬编码到 `buildSystemPrompt()`。好处：
- 不依赖外部文件存在
- 不可被意外删除/修改
- 减少 I/O

### D4: AGENTS.md 模板更新
移除 AGENTS.md 中对 SOUL.md / USER.md / IDENTITY.md 的引用，更新为引导使用 memory 工具。

## 受影响的文件

| 文件 | 变更 |
|------|------|
| `packages/core/src/session/types.ts` | 新增 `SessionPurpose` 接口和 `purpose` 字段 |
| `packages/core/src/agent/workspace-bootstrap.ts` | 移除 SOUL/IDENTITY/USER 模板，更新 BOOTSTRAP/AGENTS 模板，缩减文件列表 |
| `packages/core/src/agent/system-prompt.ts` | 新增行为准则段落 + purpose 注入 |
| `packages/core/src/agent/purpose.ts` | **新建** — inferPurpose() + formatPurposeBlock() |
| `packages/core/src/context/default-engine.ts` | assemble 时注入 purpose |
| `packages/core/src/__tests__/phase-G.test.ts` | 更新测试适配新文件列表 |
| `packages/core/src/__tests__/purpose.test.ts` | **新建** — Purpose 推断和注入测试 |

## 数据流

```
用户发送消息
    ↓
default-engine.ts assemble()
    ↓ session.purpose 为空？
    ↓ 是 → inferPurpose(userMessage) → 设置 session.purpose
    ↓
buildSystemPrompt({
    bootstrapBlock,     ← 只含 AGENTS.md / TOOLS.md（或 BOOTSTRAP.md）
    purposeBlock,       ← 新增：formatPurposeBlock(session.purpose)
})
    ↓
system prompt 输出
```
