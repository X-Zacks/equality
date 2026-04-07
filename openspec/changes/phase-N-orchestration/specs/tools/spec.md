# Delta Spec: Tools — codebase_search 工具 + 权限上下文

> 修改 `openspec/specs/tools/spec.md`。新增内建工具 + 权限前缀匹配。

---

## ADDED Requirements

### Requirement: codebase_search 内建工具

系统 SHALL 提供 `codebase_search` 作为内建工具，允许 Agent 搜索项目代码库。

工具定义：
```typescript
{
  name: 'codebase_search',
  description: '搜索项目代码库中的相关代码片段。使用语义+关键词+符号混合检索。适用于查找函数实现、类定义、配置位置等。',
  parameters: {
    query: { type: 'string', description: '搜索查询（自然语言或代码片段）', required: true },
    file_pattern: { type: 'string', description: '文件 glob 过滤（如 "src/**/*.ts"）', required: false },
    max_results: { type: 'number', description: '最大返回数量（默认 10）', required: false },
  }
}
```

返回格式：
```
Found {n} results for "{query}":

1. {filePath}:{startLine}-{endLine} (score: {score})
   Symbols: {symbols}
   ```{language}
   {content}
   ```

2. ...
```

#### Scenario: 正常搜索
- GIVEN 项目已索引
- WHEN Agent 调用 `codebase_search({ query: "session persistence" })`
- THEN 返回相关代码片段列表
- AND 每个结果包含文件路径、行号、代码内容

#### Scenario: 带文件过滤搜索
- GIVEN Agent 调用 `codebase_search({ query: "auth", file_pattern: "src/auth/**" })`
- THEN 只返回 `src/auth/` 目录下的结果

#### Scenario: 项目未索引
- GIVEN 项目尚未建立索引
- WHEN Agent 调用 `codebase_search`
- THEN 返回提示："项目索引尚未建立，正在后台构建中..."
- AND 触发后台索引构建

---

### Requirement: 工具权限上下文 [借鉴 claw-code permissions.py]

系统 SHALL 提供 `ToolPermissionContext` 用于基于名称和前缀的工具访问控制。

借鉴 claw-code 的 `ToolPermissionContext` 设计：

```typescript
interface ToolPermissionContext {
  denyNames: ReadonlySet<string>        // 精确名称黑名单
  denyPrefixes: readonly string[]        // 前缀黑名单
}
```

`isToolBlocked(name, ctx)` 判断逻辑：
1. 先检查 `denyNames`（精确匹配，大小写不敏感）
2. 再检查 `denyPrefixes`（前缀匹配，大小写不敏感）
3. 任一命中即返回 true

#### Scenario: 精确名称阻止
- GIVEN denyNames = ['bash', 'write_file']
- WHEN `isToolBlocked('bash', ctx)` 被调用
- THEN 返回 true

#### Scenario: 前缀阻止
- GIVEN denyPrefixes = ['subagent_']
- WHEN `isToolBlocked('subagent_spawn', ctx)` 被调用
- THEN 返回 true
- WHEN `isToolBlocked('subagent_list', ctx)` 被调用
- THEN 返回 true
- WHEN `isToolBlocked('read_file', ctx)` 被调用
- THEN 返回 false

#### Scenario: 大小写不敏感
- GIVEN denyNames = ['Bash']
- WHEN `isToolBlocked('BASH', ctx)` 被调用
- THEN 返回 true

#### Scenario: 空权限上下文
- GIVEN denyNames 和 denyPrefixes 都为空
- WHEN `isToolBlocked('any_tool', ctx)` 被调用
- THEN 返回 false

---

## MODIFIED Requirements

### Requirement: 工具策略管道

（原文：ToolProfilePolicy 基于 profile + allow + deny 过滤工具列表）

系统 SHALL 在现有的 allow/deny 过滤之后，增加 `ToolPermissionContext` 过滤步骤。

过滤优先级（从高到低）：
1. `allow` 白名单（如果指定，仅保留白名单中的工具）
2. `deny` 精确黑名单
3. `denyPrefixes` 前缀黑名单（新增）
4. `toolProfile` 配置文件过滤

#### Scenario: deny_prefix 与 allow 交互
- GIVEN allow = ['subagent_spawn', 'read_file']
- AND denyPrefixes = ['subagent_']
- WHEN 计算可用工具
- THEN allow 优先——'subagent_spawn' 被保留
- AND 'read_file' 被保留
- AND deny_prefix 不覆盖 allow

#### Scenario: deny_prefix 与 deny 交互
- GIVEN deny = ['bash']
- AND denyPrefixes = ['mcp_']
- WHEN 工具列表包含 ['bash', 'mcp_git', 'read_file']
- THEN 'bash' 被 deny 阻止
- AND 'mcp_git' 被 denyPrefixes 阻止
- AND 'read_file' 可用
