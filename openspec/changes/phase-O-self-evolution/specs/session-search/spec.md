# Delta Spec: 历史会话搜索

---

## ADDED Requirements

### Requirement: 会话全文索引数据库

系统 MUST 维护一个 SQLite FTS5 数据库用于全文搜索历史会话。

- 数据库位置：`{dataDir}/session-search.db`
- 表结构：`session_turns(session_key, turn_index, role, content_text)`
- FTS5 索引：`session_turns_fts(content_text)` 使用 `unicode61` tokenizer
- WAL 模式启用

#### Scenario: 数据库初始化
- GIVEN session-search.db 不存在
- WHEN 应用启动并首次需要索引
- THEN 自动创建数据库和表结构
- AND WAL 模式启用

### Requirement: 增量索引

每轮 toolLoop 结束后 MUST 将新消息增量写入索引。

- afterTurn hook 中执行索引
- 仅索引当前轮新增的 user/assistant 消息
- tool_call/tool_result 内容折叠为单行摘要
- 索引操作 MUST NOT 阻塞主工具循环（使用 fire-and-forget 或 nextTick）

#### Scenario: 正常索引
- GIVEN 第 5 轮 toolLoop 完成
- AND 本轮新增 1 条 user message + 1 条 assistant message
- WHEN afterTurn 执行
- THEN 2 条记录写入 session_turns 表
- AND FTS5 索引自动更新

#### Scenario: tool_result 折叠
- GIVEN tool_result content = "... 500 行文件内容 ..."
- WHEN 索引该消息
- THEN content_text 截断为前 200 字符 + "...(truncated)"

#### Scenario: 索引不阻塞
- GIVEN afterTurn 索引执行
- WHEN 写入耗时 50ms
- THEN 下一轮 LLM 调用不等待索引完成

### Requirement: session_search 工具

系统 MUST 提供 `session_search` 内置工具供 Agent 搜索历史会话。

工具定义：
```
name: session_search
description: Search past conversation sessions for relevant context using full-text search.
parameters:
  query: string (required) — Search query
  limit: number (optional, default 10) — Max results
```

返回格式：
```
Session: {title} ({date})
Turn {index}: {role}: {snippet with highlights}
---
```

#### Scenario: 基本搜索
- GIVEN 历史会话包含 "部署到 k8s 集群" 的对话
- WHEN Agent 调用 session_search({ query: "k8s 部署" })
- THEN 返回包含该会话的匹配片段
- AND 片段中搜索词高亮（用 `**` 包裹）

#### Scenario: 无结果
- GIVEN 无历史会话包含 "量子计算"
- WHEN Agent 调用 session_search({ query: "量子计算" })
- THEN 返回 "No matching sessions found."

#### Scenario: limit 限制
- GIVEN 有 50 条匹配结果
- WHEN Agent 调用 session_search({ query: "bug", limit: 5 })
- THEN 仅返回 top 5 结果（按 BM25 排名）

### Requirement: system prompt 中的搜索指引

system prompt MUST 包含何时使用 session_search 的指引。

- 用户提及 "上次"、"之前"、"以前做过" 等关键词时 SHOULD 搜索
- 用户问题缺少上下文但似乎是延续性任务时 SHOULD 搜索
- 不应每轮都搜索，仅在有明确信号时搜索

#### Scenario: "上次" 触发搜索指引
- GIVEN 用户说 "上次我们讨论的那个 API 设计"
- WHEN Agent 处理消息
- THEN Agent 先调用 session_search 搜索 "API 设计"
- AND 将搜索结果用于回复

---

## MODIFIED Requirements

### Requirement: afterTurn hook

default-engine.ts 的 afterTurn 逻辑 MUST 扩展为同时执行索引写入。

（原有 afterTurn 逻辑不变，新增并行索引写入）
