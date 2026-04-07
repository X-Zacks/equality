# Delta Spec: Bootstrap — 启动阶段日志

> 新增领域。借鉴 claw-code bootstrap_graph.py，提供分阶段启动日志和诊断能力。

---

## ADDED Requirements

### Requirement: Bootstrap Graph [借鉴 claw-code bootstrap_graph.py]

系统 SHALL 提供 `BootstrapGraph` 类，追踪和报告 Equality 的启动过程。

借鉴 claw-code 的 7 阶段启动图（`build_bootstrap_graph()`），但适配 Equality 的实际启动流程。

BootstrapStage MUST 包含：
- `name: string` — 阶段名称
- `order: number` — 执行顺序
- `status: 'pending' | 'running' | 'completed' | 'failed'`
- `durationMs?: number` — 耗时
- `detail?: string` — 补充说明
- `error?: string` — 错误信息（仅 failed 时）

预定义 7 个启动阶段：

| 阶段 | 名称 | 说明 | claw-code 对应 |
|------|------|------|---------------|
| 0 | `prefetch` | 预加载配置和缓存 | top-level prefetch |
| 1 | `env-guards` | 环境检查（Node 版本、工具链） | environment guards |
| 2 | `config-load` | 加载 equality.config + 模型配置 | setup + load |
| 3 | `tool-registry` | 注册内建工具 + 插件工具 + MCP | commands/agents parallel load |
| 4 | `skill-loader` | 加载 Skill 定义 | deferred init [claw-code: DeferredInit] |
| 5 | `code-indexer` | 项目代码索引（增量） | (Equality 独有) |
| 6 | `gateway-ready` | HTTP/WS 服务就绪 | query engine submit loop |

BootstrapGraph MUST 提供：
- `start(name)` — 标记阶段开始
- `complete(name)` — 标记阶段完成
- `fail(name, error)` — 标记阶段失败
- `toMarkdown()` — [claw-code: as_markdown()] 生成 Markdown 报告
- `toLogLines()` — 生成结构化日志行

#### Scenario: 正常启动
- GIVEN 所有 7 个阶段
- WHEN 依次 start → complete
- THEN 所有阶段 status = 'completed'
- AND 每个阶段的 durationMs > 0

#### Scenario: 阶段失败但不阻塞后续（降级模式）
- GIVEN `code-indexer` 阶段失败（如磁盘空间不足）
- WHEN `fail('code-indexer', 'disk full')` 被调用
- THEN `code-indexer` status = 'failed'
- AND `gateway-ready` 仍然可以 start 和 complete
- AND codebase_search 工具返回降级提示

#### Scenario: Markdown 报告
- GIVEN 启动完成（部分阶段失败）
- WHEN `toMarkdown()` 被调用
- THEN 返回包含 `# Bootstrap Report` 标题
- AND 每个阶段一行，含状态 emoji 和耗时
- AND 失败阶段包含错误信息

#### Scenario: 结构化日志
- GIVEN 阶段 `tool-registry` 完成，耗时 150ms
- WHEN `toLogLines()` 被调用
- THEN 包含 `[bootstrap] tool-registry completed in 150ms`

---

### Requirement: 启动诊断 API [借鉴 claw-code SetupReport]

系统 SHALL 通过 Gateway 暴露启动诊断信息。

借鉴 claw-code `SetupReport.as_markdown()` 模式：

```
GET /diagnostics/bootstrap → {
  stages: BootstrapStage[],
  totalDurationMs: number,
  failedStages: string[],
  degradedFeatures: string[]
}
```

#### Scenario: 健康启动
- GIVEN 所有阶段成功
- WHEN `GET /diagnostics/bootstrap`
- THEN failedStages = []
- AND degradedFeatures = []

#### Scenario: 降级启动
- GIVEN code-indexer 阶段失败
- WHEN `GET /diagnostics/bootstrap`
- THEN failedStages = ['code-indexer']
- AND degradedFeatures = ['codebase_search']
